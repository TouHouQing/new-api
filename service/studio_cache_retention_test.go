package service

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioCacheQuarantinesThenRechecksProductionReferencesBeforeDeletion(t *testing.T) {
	studioProductionFixture(t)
	root := filepath.Join(t.TempDir(), "owned-cache")
	policy, now := StudioCacheRetentionPolicy(), time.Now()
	work, err := CreateStudioCacheWorkdir(root, 1, "", "decoded-frames", true, []string{"cache-result"})
	require.NoError(t, err)
	payload := []byte(strings.Repeat("frame", 200))
	require.NoError(t, os.WriteFile(filepath.Join(work, "frame.raw"), payload, 0600))
	require.NoError(t, UpdateStudioCacheWorkdir(root, work, "succeeded", 0, policy))
	result, err := SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(25*time.Hour), policy)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Quarantined)
	assert.Zero(t, result.ReleasedSize)
	assert.NoDirExists(t, work)
	quarantined := filepath.Join(root, "quarantine", filepath.Base(work))
	assert.FileExists(t, filepath.Join(quarantined, "frame.raw"))
	_, err = SaveStudioProductionRecord(1, "", "later-analysis", "analysis", 1, map[string]any{"source_media_id": "cache-result"})
	require.NoError(t, err)
	result, err = SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(27*time.Hour), policy)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Restored)
	assert.FileExists(t, filepath.Join(work, "frame.raw"))
	require.NoError(t, model.DB.Delete(&model.StudioProductionRecord{}, "id = ?", "later-analysis").Error)
	result, err = SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(28*time.Hour), policy)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Quarantined)
	result, err = SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(30*time.Hour), policy)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Removed)
	assert.GreaterOrEqual(t, result.ReleasedSize, int64(len(payload)))
	assert.NoDirExists(t, quarantined)
}

func TestStudioCachePreservesActiveUncertainLeasesReceiptsAndFailureEvidence(t *testing.T) {
	studioProductionFixture(t)
	root := filepath.Join(t.TempDir(), "cache")
	policy, now := StudioCacheRetentionPolicy(), time.Now()
	paths := map[string]string{}
	for _, item := range []struct {
		id, jobState string
		rebuildable  bool
		lease        int64
	}{
		{"active", "running", true, 0}, {"uncertain", "uncertain", true, 0},
		{"leased", "failed", true, now.Add(20 * 24 * time.Hour).Unix()},
		{"receipt", "failed", false, 0}, {"failed", "failed", true, 0},
		{"upstream", "cancelled", true, 0},
	} {
		result := "{}"
		if item.id == "upstream" {
			result = `{"task_id":"still-running"}`
		}
		require.NoError(t, model.DB.Create(&model.StudioWorkflowJob{ID: item.id, ProjectID: "film", UserID: 1, RequestID: item.id, Kind: "render", Status: item.jobState, LeaseUntil: item.lease, Plan: "{}", Result: model.StudioDocument(result)}).Error)
		work, err := CreateStudioCacheWorkdir(root, 1, item.id, "render-intermediate", item.rebuildable, nil)
		require.NoError(t, err)
		paths[item.id] = work
		require.NoError(t, os.WriteFile(filepath.Join(work, "evidence.raw"), []byte("retained evidence"), 0600))
		require.NoError(t, UpdateStudioCacheWorkdir(root, work, "failed", 0, policy))
	}
	require.NoError(t, model.DB.Create(&model.Task{TaskID: "still-running", UserId: 1, Status: model.TaskStatusInProgress}).Error)
	first, err := SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(6*24*time.Hour), policy)
	require.NoError(t, err)
	assert.Zero(t, first.Quarantined)
	second, err := SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(8*24*time.Hour), policy)
	require.NoError(t, err)
	assert.Equal(t, 1, second.Quarantined)
	assert.NoDirExists(t, paths["failed"])
	for _, id := range []string{"active", "uncertain", "leased", "receipt", "upstream"} {
		assert.FileExists(t, filepath.Join(paths[id], "evidence.raw"))
	}
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ?", "uncertain").Update("status", "succeeded").Error)
	updated, err := UpdateStudioCacheJob(root, "uncertain", "succeeded", 0, policy)
	require.NoError(t, err)
	assert.Equal(t, 1, updated)
	resolved, err := SweepStudioOwnedCache(t.Context(), root, model.DB, now.Add(9*24*time.Hour), policy)
	require.NoError(t, err)
	assert.Equal(t, 1, resolved.Quarantined)
	assert.NoDirExists(t, paths["uncertain"])
}

func TestStudioCacheReferenceGraphIncludesAllProductionKindsAndArchivedHistory(t *testing.T) {
	studioProductionFixture(t)
	project, err := model.SaveStudioProject(1, "archived", "Archived", 0, `{"id":"archived","title":"Archived","nodes":[{"data":{"mediaId":"selected","takes":[{"mediaId":"old-take"}]}}],"edges":[]}`)
	require.NoError(t, err)
	require.NoError(t, model.DB.Delete(project).Error)
	for _, item := range []struct{ kind, document string }{
		{"analysis", `{"source_media_id":"analysis-source"}`},
		{"template", `{"sample_media_id":"sample","blueprint":{"nodes":[{"data":{"mediaId":"blueprint"}}]},"slots":[{"original_media_id":"slot"}]}`},
		{"publication", `{"media_id":"film","cover_media_id":"cover","packages":{"youtube":"package"},"mediaIds":["package-alt"]}`},
		{"campaign", `{"source":{"referenceMediaIds":["brand"]},"variants":[{"output_media_id":"variant"}]}`},
		{"review_assignment", `{"target":{"media_id":"review-old"},"revision_target":{"media_id":"review-new"}}`},
	} {
		require.NoError(t, model.DB.Create(&model.StudioProductionRecord{ID: item.kind, OwnerID: 1, Kind: item.kind, Document: model.StudioDocument(item.document), Fingerprint: strings.Repeat("a", 64), Revision: 1, State: "ready"}).Error)
	}
	refs, err := CollectStudioRetentionReferences(t.Context(), model.DB)
	require.NoError(t, err)
	for _, id := range []string{"selected", "old-take", "analysis-source", "sample", "blueprint", "slot", "film", "cover", "package", "package-alt", "brand", "variant", "review-old", "review-new"} {
		assert.True(t, refs.MediaIDs[id], id)
	}
	require.NoError(t, model.DB.Create(&model.StudioProductionRecord{ID: "broken", OwnerID: 1, Kind: "analysis", Document: "{broken", Fingerprint: strings.Repeat("b", 64), Revision: 1, State: "ready"}).Error)
	_, err = CollectStudioRetentionReferences(t.Context(), model.DB)
	require.ErrorContains(t, err, "unreadable document")
}

func TestStudioCacheRefusesUnknownOwnershipAndSymlinkEscapes(t *testing.T) {
	studioProductionFixture(t)
	parent := t.TempDir()
	unknown := filepath.Join(parent, "unknown")
	require.NoError(t, os.Mkdir(unknown, 0700))
	require.NoError(t, os.WriteFile(filepath.Join(unknown, "user-model.bin"), []byte("user model"), 0600))
	_, err := CreateStudioCacheWorkdir(unknown, 1, "", "frames", true, nil)
	require.ErrorContains(t, err, "unknown nonempty")
	assert.FileExists(t, filepath.Join(unknown, "user-model.bin"))
	root := filepath.Join(parent, "owned")
	work, err := CreateStudioCacheWorkdir(root, 1, "", "frames", true, nil)
	require.NoError(t, err)
	policy := StudioCacheRetentionPolicy()
	require.NoError(t, UpdateStudioCacheWorkdir(root, work, "succeeded", 0, policy))
	unknownChild := filepath.Join(root, "work", "not-owned")
	require.NoError(t, os.Mkdir(unknownChild, 0700))
	require.NoError(t, os.WriteFile(filepath.Join(unknownChild, "original.bin"), []byte("original"), 0600))
	outside := filepath.Join(parent, "outside")
	require.NoError(t, os.Mkdir(outside, 0700))
	require.NoError(t, os.WriteFile(filepath.Join(outside, "imported-video.mp4"), []byte("imported media"), 0600))
	t.Run("symbolic-link", func(t *testing.T) {
		if err := os.Symlink(outside, filepath.Join(work, "external")); err != nil {
			t.Skip("symbolic links unavailable on this host")
		}
		result, err := SweepStudioOwnedCache(t.Context(), root, model.DB, time.Now().Add(8*24*time.Hour), policy)
		require.NoError(t, err)
		assert.NotEmpty(t, result.Skipped)
		assert.FileExists(t, filepath.Join(outside, "imported-video.mp4"))
		assert.FileExists(t, filepath.Join(unknownChild, "original.bin"))
		assert.DirExists(t, work)
	})
	rootHandle, marker, err := openStudioOwnedCache(root, false)
	require.NoError(t, err)
	marker.ID = "forged-root"
	raw, err := common.Marshal(marker)
	require.NoError(t, err)
	require.NoError(t, rootHandle.WriteFile("studio-cache-root.json", raw, 0600))
	rootHandle.Close()
	result, err := SweepStudioOwnedCache(t.Context(), root, model.DB, time.Now().Add(30*24*time.Hour), policy)
	require.NoError(t, err)
	assert.Zero(t, result.Removed)
	assert.DirExists(t, work)
}

func TestStudioCacheLogsHaveBoundedOwnedRotationAndConfigurableDefaults(t *testing.T) {
	root := filepath.Join(t.TempDir(), "cache")
	policy := StudioCacheRetentionPolicy()
	assert.Equal(t, 24*time.Hour, policy.SuccessAge)
	assert.Equal(t, 7*24*time.Hour, policy.FailureAge)
	assert.Equal(t, int64(10<<20), policy.LogBytes)
	assert.Equal(t, 7, policy.LogFiles)
	t.Setenv("STUDIO_CACHE_SUCCESS_HOURS", "12")
	assert.Equal(t, 12*time.Hour, StudioCacheRetentionPolicy().SuccessAge)
	policy.LogBytes, policy.LogFiles = 10, 3
	writer, err := NewStudioCacheLogWriter(root, "worker", policy)
	require.NoError(t, err)
	written, err := writer.Write([]byte(strings.Repeat("x", 200)))
	require.NoError(t, err)
	assert.Equal(t, 200, written)
	assert.Equal(t, int64(170), writer.ReleasedBytes())
	files, err := filepath.Glob(filepath.Join(root, "logs", "worker.log*"))
	require.NoError(t, err)
	require.Len(t, files, 3)
	for _, name := range files {
		info, err := os.Stat(name)
		require.NoError(t, err)
		assert.LessOrEqual(t, info.Size(), int64(10))
	}
	entries, err := os.ReadDir(filepath.Join(root, "quarantine"))
	require.NoError(t, err)
	assert.Empty(t, entries)
	require.NoError(t, writer.Close())
	_, err = writer.Write([]byte("closed"))
	require.ErrorIs(t, err, os.ErrClosed)
	require.NoError(t, os.WriteFile(filepath.Join(root, "logs", "unknown.log"), []byte("unknown"), 0600))
	_, err = NewStudioCacheLogWriter(root, "unknown", policy)
	require.ErrorContains(t, err, "unknown existing log")
}

// This child is a real independent kernel-lock owner. It never opens a database
// or touches the production cache; the parent supplies its own t.TempDir root.
func TestStudioCacheKernelLockProcessHelper(t *testing.T) {
	path := os.Getenv("STUDIO_CACHE_LOCK_TEST_ROOT")
	if path == "" {
		return
	}
	root, _, err := openStudioOwnedCache(path, false)
	require.NoError(t, err)
	defer root.Close()
	unlock, err := studioCacheLock(root)
	require.NoError(t, err)
	defer unlock()
	fmt.Println("studio-cache-kernel-lock-acquired")
	if os.Getenv("STUDIO_CACHE_LOCK_TEST_MODE") == "hold" {
		_, err := io.Copy(io.Discard, os.Stdin)
		require.NoError(t, err)
	}
}

func studioCacheLockTestProcess(t *testing.T, path string) (*exec.Cmd, io.WriteCloser) {
	t.Helper()
	executable, err := os.Executable()
	require.NoError(t, err)
	command := exec.CommandContext(t.Context(), executable, "-test.run=^TestStudioCacheKernelLockProcessHelper$")
	command.Env = append(os.Environ(), "STUDIO_CACHE_LOCK_TEST_ROOT="+path, "STUDIO_CACHE_LOCK_TEST_MODE=hold")
	stdin, err := command.StdinPipe()
	require.NoError(t, err)
	stdout, err := command.StdoutPipe()
	require.NoError(t, err)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	require.NoError(t, command.Start())
	t.Cleanup(func() {
		_ = stdin.Close()
		if command.ProcessState == nil {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	})
	ready := make(chan bool, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if scanner.Text() == "studio-cache-kernel-lock-acquired" {
				ready <- true
				return
			}
		}
		ready <- false
	}()
	select {
	case acquired := <-ready:
		require.True(t, acquired, "child did not acquire its own kernel lock")
	case <-time.After(10 * time.Second):
		t.Fatal("child kernel-lock startup timed out")
	}
	return command, stdin
}

func TestStudioCacheKernelLockExcludesOtherProcessesWaitsAndRecoversAfterKilledOwner(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache")
	root, _, err := openStudioOwnedCache(path, true)
	require.NoError(t, err)
	defer root.Close()
	unlock, err := studioCacheLock(root)
	require.NoError(t, err)
	unlock()
	initial, err := root.Stat("retention.lock")
	require.NoError(t, err)
	raw, err := root.ReadFile("retention.lock")
	require.NoError(t, err)
	assert.Equal(t, studioCacheLockMarker, string(raw))

	holder, input := studioCacheLockTestProcess(t, path)
	blocked, err := studioCacheLockWithin(root, 30*time.Millisecond)
	require.ErrorContains(t, err, "temporarily in use")
	require.Nil(t, blocked)

	// Normal short contention must wait for the real owner instead of failing
	// immediately. The owner keeps holding until this parent closes its pipe.
	finished := make(chan error, 1)
	go func() {
		unlock, err := studioCacheLockWithin(root, 2*time.Second)
		if err == nil {
			unlock()
		}
		finished <- err
	}()
	select {
	case err := <-finished:
		t.Fatalf("contender returned before the owner released its kernel lock: %v", err)
	case <-time.After(75 * time.Millisecond):
	}
	require.NoError(t, input.Close())
	require.NoError(t, holder.Wait())
	select {
	case err := <-finished:
		require.NoError(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("normal kernel-lock contention did not recover after release")
	}

	crashed, _ := studioCacheLockTestProcess(t, path)
	require.NoError(t, crashed.Process.Kill())
	require.Error(t, crashed.Wait())
	executable, err := os.Executable()
	require.NoError(t, err)
	restarted := exec.CommandContext(t.Context(), executable, "-test.run=^TestStudioCacheKernelLockProcessHelper$")
	restarted.Env = append(os.Environ(), "STUDIO_CACHE_LOCK_TEST_ROOT="+path, "STUDIO_CACHE_LOCK_TEST_MODE=once")
	output, err := restarted.CombinedOutput()
	require.NoError(t, err, "%s", output)
	assert.Contains(t, string(output), "studio-cache-kernel-lock-acquired")
	final, err := root.Stat("retention.lock")
	require.NoError(t, err)
	assert.True(t, os.SameFile(initial, final), "unlock and crash recovery must not replace or unlink the lock inode")
	raw, err = root.ReadFile("retention.lock")
	require.NoError(t, err)
	assert.Equal(t, studioCacheLockMarker, string(raw))
}

func TestStudioCacheKernelLockRejectsLegacyUnknownAndSymlinkFiles(t *testing.T) {
	for _, contents := range []string{"", "unknown", "new-api-studio-cache-retention-lock-v1\n", studioCacheLockMarker + "extra"} {
		t.Run(fmt.Sprintf("bytes-%d", len(contents)), func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "cache")
			root, _, err := openStudioOwnedCache(path, true)
			require.NoError(t, err)
			defer root.Close()
			require.NoError(t, root.WriteFile("retention.lock", []byte(contents), 0600))
			unlock, err := studioCacheLockWithin(root, 25*time.Millisecond)
			require.ErrorContains(t, err, "operator-reviewed v2 migration")
			require.Nil(t, unlock)
			retained, err := root.ReadFile("retention.lock")
			require.NoError(t, err)
			assert.Equal(t, contents, string(retained), "unknown and legacy contents must remain intact")
		})
	}
	t.Run("symbolic-link", func(t *testing.T) {
		parent := t.TempDir()
		root, _, err := openStudioOwnedCache(filepath.Join(parent, "cache"), true)
		require.NoError(t, err)
		defer root.Close()
		outside := filepath.Join(parent, "outside.lock")
		require.NoError(t, os.WriteFile(outside, []byte(studioCacheLockMarker), 0600))
		if err := os.Symlink(outside, filepath.Join(parent, "cache", "retention.lock")); err != nil {
			t.Skip("symbolic links unavailable on this host")
		}
		unlock, err := studioCacheLockWithin(root, 0)
		require.Error(t, err)
		require.Nil(t, unlock)
		raw, err := os.ReadFile(outside)
		require.NoError(t, err)
		assert.Equal(t, studioCacheLockMarker, string(raw))
	})
}
