package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const studioCacheApplication = "new-api-studio-cache-v1"
const studioCacheManifestName = "ownership.json"
const studioCacheLockMarker = "new-api-studio-cache-retention-lock-v2\n"

type StudioCachePolicy struct {
	SuccessAge    time.Duration
	FailureAge    time.Duration
	QuarantineAge time.Duration
	LogBytes      int64
	LogFiles      int
}

func StudioCacheRetentionPolicy() StudioCachePolicy {
	policy := StudioCachePolicy{SuccessAge: 24 * time.Hour, FailureAge: 7 * 24 * time.Hour, QuarantineAge: time.Hour, LogBytes: 10 << 20, LogFiles: 7}
	for _, setting := range []struct {
		name string
		out  *time.Duration
	}{{"STUDIO_CACHE_SUCCESS_HOURS", &policy.SuccessAge}, {"STUDIO_CACHE_FAILURE_HOURS", &policy.FailureAge}, {"STUDIO_CACHE_QUARANTINE_HOURS", &policy.QuarantineAge}} {
		if value, err := strconv.Atoi(os.Getenv(setting.name)); err == nil && value >= 1 && value <= 365*24 {
			*setting.out = time.Duration(value) * time.Hour
		}
	}
	if value, err := strconv.ParseInt(os.Getenv("STUDIO_CACHE_LOG_BYTES"), 10, 64); err == nil && value >= 1024 && value <= 1<<30 {
		policy.LogBytes = value
	}
	if value, err := strconv.Atoi(os.Getenv("STUDIO_CACHE_LOG_FILES")); err == nil && value >= 1 && value <= 128 {
		policy.LogFiles = value
	}
	return policy
}

type studioCacheRootOwnership struct {
	Application string `json:"application"`
	ID          string `json:"id"`
	Path        string `json:"resolved_root"`
}

type StudioCacheOwnership struct {
	Application   string   `json:"application"`
	RootID        string   `json:"root_id"`
	ID            string   `json:"id"`
	OwnerID       int      `json:"owner_id"`
	JobID         string   `json:"job_id,omitempty"`
	Purpose       string   `json:"purpose"`
	State         string   `json:"state"`
	Rebuildable   bool     `json:"rebuildable"`
	MediaIDs      []string `json:"media_ids,omitempty"`
	CreatedAt     int64    `json:"created_at"`
	FinishedAt    int64    `json:"finished_at,omitempty"`
	LeaseUntil    int64    `json:"lease_until"`
	ExpiresAt     int64    `json:"expires_at,omitempty"`
	QuarantinedAt int64    `json:"quarantined_at,omitempty"`
}

type StudioCacheSweepResult struct {
	Quarantined  int      `json:"quarantined"`
	Restored     int      `json:"restored"`
	Removed      int      `json:"removed"`
	Retained     int      `json:"retained"`
	ReleasedSize int64    `json:"released_bytes"`
	Skipped      []string `json:"skipped"`
}

type StudioRetentionReferences struct {
	MediaIDs map[string]bool
	JobState map[string]string
	JobLease map[string]int64
}

// Conservative retention includes every production-record kind, archived
// project history, selected/unselected Takes and durable workflow receipts.
// Malformed data aborts the sweep rather than becoming permission to delete.
func CollectStudioRetentionReferences(ctx context.Context, db *gorm.DB) (*StudioRetentionReferences, error) {
	refs := &StudioRetentionReferences{MediaIDs: map[string]bool{}, JobState: map[string]string{}, JobLease: map[string]int64{}}
	for _, source := range []struct {
		model any
		cols  []string
	}{{&model.StudioProject{}, []string{"document"}}, {&model.StudioProjectVersion{}, []string{"document"}}, {&model.StudioProductionRecord{}, []string{"document"}}, {&model.StudioWorkflowJob{}, []string{"plan", "result"}}} {
		rows, err := db.WithContext(ctx).Unscoped().Model(source.model).Select(source.cols).Rows()
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			values, pointers := make([]sql.NullString, len(source.cols)), make([]any, len(source.cols))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err := rows.Scan(pointers...); err != nil {
				rows.Close()
				return nil, err
			}
			for _, item := range values {
				if !item.Valid {
					continue
				}
				raw := item.String
				if strings.TrimSpace(raw) == "" {
					continue
				}
				var value any
				if common.Unmarshal([]byte(raw), &value) != nil {
					rows.Close()
					return nil, errors.New("retention references include an unreadable document; cleanup stopped")
				}
				studioRetentionMedia(value, refs.MediaIDs)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	rows, err := db.WithContext(ctx).Model(&model.StudioProjectMediaLink{}).Select("media_id").Rows()
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		refs.MediaIDs[id] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	var jobs []model.StudioWorkflowJob
	if err := db.WithContext(ctx).Select("id", "user_id", "status", "lease_until", "result").Find(&jobs).Error; err != nil {
		return nil, err
	}
	for _, job := range jobs {
		refs.JobState[job.ID], refs.JobLease[job.ID] = job.Status, job.LeaseUntil
		if job.Status != "succeeded" && job.Status != "failed" && job.Status != "cancelled" {
			continue
		}
		var result map[string]any
		if common.Unmarshal([]byte(job.Result), &result) != nil {
			continue
		}
		for _, key := range []string{"task_id", "upstream_task_id"} {
			id, ok := result[key].(string)
			if !ok || id == "" {
				continue
			}
			var tasks []model.Task
			if err := db.WithContext(ctx).Select("status").Where("user_id = ? AND task_id = ?", job.UserID, id).Find(&tasks).Error; err != nil {
				return nil, err
			}
			if len(tasks) == 0 {
				refs.JobState[job.ID] = "uncertain"
			}
			for _, task := range tasks {
				if task.Status != model.TaskStatusSuccess && task.Status != model.TaskStatusFailure {
					refs.JobState[job.ID] = "uncertain"
				}
			}
		}
	}
	return refs, nil
}

func studioRetentionMedia(value any, ids map[string]bool) {
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			key = strings.ToLower(strings.ReplaceAll(key, "_", ""))
			if key == "mediaid" || strings.HasSuffix(key, "mediaid") {
				if id, ok := child.(string); ok && StudioIDPattern.MatchString(id) {
					ids[id] = true
				}
			}
			if strings.HasSuffix(key, "mediaids") || key == "approvedkeyimages" || key == "packages" {
				switch values := child.(type) {
				case []any:
					for _, raw := range values {
						if id, ok := raw.(string); ok && StudioIDPattern.MatchString(id) {
							ids[id] = true
						}
					}
				case map[string]any:
					for _, raw := range values {
						if id, ok := raw.(string); ok && StudioIDPattern.MatchString(id) {
							ids[id] = true
						}
					}
				}
			}
			studioRetentionMedia(child, ids)
		}
	case []any:
		for _, child := range item {
			studioRetentionMedia(child, ids)
		}
	}
}

func studioCachePathEqual(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

// OpenRoot enforces containment during rename/remove as well as during checking.
// Existing unknown directories are never adopted as application caches.
func openStudioOwnedCache(path string, create bool) (*os.Root, *studioCacheRootOwnership, error) {
	if path == "" {
		path = os.Getenv("STUDIO_CACHE_DIR")
	}
	if path == "" {
		storage, err := StudioStorageRoot()
		if err != nil {
			return nil, nil, err
		}
		path = filepath.Join(storage, "cache")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, nil, err
	}
	// Check components rather than comparing spelling: Windows 8.3 aliases
	// legitimately resolve to a longer path without being a junction.
	for component := absolute; ; component = filepath.Dir(component) {
		info, err := os.Lstat(component)
		if err == nil && info.Mode()&os.ModeSymlink != 0 {
			return nil, nil, errors.New("application cache root cannot contain a symbolic link or junction")
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, nil, err
		}
		if filepath.Dir(component) == component {
			break
		}
	}
	if create {
		if err := os.MkdirAll(absolute, 0700); err != nil {
			return nil, nil, err
		}
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, nil, err
	}
	root, err := os.OpenRoot(resolved)
	if err != nil {
		return nil, nil, err
	}
	marker := &studioCacheRootOwnership{}
	raw, err := root.ReadFile("studio-cache-root.json")
	if errors.Is(err, os.ErrNotExist) && create {
		entries, readErr := os.ReadDir(resolved)
		if readErr != nil || len(entries) != 0 {
			root.Close()
			return nil, nil, errors.New("refusing to adopt an unknown nonempty cache directory")
		}
		marker = &studioCacheRootOwnership{Application: studioCacheApplication, ID: uuid.NewString(), Path: resolved}
		raw, err = common.Marshal(marker)
		if err == nil {
			file, openErr := root.OpenFile("studio-cache-root.json", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if openErr != nil {
				err = openErr
			} else {
				_, err = file.Write(raw)
				closeErr := file.Close()
				if err == nil {
					err = closeErr
				}
			}
		}
	}
	if err != nil || common.Unmarshal(raw, marker) != nil || marker.Application != studioCacheApplication || !StudioIDPattern.MatchString(marker.ID) || !studioCachePathEqual(marker.Path, resolved) {
		root.Close()
		return nil, nil, errors.New("application cache root ownership is missing or invalid")
	}
	for _, directory := range []string{"work", "quarantine", "logs"} {
		if err := root.MkdirAll(directory, 0700); err != nil {
			root.Close()
			return nil, nil, err
		}
		info, err := root.Lstat(directory)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			root.Close()
			return nil, nil, errors.New("cache directories must be real owned directories")
		}
	}
	return root, marker, nil
}

func studioCacheLock(root *os.Root) (func(), error) {
	return studioCacheLockWithin(root, 5*time.Second)
}

// The regular file stays at a stable inode. Its open handle owns the kernel
// lock, so a process crash releases exclusion without deleting a sentinel.
func studioCacheLockWithin(root *os.Root, wait time.Duration) (func(), error) {
	file, err := root.OpenFile("retention.lock", os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	created := err == nil
	if errors.Is(err, os.ErrExist) {
		info, statErr := root.Lstat("retention.lock")
		if statErr != nil || !info.Mode().IsRegular() {
			return nil, errors.New("cache lock must be a regular file without a symbolic link or junction")
		}
		file, err = root.OpenFile("retention.lock", os.O_RDWR, 0600)
	}
	if err != nil {
		return nil, fmt.Errorf("open cache kernel lock: %w", err)
	}
	owned := false
	defer func() {
		if !owned {
			_ = file.Close()
		}
	}()
	deadline := time.Now().Add(wait)
	for {
		info, statErr := file.Stat()
		pathInfo, pathErr := root.Lstat("retention.lock")
		if statErr != nil || pathErr != nil || !info.Mode().IsRegular() || !pathInfo.Mode().IsRegular() || !os.SameFile(info, pathInfo) {
			return nil, errors.New("cache lock file identity changed or contains a symbolic link or junction")
		}
		acquired, lockErr := studioTryCacheFileLock(file)
		if lockErr != nil {
			return nil, fmt.Errorf("acquire cache kernel lock: %w", lockErr)
		}
		incomplete := false
		if acquired {
			// Recheck after acquisition; never use a lock on a replaced inode.
			pathInfo, pathErr = root.Lstat("retention.lock")
			if pathErr != nil || !pathInfo.Mode().IsRegular() || !os.SameFile(info, pathInfo) {
				return nil, errors.New("cache lock file identity changed while acquiring the lock")
			}
			if _, err := file.Seek(0, io.SeekStart); err != nil {
				return nil, err
			}
			raw, err := io.ReadAll(io.LimitReader(file, int64(len(studioCacheLockMarker)+1)))
			if err != nil {
				return nil, err
			}
			if created && len(raw) == 0 {
				if _, err := file.WriteString(studioCacheLockMarker); err != nil {
					return nil, err
				}
				if err := file.Sync(); err != nil {
					return nil, err
				}
				raw = []byte(studioCacheLockMarker)
			}
			if string(raw) == studioCacheLockMarker {
				var once sync.Once
				owned = true
				return func() {
					once.Do(func() {
						_ = studioUnlockCacheFile(file)
						_ = file.Close()
					})
				}, nil
			}
			if len(raw) != 0 {
				return nil, errors.New("cache lock protocol is unknown; stop all cache users and perform an operator-reviewed v2 migration")
			}
			// A new creator may not yet have initialized its file. Give that
			// process a bounded chance, but never adopt an existing empty file.
			incomplete = true
			if err := studioUnlockCacheFile(file); err != nil {
				return nil, err
			}
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			if incomplete {
				return nil, errors.New("cache lock protocol is legacy or incomplete; stop all cache users and perform an operator-reviewed v2 migration")
			}
			return nil, errors.New("cache kernel lock is temporarily in use; retry after the current cache operation finishes")
		}
		time.Sleep(min(20*time.Millisecond, remaining))
	}
}

func writeStudioCacheOwnership(root *os.Root, directory string, value *StudioCacheOwnership) error {
	raw, err := common.Marshal(value)
	if err != nil {
		return err
	}
	name := filepath.Join(directory, studioCacheManifestName)
	if err := root.WriteFile(name+".tmp", raw, 0600); err != nil {
		return err
	}
	return root.Rename(name+".tmp", name)
}

func CreateStudioCacheWorkdir(path string, ownerID int, jobID, purpose string, rebuildable bool, mediaIDs []string) (string, error) {
	if ownerID <= 0 || jobID != "" && !StudioIDPattern.MatchString(jobID) || !StudioIDPattern.MatchString(purpose) {
		return "", errors.New("cache work requires an owner, purpose and valid job identity")
	}
	for _, id := range mediaIDs {
		if !StudioIDPattern.MatchString(id) {
			return "", errors.New("invalid retained cache media reference")
		}
	}
	root, marker, err := openStudioOwnedCache(path, true)
	if err != nil {
		return "", err
	}
	defer root.Close()
	unlock, err := studioCacheLock(root)
	if err != nil {
		return "", err
	}
	defer unlock()
	value := &StudioCacheOwnership{Application: studioCacheApplication, RootID: marker.ID, ID: uuid.NewString(), OwnerID: ownerID, JobID: jobID, Purpose: purpose, State: "active", Rebuildable: rebuildable, MediaIDs: mediaIDs, CreatedAt: time.Now().Unix(), LeaseUntil: time.Now().Add(2 * time.Minute).Unix()}
	directory := filepath.Join("work", value.ID)
	if err := root.Mkdir(directory, 0700); err != nil {
		return "", err
	}
	if err := writeStudioCacheOwnership(root, directory, value); err != nil {
		_ = root.RemoveAll(directory)
		return "", err
	}
	return filepath.Join(marker.Path, directory), nil
}

// Finish only changes cache ownership, never the durable workflow status.
// Worker heartbeats call this with state active/uncertain and leaseUntil.
func UpdateStudioCacheWorkdir(path, directory, state string, leaseUntil int64, policy StudioCachePolicy) error {
	root, marker, err := openStudioOwnedCache(path, false)
	if err != nil {
		return err
	}
	defer root.Close()
	unlock, err := studioCacheLock(root)
	if err != nil {
		return err
	}
	defer unlock()
	relative, err := filepath.Rel(marker.Path, directory)
	if err != nil || filepath.Dir(relative) != "work" || !StudioIDPattern.MatchString(filepath.Base(relative)) {
		return errors.New("cache workdir is outside the owned work root")
	}
	value, _, err := readStudioCacheOwnership(root, marker, relative)
	if err != nil {
		return err
	}
	if err := studioCacheSetState(value, state, leaseUntil, policy); err != nil {
		return err
	}
	return writeStudioCacheOwnership(root, relative, value)
}

func studioCacheSetState(value *StudioCacheOwnership, state string, leaseUntil int64, policy StudioCachePolicy) error {
	if state != "active" && state != "uncertain" && state != "succeeded" && state != "failed" && state != "cancelled" {
		return errors.New("invalid cache work state")
	}
	value.State, value.LeaseUntil = state, leaseUntil
	if state == "succeeded" || state == "failed" || state == "cancelled" {
		value.FinishedAt = time.Now().Unix()
		age := policy.FailureAge
		if state == "succeeded" {
			age = policy.SuccessAge
		}
		if age <= 0 {
			return errors.New("cache retention age must be positive")
		}
		value.ExpiresAt = time.Now().Add(age).Unix()
	} else {
		value.FinishedAt, value.ExpiresAt = 0, 0
	}
	return nil
}

// The queue worker can heartbeat/finalize all attempts for one durable job.
// This also resolves old uncertain cache attempts after that same job recovers.
func UpdateStudioCacheJob(path, jobID, state string, leaseUntil int64, policy StudioCachePolicy) (int, error) {
	if !StudioIDPattern.MatchString(jobID) {
		return 0, errors.New("invalid cache job identity")
	}
	if err := studioCacheSetState(&StudioCacheOwnership{}, state, leaseUntil, policy); err != nil {
		return 0, err
	}
	root, marker, err := openStudioOwnedCache(path, false)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	defer root.Close()
	unlock, err := studioCacheLock(root)
	if err != nil {
		return 0, err
	}
	defer unlock()
	updated := 0
	for _, phase := range []string{"work", "quarantine"} {
		dir, err := root.Open(phase)
		if err != nil {
			return updated, err
		}
		entries, err := dir.ReadDir(-1)
		dir.Close()
		if err != nil {
			return updated, err
		}
		for _, entry := range entries {
			if !entry.IsDir() || !StudioIDPattern.MatchString(entry.Name()) {
				continue
			}
			name := filepath.Join(phase, entry.Name())
			value, _, err := readStudioCacheOwnership(root, marker, name)
			if err != nil || value.JobID != jobID {
				continue
			}
			if phase == "quarantine" {
				destination := filepath.Join("work", value.ID)
				if _, err := root.Lstat(destination); !errors.Is(err, os.ErrNotExist) {
					return updated, errors.New("cache restore destination already exists")
				}
				if err := root.Rename(name, destination); err != nil {
					return updated, err
				}
				name = destination
				value.QuarantinedAt = 0
			}
			if err := studioCacheSetState(value, state, leaseUntil, policy); err != nil {
				return updated, err
			}
			if err := writeStudioCacheOwnership(root, name, value); err != nil {
				return updated, err
			}
			updated++
		}
	}
	return updated, nil
}

func readStudioCacheOwnership(root *os.Root, marker *studioCacheRootOwnership, directory string) (*StudioCacheOwnership, int64, error) {
	var size int64
	err := fs.WalkDir(root.FS(), filepath.ToSlash(directory), func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("cache contains a symbolic link or junction")
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return errors.New("cache contains a nonregular file")
		}
		if info.Mode().IsRegular() {
			size += info.Size()
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	raw, err := root.ReadFile(filepath.Join(directory, studioCacheManifestName))
	var value StudioCacheOwnership
	if err != nil || len(raw) > 1<<20 || common.Unmarshal(raw, &value) != nil || value.Application != studioCacheApplication || value.RootID != marker.ID || value.ID != filepath.Base(directory) || !StudioIDPattern.MatchString(value.ID) || value.OwnerID <= 0 && value.Purpose != "log-rotation" {
		return nil, 0, errors.New("cache entry ownership is missing or invalid")
	}
	return &value, size, nil
}

func studioCacheProtected(value *StudioCacheOwnership, refs *StudioRetentionReferences, now int64) bool {
	if !value.Rebuildable || value.State != "succeeded" && value.State != "failed" && value.State != "cancelled" || value.LeaseUntil > now || value.FinishedAt <= 0 || value.ExpiresAt <= 0 {
		return true
	}
	if value.JobID != "" {
		state, exists := refs.JobState[value.JobID]
		if !exists || state != "succeeded" && state != "failed" && state != "cancelled" || refs.JobLease[value.JobID] > now {
			return true
		}
	}
	for _, id := range value.MediaIDs {
		if refs.MediaIDs[id] {
			return true
		}
	}
	return false
}

// Sweep only touches entries created by CreateStudioCacheWorkdir. The second
// sweep re-reads all references before deleting quarantined rebuildable data.
func SweepStudioOwnedCache(ctx context.Context, path string, db *gorm.DB, now time.Time, policy StudioCachePolicy) (*StudioCacheSweepResult, error) {
	if policy.QuarantineAge <= 0 {
		return nil, errors.New("cache quarantine age must be positive")
	}
	root, marker, err := openStudioOwnedCache(path, false)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &StudioCacheSweepResult{Skipped: []string{}}, nil
		}
		return nil, err
	}
	defer root.Close()
	unlock, err := studioCacheLock(root)
	if err != nil {
		return nil, err
	}
	defer unlock()
	refs, err := CollectStudioRetentionReferences(ctx, db)
	if err != nil {
		return nil, err
	}
	result := &StudioCacheSweepResult{Skipped: []string{}}
	for _, phase := range []string{"quarantine", "work"} {
		directory, err := root.Open(phase)
		if err != nil {
			return result, err
		}
		entries, err := directory.ReadDir(-1)
		directory.Close()
		if err != nil {
			return result, err
		}
		for _, entry := range entries {
			if err := ctx.Err(); err != nil {
				return result, err
			}
			if !entry.IsDir() || !StudioIDPattern.MatchString(entry.Name()) {
				result.Skipped = append(result.Skipped, filepath.Join(phase, entry.Name()))
				continue
			}
			name := filepath.Join(phase, entry.Name())
			value, size, err := readStudioCacheOwnership(root, marker, name)
			if err != nil {
				result.Skipped = append(result.Skipped, name)
				continue
			}
			if studioCacheProtected(value, refs, now.Unix()) {
				result.Retained++
				if phase == "quarantine" {
					if _, err := root.Lstat(filepath.Join("work", value.ID)); !errors.Is(err, os.ErrNotExist) {
						result.Skipped = append(result.Skipped, name)
						continue
					}
					if err := root.Rename(name, filepath.Join("work", value.ID)); err != nil {
						result.Skipped = append(result.Skipped, name)
						continue
					}
					value.QuarantinedAt = 0
					if err := writeStudioCacheOwnership(root, filepath.Join("work", value.ID), value); err != nil {
						return result, err
					}
					result.Restored++
				}
				continue
			}
			if value.ExpiresAt > now.Unix() {
				result.Retained++
				continue
			}
			if phase == "work" {
				if _, err := root.Lstat(filepath.Join("quarantine", value.ID)); !errors.Is(err, os.ErrNotExist) {
					result.Skipped = append(result.Skipped, name)
					continue
				}
				value.QuarantinedAt = now.Unix()
				if err := writeStudioCacheOwnership(root, name, value); err != nil {
					return result, err
				}
				if err := root.Rename(name, filepath.Join("quarantine", value.ID)); err != nil {
					return result, err
				}
				result.Quarantined++
				continue
			}
			if value.QuarantinedAt == 0 {
				value.QuarantinedAt = now.Unix()
				if err := writeStudioCacheOwnership(root, name, value); err != nil {
					return result, err
				}
				continue
			}
			if now.Unix()-value.QuarantinedAt < int64(policy.QuarantineAge.Seconds()) {
				result.Retained++
				continue
			}
			if err := root.RemoveAll(name); err != nil {
				return result, err
			}
			result.Removed++
			result.ReleasedSize += size
		}
	}
	return result, nil
}

type StudioCacheLogWriter struct {
	path     string
	name     string
	policy   StudioCachePolicy
	mu       sync.Mutex
	closed   bool
	released int64
}

func NewStudioCacheLogWriter(path, component string, policy StudioCachePolicy) (*StudioCacheLogWriter, error) {
	if !StudioIDPattern.MatchString(component) || len(component) > 64 || policy.LogBytes <= 0 || policy.LogFiles < 1 || policy.LogFiles > 128 {
		return nil, errors.New("invalid owned log rotation configuration")
	}
	root, marker, err := openStudioOwnedCache(path, true)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	unlock, err := studioCacheLock(root)
	if err != nil {
		return nil, err
	}
	defer unlock()
	name := filepath.Join("logs", component+".owner")
	expected := marker.ID + ":" + component
	if raw, err := root.ReadFile(name); errors.Is(err, os.ErrNotExist) {
		directory, err := root.Open("logs")
		if err != nil {
			return nil, err
		}
		entries, err := directory.ReadDir(-1)
		directory.Close()
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if entry.Name() == component+".log" || strings.HasPrefix(entry.Name(), component+".log.") {
				return nil, errors.New("refusing to adopt unknown existing log files")
			}
		}
		file, err := root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return nil, err
		}
		_, err = io.WriteString(file, expected)
		file.Close()
		if err != nil {
			return nil, err
		}
	} else if err != nil || string(raw) != expected {
		return nil, errors.New("log ownership is invalid")
	}
	return &StudioCacheLogWriter{path: marker.Path, name: component, policy: policy}, nil
}

func (writer *StudioCacheLogWriter) Write(data []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if writer.closed {
		return 0, os.ErrClosed
	}
	root, marker, err := openStudioOwnedCache(writer.path, false)
	if err != nil {
		return 0, err
	}
	defer root.Close()
	unlock, err := studioCacheLock(root)
	if err != nil {
		return 0, err
	}
	defer unlock()
	owner, err := root.ReadFile(filepath.Join("logs", writer.name+".owner"))
	if err != nil || string(owner) != marker.ID+":"+writer.name {
		return 0, errors.New("log ownership changed")
	}
	base := filepath.Join("logs", writer.name+".log")
	for index := 1; index < 128; index++ {
		name := base + "." + strconv.Itoa(index)
		if info, err := root.Lstat(name); err == nil {
			if !info.Mode().IsRegular() {
				return 0, errors.New("rotated log path is not a regular owned file")
			}
			if index >= writer.policy.LogFiles {
				size, err := removeStudioOwnedLog(root, marker, name)
				if err != nil {
					return 0, err
				}
				writer.released += size
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return 0, err
		}
	}
	written := 0
	for len(data) > 0 {
		var size int64
		if info, err := root.Lstat(base); err == nil {
			if !info.Mode().IsRegular() {
				return written, errors.New("log path is not a regular owned file")
			}
			size = info.Size()
		} else if !errors.Is(err, os.ErrNotExist) {
			return written, err
		}
		if size >= writer.policy.LogBytes {
			oldest := base
			if writer.policy.LogFiles > 1 {
				oldest += "." + strconv.Itoa(writer.policy.LogFiles-1)
			}
			if _, err := root.Lstat(oldest); err == nil {
				size, err := removeStudioOwnedLog(root, marker, oldest)
				if err != nil {
					return written, err
				}
				writer.released += size
			}
			for index := writer.policy.LogFiles - 2; index >= 0; index-- {
				previous := base
				if index > 0 {
					previous += "." + strconv.Itoa(index)
				}
				if _, err := root.Lstat(previous); err == nil {
					if err := root.Rename(previous, base+"."+strconv.Itoa(index+1)); err != nil {
						return written, err
					}
				}
			}
			size = 0
		}
		length := min(int64(len(data)), writer.policy.LogBytes-size)
		file, err := root.OpenFile(base, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
		if err != nil {
			return written, err
		}
		count, err := file.Write(data[:length])
		closeErr := file.Close()
		written += count
		data = data[count:]
		if err != nil {
			return written, err
		}
		if closeErr != nil {
			return written, closeErr
		}
	}
	return written, nil
}

func removeStudioOwnedLog(root *os.Root, marker *studioCacheRootOwnership, name string) (int64, error) {
	info, err := root.Lstat(name)
	if err != nil || !info.Mode().IsRegular() {
		return 0, errors.New("only a regular owned log may rotate")
	}
	now := time.Now().Unix()
	value := &StudioCacheOwnership{Application: studioCacheApplication, RootID: marker.ID, ID: uuid.NewString(), Purpose: "log-rotation", State: "succeeded", Rebuildable: true, CreatedAt: now, FinishedAt: now, ExpiresAt: now, QuarantinedAt: now}
	directory := filepath.Join("quarantine", value.ID)
	if err := root.Mkdir(directory, 0700); err != nil {
		return 0, err
	}
	if err := writeStudioCacheOwnership(root, directory, value); err != nil {
		return 0, err
	}
	if err := root.Rename(name, filepath.Join(directory, "segment.log")); err != nil {
		return 0, err
	}
	if err := root.RemoveAll(directory); err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func (writer *StudioCacheLogWriter) ReleasedBytes() int64 {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	return writer.released
}

func (writer *StudioCacheLogWriter) Close() error {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	writer.closed = true
	return nil
}
