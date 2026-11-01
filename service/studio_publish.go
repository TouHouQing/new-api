package service

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioPublicationRequest struct {
	ID              string   `json:"id"`
	ProjectRevision int64    `json:"project_revision"`
	RenderJobID     string   `json:"render_job_id"`
	Platform        string   `json:"platform"`
	ConnectorID     string   `json:"connector_id"`
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	Tags            []string `json:"tags"`
	Visibility      string   `json:"visibility"`
	ScheduleAt      int64    `json:"schedule_at"`
	CoverAt         float64  `json:"cover_at"`
	CaptionLanguage string   `json:"caption_language"`
	MadeForKids     *bool    `json:"made_for_kids"`
	SyntheticMedia  *bool    `json:"synthetic_media"`
}
type StudioPublication struct {
	ID                   string                    `json:"id"`
	ProjectID            string                    `json:"project_id"`
	ProjectRevision      int64                     `json:"project_revision"`
	RenderJobID          string                    `json:"render_job_id"`
	RenderRevision       int64                     `json:"render_revision"`
	MediaID              string                    `json:"media_id"`
	SourceDigest         string                    `json:"source_digest"`
	Platform             string                    `json:"platform"`
	ConnectorID          string                    `json:"connector_id"`
	AccountID            string                    `json:"account_id"`
	AccountLabel         string                    `json:"account_label"`
	Title                string                    `json:"title"`
	Description          string                    `json:"description"`
	Tags                 []string                  `json:"tags"`
	Visibility           string                    `json:"visibility"`
	ScheduleAt           int64                     `json:"schedule_at"`
	CoverAt              float64                   `json:"cover_at"`
	Subtitles            string                    `json:"subtitles"`
	CaptionLanguage      string                    `json:"caption_language"`
	MadeForKids          *bool                     `json:"made_for_kids"`
	SyntheticMedia       *bool                     `json:"synthetic_media"`
	Fingerprint          string                    `json:"fingerprint"`
	CreationHash         string                    `json:"creation_hash"`
	ConfirmedFingerprint string                    `json:"confirmed_fingerprint,omitempty"`
	ConfirmedAt          string                    `json:"confirmed_at,omitempty"`
	CreatedAt            string                    `json:"created_at"`
	State                string                    `json:"state"`
	PackageState         string                    `json:"package_state,omitempty"`
	Verification         string                    `json:"verification"`
	Reason               string                    `json:"reason,omitempty"`
	RemoteID             string                    `json:"remote_id,omitempty"`
	RemoteVisibility     string                    `json:"remote_visibility,omitempty"`
	Packages             map[string]string         `json:"packages"`
	CoverMediaID         string                    `json:"cover_media_id,omitempty"`
	Jobs                 map[string]string         `json:"jobs"`
	Metrics              *StudioPublicationMetrics `json:"metrics,omitempty"`
	MediaIDs             []string                  `json:"mediaIds"`
}
type StudioPublicationMetrics struct {
	Provider  string  `json:"provider"`
	RemoteID  string  `json:"remote_id"`
	Source    string  `json:"source"`
	FetchedAt string  `json:"fetched_at"`
	Window    string  `json:"window"`
	Timezone  string  `json:"timezone"`
	Views     *string `json:"views"`
	Likes     *string `json:"likes"`
	Comments  *string `json:"comments"`
}
type studioPublicationReceipt struct {
	Fingerprint    string `json:"fingerprint"`
	Stage          string `json:"stage"`
	Session        string `json:"session"`
	RemoteID       string `json:"remote_id"`
	Uploaded       int64  `json:"uploaded"`
	CaptionID      string `json:"caption_id"`
	CaptionSending bool   `json:"caption_sending"`
	ThumbnailDone  bool   `json:"thumbnail_done"`
}
type studioYouTubeVideo struct {
	ID      string `json:"id"`
	Snippet struct {
		ChannelID string `json:"channelId"`
	} `json:"snippet"`
	Status struct {
		UploadStatus    string `json:"uploadStatus"`
		PrivacyStatus   string `json:"privacyStatus"`
		RejectionReason string `json:"rejectionReason"`
		FailureReason   string `json:"failureReason"`
	} `json:"status"`
	Statistics struct {
		ViewCount    *string `json:"viewCount"`
		LikeCount    *string `json:"likeCount"`
		CommentCount *string `json:"commentCount"`
	} `json:"statistics"`
}

func ListStudioPublications(actorID int, projectID string) ([]StudioPublication, error) {
	if _, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, false); err != nil {
		return nil, err
	}
	var records []model.StudioProductionRecord
	if err := model.DB.Where("project_id = ? AND kind = ?", projectID, "publication").Order("created_at DESC").Limit(100).Find(&records).Error; err != nil {
		return nil, err
	}
	result := []StudioPublication{}
	for _, record := range records {
		var value StudioPublication
		if common.Unmarshal([]byte(record.Document), &value) == nil {
			result = append(result, value)
		}
	}
	return result, nil
}
func ReadStudioPublication(actorID int, projectID, id string) (*StudioPublication, *model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(id) {
		return nil, nil, model.ErrStudioAccess
	}
	record, err := model.ReadStudioProductionRecord(actorID, id, false)
	if err != nil || record.Kind != "publication" || record.ProjectID != projectID {
		return nil, nil, model.ErrStudioAccess
	}
	var value StudioPublication
	if common.Unmarshal([]byte(record.Document), &value) != nil {
		return nil, nil, errors.New("stored publication is unavailable")
	}
	return &value, record, nil
}
func saveStudioPublication(record *model.StudioProductionRecord, value *StudioPublication) error {
	value.MediaIDs = []string{value.MediaID}
	if value.CoverMediaID != "" {
		value.MediaIDs = append(value.MediaIDs, value.CoverMediaID)
	}
	for _, id := range value.Packages {
		value.MediaIDs = append(value.MediaIDs, id)
	}
	sort.Strings(value.MediaIDs)
	raw, err := common.Marshal(value)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(raw)
	updated := model.DB.Model(&model.StudioProductionRecord{}).Where("id = ? AND revision = ? AND kind = ?", record.ID, record.Revision, "publication").Updates(map[string]any{"document": model.StudioDocument(raw), "state": value.State, "revision": record.Revision + 1, "fingerprint": hex.EncodeToString(sum[:]), "updated_at": time.Now()})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return model.ErrStudioRevision
	}
	record.Revision++
	record.Document = model.StudioDocument(raw)
	record.State = value.State
	return nil
}
func CreateStudioPublication(actorID int, projectID string, input StudioPublicationRequest) (*StudioPublication, error) {
	project, role, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil || role != "owner" {
		return nil, model.ErrStudioAccess
	}
	requestRaw, err := common.Marshal(input)
	if err != nil {
		return nil, errors.New("invalid publication request")
	}
	requestSum := sha256.Sum256(requestRaw)
	creationHash := hex.EncodeToString(requestSum[:])
	if previous, _, readErr := ReadStudioPublication(actorID, projectID, input.ID); readErr == nil {
		if previous.CreationHash == creationHash {
			return previous, nil
		}
		return nil, model.ErrStudioRevision
	}
	if !StudioIDPattern.MatchString(input.ID) || len(input.ID) > 80 || !StudioIDPattern.MatchString(input.RenderJobID) || project.Revision != input.ProjectRevision {
		return nil, model.ErrStudioRevision
	}
	if input.Platform != "youtube" && input.Platform != "douyin" && input.Platform != "xiaohongshu" && input.Platform != "bilibili" || strings.TrimSpace(input.Title) == "" || len([]rune(input.Title)) > 100 || len([]rune(input.Description)) > 5000 || len(input.Tags) > 30 || input.Visibility != "private" && input.Visibility != "unlisted" && input.Visibility != "public" || input.ScheduleAt < 0 || input.ScheduleAt > time.Now().Add(7*24*time.Hour).Unix() || math.IsNaN(input.CoverAt) || math.IsInf(input.CoverAt, 0) || input.CoverAt < 0 || len(input.CaptionLanguage) > 40 {
		return nil, errors.New("invalid publication metadata")
	}
	for _, tag := range input.Tags {
		if strings.TrimSpace(tag) == "" || len([]rune(tag)) > 50 {
			return nil, errors.New("publication tags are invalid")
		}
	}
	if len([]rune(strings.Join(input.Tags, ",")))+len(input.Tags)*2 > 500 {
		return nil, errors.New("the combined publishing tags exceed 500 characters")
	}
	if input.CaptionLanguage == "" {
		input.CaptionLanguage = "zh-Hans"
	}
	if input.ScheduleAt > 0 && input.ScheduleAt <= time.Now().Add(30*time.Second).Unix() {
		return nil, errors.New("choose a publishing time at least thirty seconds in the future")
	}
	var render model.StudioWorkflowJob
	if model.DB.Where("id = ? AND project_id = ? AND kind = ? AND status = ?", input.RenderJobID, projectID, "render", "succeeded").First(&render).Error != nil {
		return nil, errors.New("choose an actual completed render before preparing a publication")
	}
	var result struct {
		MediaID   string `json:"media_id"`
		Subtitles string `json:"subtitles"`
	}
	if err := common.Unmarshal([]byte(render.Result), &result); err != nil || !StudioIDPattern.MatchString(result.MediaID) {
		return nil, errors.New("completed render has no stored result")
	}
	media, err := GetStudioMedia(project.OwnerID, result.MediaID)
	if err != nil || media.MimeType != "video/mp4" {
		return nil, errors.New("completed render media is unavailable")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasVideo || probe.Duration <= 0 || input.CoverAt >= probe.Duration {
		return nil, errors.New("choose a cover time inside a decodable finished video")
	}
	value := &StudioPublication{ID: input.ID, ProjectID: projectID, ProjectRevision: project.Revision, RenderJobID: render.ID, RenderRevision: render.Revision, MediaID: media.MediaID, SourceDigest: media.Digest, Platform: input.Platform, ConnectorID: input.ConnectorID, Title: input.Title, Description: input.Description, Tags: input.Tags, Visibility: input.Visibility, ScheduleAt: input.ScheduleAt, CoverAt: input.CoverAt, Subtitles: result.Subtitles, CaptionLanguage: input.CaptionLanguage, MadeForKids: input.MadeForKids, SyntheticMedia: input.SyntheticMedia, CreatedAt: time.Now().UTC().Format(time.RFC3339), State: "draft", Verification: "verification_blocked", Packages: map[string]string{}, Jobs: map[string]string{}}
	if input.Platform == "youtube" && input.ConnectorID != "" {
		config, configErr := studioConnectorConfig(actorID, input.ConnectorID)
		if configErr == nil && config.Provider == "youtube" && StudioIDPattern.MatchString(config.AccountID) {
			value.AccountID, value.AccountLabel = config.AccountID, config.Label
			value.Reason = "The channel will be verified before uploading. This frozen version has not been published."
		} else {
			value.Reason = "YouTube account credentials are missing or expired."
		}
	} else {
		value.Reason = "Manual publishing packages are available. Direct publishing is not verified for this destination."
	}
	value.MediaIDs = []string{value.MediaID}
	value.CreationHash = creationHash
	raw, err := common.Marshal(value)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	value.Fingerprint = hex.EncodeToString(sum[:])
	raw, err = common.Marshal(value)
	if err != nil {
		return nil, err
	}
	record := &model.StudioProductionRecord{ID: value.ID, ProjectID: projectID, Kind: "publication", State: value.State, Revision: 1, Document: model.StudioDocument(raw), Fingerprint: value.Fingerprint}
	if _, err := model.CreateStudioProductionRecord(actorID, record); err != nil {
		return nil, err
	}
	return value, nil
}
func ConfirmStudioPublication(actorID int, projectID, id, fingerprint string, confirm bool) (*StudioPublication, error) {
	project, role, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil || role != "owner" {
		return nil, model.ErrStudioAccess
	}
	value, record, err := ReadStudioPublication(actorID, projectID, id)
	if err != nil {
		return nil, err
	}
	if !confirm || fingerprint != value.Fingerprint || project.Revision != value.ProjectRevision {
		return nil, errors.New("publication content changed; review a fresh confirmation")
	}
	if value.State == "cancelled" || value.State == "cancelled_before_publication" || value.State == "cancellation_requested" || value.State == "stopped_pending_verification" || value.State == "schedule_missed" {
		return nil, errors.New("this publication was stopped or missed its schedule; check the upload status and prepare a new version before publishing")
	}
	if value.Platform != "youtube" || value.AccountID == "" || value.MadeForKids == nil || value.SyntheticMedia == nil {
		return nil, errors.New("choose an authorized YouTube channel and the audience and synthetic-media settings")
	}
	config, err := studioConnectorConfig(actorID, value.ConnectorID)
	if err != nil || config.Provider != "youtube" || config.AccountID != value.AccountID {
		return nil, errors.New("YouTube account credentials are unavailable or the destination changed")
	}
	media, err := GetStudioMedia(project.OwnerID, value.MediaID)
	if err != nil || media.Digest != value.SourceDigest {
		return nil, errors.New("the frozen finished video is unavailable")
	}
	value.ConfirmedFingerprint = fingerprint
	value.ConfirmedAt = time.Now().UTC().Format(time.RFC3339)
	value.State = "confirmed"
	if err := saveStudioPublication(record, value); err != nil {
		return nil, err
	}
	return value, nil
}
func ValidateStudioPublish(actorID int, project *model.StudioProject, document map[string]any, operation *StudioMediaOperation) error {
	var actor model.User
	if model.DB.Select("id").Where("id = ? AND status = ?", actorID, common.UserStatusEnabled).First(&actor).Error != nil {
		return model.ErrStudioAccess
	}
	if operation == nil || !StudioIDPattern.MatchString(operation.PublishID) {
		return errors.New("select a frozen publication")
	}
	_, role, err := model.StudioProjectAccess(model.DB, actorID, project.ID, false)
	if err != nil || role != "owner" {
		return model.ErrStudioAccess
	}
	value, _, err := ReadStudioPublication(actorID, project.ID, operation.PublishID)
	if err != nil {
		return err
	}
	if operation.Action != "package" && operation.Action != "publish" && operation.Action != "status" && operation.Action != "metrics" {
		return errors.New("unsupported publishing action")
	}
	if operation.Action == "publish" && (!operation.ConfirmExternalWrite || value.ConfirmedFingerprint != value.Fingerprint || value.ConfirmedAt == "") {
		return errors.New("publishing requires confirmation of the frozen account, video and metadata")
	}
	if operation.Action == "package" || operation.Action == "publish" {
		media, err := GetStudioMedia(project.OwnerID, value.MediaID)
		if err != nil || media.Digest != value.SourceDigest {
			return errors.New("frozen publication media is unavailable")
		}
	}
	if operation.Action != "package" {
		config, err := studioConnectorConfig(actorID, value.ConnectorID)
		if err != nil || config.Provider != "youtube" || config.AccountID != value.AccountID {
			return errors.New("YouTube account credentials are unavailable or changed")
		}
	}
	return nil
}

func studioPublicationMediaID(id, suffix string) string {
	sum := sha256.Sum256([]byte(id + ":" + suffix))
	return "publication_" + hex.EncodeToString(sum[:20])
}
func studioPublicationCover(ctx context.Context, ownerID int, value *StudioPublication, workdir string) (string, error) {
	id := studioPublicationMediaID(value.ID, "cover")
	if _, err := GetStudioMedia(ownerID, id); err == nil {
		return id, nil
	}
	source, err := GetStudioMedia(ownerID, value.MediaID)
	if err != nil {
		return "", err
	}
	path, err := StudioMediaPath(source)
	if err != nil {
		return "", err
	}
	output := filepath.Join(workdir, "cover-source.jpg")
	if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-ss", fmt.Sprint(value.CoverAt), "-i", path, "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "-frames:v", "1", "-q:v", "2", output}); err != nil {
		return "", err
	}
	file, err := os.Open(output)
	if err != nil {
		return "", err
	}
	defer file.Close()
	_, err = SaveStudioMedia(ownerID, id, "image/jpeg", file)
	return id, err
}
func BuildStudioPublicationPackages(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, value *StudioPublication, record *model.StudioProductionRecord) (resultErr error) {
	workdir, err := CreateStudioCacheWorkdir("", project.OwnerID, job.ID, "publication-packages", true, nil)
	if err != nil {
		return err
	}
	defer func() {
		state := "succeeded"
		if resultErr != nil {
			state = "failed"
		}
		if err := UpdateStudioCacheWorkdir("", workdir, state, 0, StudioCacheRetentionPolicy()); err != nil {
			common.SysError("publication package cache ownership could not be finalized: " + err.Error())
		}
	}()
	media, err := GetStudioMedia(project.OwnerID, value.MediaID)
	if err != nil || media.Digest != value.SourceDigest {
		return errors.New("publication source changed")
	}
	sourcePath, err := StudioMediaPath(media)
	if err != nil {
		return err
	}
	if digest, err := studioPublicationFileDigest(sourcePath); err != nil || digest != value.SourceDigest {
		return errors.New("the stored video bytes differ from the frozen publication")
	}
	probe, err := ProbeStudioMedia(ctx, sourcePath)
	if err != nil {
		return err
	}
	coverID, err := studioPublicationCover(ctx, project.OwnerID, value, workdir)
	if err != nil {
		return err
	}
	value.CoverMediaID = coverID
	if err := LinkStudioProjectMedia(project.ID, coverID); err != nil {
		return err
	}
	type preset struct {
		Platform      string
		Width, Height int
	}
	presets := []preset{{"youtube", 1280, 720}, {"douyin", 720, 1280}, {"xiaohongshu", 720, 960}, {"bilibili", 1280, 720}}
	for index, preset := range presets {
		if existing := value.Packages[preset.Platform]; existing != "" {
			if _, err := GetStudioMedia(project.OwnerID, existing); err == nil {
				continue
			}
		}
		output := filepath.Join(workdir, "film.mp4")
		cover := filepath.Join(workdir, "cover.jpg")
		filter := fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1", preset.Width, preset.Height, preset.Width, preset.Height)
		if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-i", sourcePath, "-map", "0:v:0", "-map", "0:a?", "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", output}); err != nil {
			return err
		}
		if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-ss", fmt.Sprint(value.CoverAt), "-i", sourcePath, "-vf", filter, "-frames:v", "1", "-q:v", "2", cover}); err != nil {
			return err
		}
		videoDigest, err := studioPublicationFileDigest(output)
		if err != nil {
			return err
		}
		coverBytes, err := os.ReadFile(cover)
		if err != nil {
			return err
		}
		coverDigest, captionsDigest := sha256.Sum256(coverBytes), sha256.Sum256([]byte(value.Subtitles))
		metadata := map[string]any{"platform": preset.Platform, "title": value.Title, "description": value.Description, "tags": value.Tags, "visibility": value.Visibility, "schedule_at": value.ScheduleAt, "caption_language": value.CaptionLanguage, "made_for_kids": value.MadeForKids, "synthetic_media": value.SyntheticMedia, "delivery": "manual_upload"}
		specs := map[string]any{"preset": "Studio publishing preset; verify current account limits before uploading", "width": preset.Width, "height": preset.Height, "fit": "letterbox", "source_width": probe.Width, "source_height": probe.Height, "duration": probe.Duration, "upscaling_adds_detail": false, "video_codec": "h264", "container": "mp4", "captions_included": value.Subtitles != ""}
		manifest := map[string]any{"publication_id": value.ID, "fingerprint": value.Fingerprint, "platform": preset.Platform, "project_id": project.ID, "project_revision": value.ProjectRevision, "render_job_id": value.RenderJobID, "render_revision": value.RenderRevision, "source_media_id": value.MediaID, "source_sha256": value.SourceDigest, "video_sha256": videoDigest, "cover_sha256": hex.EncodeToString(coverDigest[:]), "subtitles_sha256": hex.EncodeToString(captionsDigest[:]), "direct_publish_verified": false}
		entries := map[string][]byte{"cover.jpg": coverBytes, "subtitles.srt": []byte(value.Subtitles)}
		for name, document := range map[string]any{"metadata.json": metadata, "specs.json": specs, "manifest.json": manifest, "source-version.json": map[string]any{"project_id": project.ID, "render_revision": value.RenderRevision, "render_job_id": value.RenderJobID}} {
			data, err := common.Marshal(document)
			if err != nil {
				return err
			}
			entries[name] = data
		}
		archivePath := filepath.Join(workdir, preset.Platform+".zip")
		archive, err := os.Create(archivePath)
		if err != nil {
			return err
		}
		writer := zip.NewWriter(archive)
		for _, name := range []string{"film.mp4", "cover.jpg", "subtitles.srt", "metadata.json", "specs.json", "manifest.json", "source-version.json"} {
			entry, err := writer.Create(name)
			if err != nil {
				archive.Close()
				return err
			}
			if name == "film.mp4" {
				file, err := os.Open(output)
				if err != nil {
					archive.Close()
					return err
				}
				_, copyErr := io.Copy(entry, file)
				file.Close()
				if copyErr != nil {
					archive.Close()
					return copyErr
				}
				continue
			}
			if _, err := entry.Write(entries[name]); err != nil {
				archive.Close()
				return err
			}
		}
		if err := writer.Close(); err != nil {
			archive.Close()
			return err
		}
		if err := archive.Close(); err != nil {
			return err
		}
		archive, err = os.Open(archivePath)
		if err != nil {
			return err
		}
		id := studioPublicationMediaID(value.ID, preset.Platform)
		_, err = SaveStudioMedia(project.OwnerID, id, "application/zip", archive)
		archive.Close()
		_ = os.Remove(archivePath)
		if err != nil {
			return err
		}
		if err := LinkStudioProjectMedia(project.ID, id); err != nil {
			return err
		}
		value.Packages[preset.Platform] = id
		value.PackageState = "building_packages"
		if value.State == "draft" || value.State == "queued_packages" || value.State == "building_packages" {
			value.State = "building_packages"
		}
		if err := saveStudioPublication(record, value); err != nil {
			return err
		}
		if err := saveStudioPublicationJobResult(job, value, (index+1)*20); err != nil {
			return err
		}
	}
	value.PackageState = "packages_ready"
	if value.State == "draft" || value.State == "queued_packages" || value.State == "building_packages" {
		value.State = "packages_ready"
	}
	value.Reason = "Four real publishing packages are ready. Manual packages do not prove direct publishing authorization."
	return saveStudioPublication(record, value)
}
func studioPublicationFileDigest(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
func saveStudioPublicationJobResult(job *model.StudioWorkflowJob, value *StudioPublication, progress int) error {
	raw, err := common.Marshal(map[string]any{"phase": value.State, "publication_id": value.ID, "remote_id": value.RemoteID, "packages": value.Packages, "verification": value.Verification})
	if err != nil {
		return err
	}
	updated := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, job.LeaseOwner).Updates(map[string]any{"result": model.StudioDocument(raw), "progress": progress})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return errors.New("publishing task lease was lost")
	}
	return nil
}
func studioPublicationReceiptPath(id string) (string, error) {
	if !StudioIDPattern.MatchString(id) {
		return "", errors.New("invalid publishing receipt")
	}
	root, err := StudioStorageRoot()
	if err != nil {
		return "", err
	}
	directory := filepath.Join(root, "publishing-receipts")
	if err := os.MkdirAll(directory, 0700); err != nil {
		return "", err
	}
	return filepath.Join(directory, id+".json"), nil
}
func studioReadPublicationReceipt(id string) (*studioPublicationReceipt, error) {
	path, err := studioPublicationReceiptPath(id)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &studioPublicationReceipt{}, nil
	}
	if err != nil || len(data) > 65536 {
		return nil, errors.New("publishing receipt could not be read")
	}
	var receipt studioPublicationReceipt
	if common.Unmarshal(data, &receipt) != nil {
		return nil, errors.New("publishing receipt is invalid")
	}
	return &receipt, nil
}
func studioSavePublicationReceipt(id string, value *studioPublicationReceipt) error {
	path, err := studioPublicationReceiptPath(id)
	if err != nil {
		return err
	}
	data, err := common.Marshal(value)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path+".tmp", data, 0600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}
func studioYouTubeEndpoint(raw string) error {
	endpoint, err := url.Parse(raw)
	if err != nil || endpoint.Scheme != "https" || endpoint.User != nil || endpoint.Fragment != "" || endpoint.Port() != "" && endpoint.Port() != "443" || endpoint.Hostname() != "www.googleapis.com" && endpoint.Hostname() != "youtube.googleapis.com" || !strings.HasPrefix(endpoint.Path, "/youtube/v3/") && !strings.HasPrefix(endpoint.Path, "/upload/youtube/v3/") {
		return errors.New("YouTube API endpoint must remain on its fixed official HTTPS origin")
	}
	return nil
}
func studioYouTubeRequest(ctx context.Context, config StudioConnectorConfig, method, endpoint, contentType string, body io.Reader, length int64, headers map[string]string) (int, http.Header, []byte, error) {
	if err := studioYouTubeEndpoint(endpoint); err != nil {
		return 0, nil, nil, err
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return 0, nil, nil, errors.New("YouTube request is invalid")
	}
	request.Header.Set("Authorization", "Bearer "+os.Getenv(config.TokenEnv))
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	request.ContentLength = length
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	base := studioConnectorHTTPClient()
	client := *base
	client.Timeout = 10 * time.Minute
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, nil, errors.New("YouTube request did not complete; inspect the saved upload session before retrying")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return response.StatusCode, response.Header.Clone(), nil, errors.New("YouTube response could not be read")
	}
	if response.StatusCode >= 400 {
		return response.StatusCode, response.Header.Clone(), data, fmt.Errorf("YouTube returned HTTP %d; check account authorization and the saved receipt", response.StatusCode)
	}
	return response.StatusCode, response.Header.Clone(), data, nil
}
func studioVerifyYouTubeAccount(ctx context.Context, config StudioConnectorConfig) error {
	_, _, data, err := studioYouTubeRequest(ctx, config, "GET", "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", "", nil, 0, nil)
	if err != nil {
		return err
	}
	var result struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if common.Unmarshal(data, &result) != nil {
		return errors.New("YouTube account response is invalid")
	}
	for _, item := range result.Items {
		if item.ID == config.AccountID {
			return nil
		}
	}
	return errors.New("the authorized YouTube channel differs from the frozen destination")
}

func studioYouTubeRemote(ctx context.Context, config StudioConnectorConfig, id string) (studioYouTubeVideo, error) {
	var result struct {
		Items []studioYouTubeVideo `json:"items"`
	}
	_, _, data, err := studioYouTubeRequest(ctx, config, "GET", "https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id="+url.QueryEscape(id), "", nil, 0, nil)
	if err != nil {
		return studioYouTubeVideo{}, err
	}
	if common.Unmarshal(data, &result) != nil || len(result.Items) != 1 || result.Items[0].ID != id || result.Items[0].Snippet.ChannelID != config.AccountID {
		return studioYouTubeVideo{}, errors.New("the remote video is unavailable or belongs to another YouTube channel")
	}
	return result.Items[0], nil
}
func studioYouTubeUploadedOffset(value string, size int64) (int64, error) {
	if value == "" {
		return 0, nil
	}
	raw, ok := strings.CutPrefix(value, "bytes=0-")
	if !ok {
		return 0, errors.New("YouTube upload range is invalid")
	}
	last, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || last < 0 || last >= size {
		return 0, errors.New("YouTube upload range exceeds the frozen file")
	}
	return last + 1, nil
}
func studioUploadYouTube(ctx context.Context, config StudioConnectorConfig, value *StudioPublication, receipt *studioPublicationReceipt, media *model.StudioMedia) (string, error) {
	if receipt.Fingerprint != "" && receipt.Fingerprint != value.Fingerprint {
		return "", errors.New("saved upload differs from the confirmed publication")
	}
	receipt.Fingerprint = value.Fingerprint
	if receipt.RemoteID != "" {
		return receipt.RemoteID, nil
	}
	if receipt.Session != "" {
		status, headers, data, err := studioYouTubeRequest(ctx, config, "PUT", receipt.Session, "", nil, 0, map[string]string{"Content-Range": fmt.Sprintf("bytes */%d", media.Size)})
		if err != nil {
			return "", err
		}
		if status == 200 || status == 201 {
			var remote studioYouTubeVideo
			if common.Unmarshal(data, &remote) != nil || !StudioIDPattern.MatchString(remote.ID) {
				return "", errors.New("completed YouTube upload has no verifiable remote ID")
			}
			receipt.RemoteID, receipt.Stage = remote.ID, "uploaded"
			receipt.Session = ""
			if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
				return "", err
			}
			return remote.ID, nil
		}
		if status != 308 {
			return "", errors.New("YouTube upload status is unresolved; do not create another upload")
		}
		offset, err := studioYouTubeUploadedOffset(headers.Get("Range"), media.Size)
		if err != nil {
			return "", err
		}
		receipt.Uploaded = offset
	} else {
		if receipt.Stage == "initializing" {
			return "", errors.New("upload initialization has an unknown result; inspect the account before creating another publication")
		}
		receipt.Stage = "initializing"
		if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
			return "", err
		}
		snippet := map[string]any{"title": value.Title, "description": value.Description, "categoryId": "22", "defaultLanguage": value.CaptionLanguage}
		if len(value.Tags) > 0 {
			snippet["tags"] = value.Tags
		}
		metadata := map[string]any{"snippet": snippet, "status": map[string]any{"privacyStatus": value.Visibility, "selfDeclaredMadeForKids": value.MadeForKids, "containsSyntheticMedia": value.SyntheticMedia}}
		raw, err := common.Marshal(metadata)
		if err != nil {
			return "", err
		}
		status, headers, _, err := studioYouTubeRequest(ctx, config, "POST", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false", "application/json; charset=UTF-8", bytes.NewReader(raw), int64(len(raw)), map[string]string{"X-Upload-Content-Type": media.MimeType, "X-Upload-Content-Length": strconv.FormatInt(media.Size, 10)})
		if err != nil {
			if status >= 400 && status < 500 {
				receipt.Stage = "rejected"
				_ = studioSavePublicationReceipt(value.ID, receipt)
			}
			return "", err
		}
		if status != 200 && status != 201 {
			return "", errors.New("YouTube did not create a resumable upload")
		}
		receipt.Session = headers.Get("Location")
		if err := studioYouTubeEndpoint(receipt.Session); err != nil {
			return "", err
		}
		receipt.Stage = "uploading"
		if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
			return "", err
		}
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return "", err
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	for receipt.Uploaded < media.Size {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		size := min(int64(4<<20), media.Size-receipt.Uploaded)
		start := receipt.Uploaded
		section := io.NewSectionReader(file, start, size)
		status, headers, data, err := studioYouTubeRequest(ctx, config, "PUT", receipt.Session, media.MimeType, section, size, map[string]string{"Content-Range": fmt.Sprintf("bytes %d-%d/%d", start, start+size-1, media.Size)})
		if err != nil {
			return "", err
		}
		if status == 200 || status == 201 {
			var remote studioYouTubeVideo
			if common.Unmarshal(data, &remote) != nil || !StudioIDPattern.MatchString(remote.ID) {
				return "", errors.New("uploaded video has no verifiable remote ID")
			}
			receipt.RemoteID, receipt.Uploaded, receipt.Stage, receipt.Session = remote.ID, media.Size, "uploaded", ""
			if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
				return "", err
			}
			return remote.ID, nil
		}
		if status != 308 {
			return "", errors.New("YouTube upload result is unresolved")
		}
		offset, err := studioYouTubeUploadedOffset(headers.Get("Range"), media.Size)
		if err != nil || offset <= start {
			return "", errors.New("YouTube did not confirm upload progress")
		}
		receipt.Uploaded = offset
		if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
			return "", err
		}
	}
	return "", errors.New("all bytes were sent but the final video ID is unresolved; query the saved upload session")
}
func studioAttachYouTubePublication(ctx context.Context, config StudioConnectorConfig, value *StudioPublication, receipt *studioPublicationReceipt, ownerID int) error {
	if !receipt.ThumbnailDone {
		cover, err := GetStudioMedia(ownerID, value.CoverMediaID)
		if err != nil {
			return err
		}
		path, err := StudioMediaPath(cover)
		if err != nil {
			return err
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		_, _, _, err = studioYouTubeRequest(ctx, config, "POST", "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?uploadType=media&videoId="+url.QueryEscape(receipt.RemoteID), cover.MimeType, file, cover.Size, nil)
		file.Close()
		if err != nil {
			return err
		}
		receipt.ThumbnailDone = true
		if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
			return err
		}
	}
	if value.Subtitles == "" || receipt.CaptionID != "" {
		return nil
	}
	captionName := "Studio " + value.ID
	if receipt.CaptionSending {
		_, _, data, err := studioYouTubeRequest(ctx, config, "GET", "https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId="+url.QueryEscape(receipt.RemoteID), "", nil, 0, nil)
		if err != nil {
			return err
		}
		var result struct {
			Items []struct {
				ID      string `json:"id"`
				Snippet struct {
					Name     string `json:"name"`
					Language string `json:"language"`
				} `json:"snippet"`
			} `json:"items"`
		}
		if common.Unmarshal(data, &result) != nil {
			return errors.New("caption status is unavailable")
		}
		for _, item := range result.Items {
			if item.Snippet.Name == captionName && item.Snippet.Language == value.CaptionLanguage {
				receipt.CaptionID = item.ID
				return studioSavePublicationReceipt(value.ID, receipt)
			}
		}
		return errors.New("caption upload result is unknown; do not submit a duplicate caption track")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	metadata, err := common.Marshal(map[string]any{"snippet": map[string]any{"videoId": receipt.RemoteID, "language": value.CaptionLanguage, "name": captionName, "isDraft": false}})
	if err != nil {
		return err
	}
	part, err := writer.CreatePart(textproto.MIMEHeader{"Content-Type": {"application/json; charset=UTF-8"}})
	if err != nil {
		return err
	}
	if _, err := part.Write(metadata); err != nil {
		return err
	}
	part, err = writer.CreatePart(textproto.MIMEHeader{"Content-Type": {"application/x-subrip; charset=UTF-8"}})
	if err != nil {
		return err
	}
	if _, err := part.Write([]byte(value.Subtitles)); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	receipt.CaptionSending = true
	if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
		return err
	}
	status, _, data, err := studioYouTubeRequest(ctx, config, "POST", "https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart", "multipart/related; boundary="+writer.Boundary(), bytes.NewReader(body.Bytes()), int64(body.Len()), nil)
	if err != nil {
		// A definite provider rejection created no track. A lost response keeps
		// this flag set, forcing a read before any retry of the external write.
		if status >= 400 && status < 500 {
			receipt.CaptionSending = false
			if saveErr := studioSavePublicationReceipt(value.ID, receipt); saveErr != nil {
				return saveErr
			}
		}
		return err
	}
	var result struct {
		ID string `json:"id"`
	}
	if common.Unmarshal(data, &result) != nil || result.ID == "" {
		return errors.New("caption upload has no verifiable result")
	}
	receipt.CaptionID = result.ID
	return studioSavePublicationReceipt(value.ID, receipt)
}
func RunStudioPublish(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) (resultErr error) {
	if err := ValidateStudioPublish(job.UserID, project, plan.Document, plan.Operation); err != nil {
		if plan.Operation != nil && job.UserID == project.OwnerID {
			if value, record, readErr := ReadStudioPublication(job.UserID, project.ID, plan.Operation.PublishID); readErr == nil {
				value.State = "verification_blocked"
				value.Reason = err.Error()
				_ = saveStudioPublication(record, value)
			}
		}
		return err
	}
	value, record, err := ReadStudioPublication(job.UserID, project.ID, plan.Operation.PublishID)
	if err != nil {
		return err
	}
	// Different actions share one private resumable receipt. A worker claims its
	// queue lease before this check, so two instances cannot both pass it for
	// the same publication and write or replay that receipt concurrently.
	var active []model.StudioWorkflowJob
	if err := model.DB.Where("project_id = ? AND kind = ? AND id <> ? AND lease_until > ? AND lease_owner <> ?", project.ID, "publish", job.ID, time.Now().Unix(), "").Find(&active).Error; err != nil {
		return err
	}
	for _, other := range active {
		var frozen StudioWorkflowPlan
		if common.Unmarshal([]byte(other.Plan), &frozen) == nil && frozen.Operation != nil && frozen.Operation.PublishID == value.ID {
			return errors.New("another publishing action is still active for this version; wait for it to finish")
		}
	}
	if plan.Operation.Action == "package" {
		if err := BuildStudioPublicationPackages(ctx, job, project, value, record); err != nil {
			return err
		}
		return saveStudioPublicationJobResult(job, value, 100)
	}
	config, err := studioConnectorConfig(job.UserID, value.ConnectorID)
	if err != nil {
		return err
	}
	if plan.Operation.Action == "publish" && value.ScheduleAt > 0 && time.Now().Unix()-value.ScheduleAt > 15*60 && value.RemoteID == "" {
		value.State = "schedule_missed"
		value.Reason = "The planned publishing time was missed. Prepare and confirm a new schedule before uploading."
		_ = saveStudioPublication(record, value)
		return errors.New(value.Reason)
	}
	if err := studioVerifyYouTubeAccount(ctx, config); err != nil {
		value.State = "verification_blocked"
		value.Reason = "YouTube account authorization could not be verified."
		_ = saveStudioPublication(record, value)
		return err
	}
	receipt, err := studioReadPublicationReceipt(value.ID)
	if err != nil {
		return err
	}
	if plan.Operation.Action == "publish" {
		media, err := GetStudioMedia(project.OwnerID, value.MediaID)
		if err != nil {
			return err
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return err
		}
		if digest, err := studioPublicationFileDigest(path); err != nil || digest != value.SourceDigest {
			return errors.New("the stored video bytes differ from the confirmed publication")
		}
		workdir, err := CreateStudioCacheWorkdir("", project.OwnerID, job.ID, "publication-cover", true, nil)
		if err != nil {
			return err
		}
		defer func() {
			state := "succeeded"
			if resultErr != nil {
				state = "failed"
			}
			if value.State == "uncertain" || ctx.Err() != nil {
				state = "uncertain"
			}
			if err := UpdateStudioCacheWorkdir("", workdir, state, 0, StudioCacheRetentionPolicy()); err != nil {
				common.SysError("publication cover cache ownership could not be finalized: " + err.Error())
			}
		}()
		coverID, err := studioPublicationCover(ctx, project.OwnerID, value, workdir)
		if err != nil {
			return err
		}
		value.CoverMediaID = coverID
		if err := LinkStudioProjectMedia(project.ID, coverID); err != nil {
			return err
		}
		remoteID, err := studioUploadYouTube(ctx, config, value, receipt, media)
		if err != nil {
			if receipt.Stage == "rejected" {
				value.State = "provider_rejected"
				value.Reason = "YouTube rejected this upload before video bytes were sent. Review authorization or prepare corrected metadata."
				_ = saveStudioPublication(record, value)
				return err
			}
			value.State = "uncertain"
			value.Reason = "The upload result is unresolved. A retry must query the saved session; it must not start a second upload."
			_ = saveStudioPublication(record, value)
			_ = model.DB.Model(job).Update("status", "uncertain").Error
			return err
		}
		value.RemoteID = remoteID
		value.State = "uploaded"
		value.Verification = "api_upload_observed"
		if err := saveStudioPublication(record, value); err != nil {
			return err
		}
		if err := studioAttachYouTubePublication(ctx, config, value, receipt, project.OwnerID); err != nil {
			value.State = "uploaded_incomplete"
			value.Reason = "The video exists on YouTube; cover or captions still require completion. Resume this same publication, not a new upload."
			_ = saveStudioPublication(record, value)
			return err
		}
	}
	if value.RemoteID == "" {
		value.RemoteID = receipt.RemoteID
	}
	if value.RemoteID == "" && plan.Operation.Action == "status" && receipt.Session != "" {
		media, err := GetStudioMedia(project.OwnerID, value.MediaID)
		if err != nil {
			return err
		}
		status, headers, data, err := studioYouTubeRequest(ctx, config, "PUT", receipt.Session, "", nil, 0, map[string]string{"Content-Range": fmt.Sprintf("bytes */%d", media.Size)})
		if err != nil {
			return err
		}
		if status == 308 {
			offset, err := studioYouTubeUploadedOffset(headers.Get("Range"), media.Size)
			if err != nil {
				return err
			}
			receipt.Uploaded = offset
			if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
				return err
			}
			value.State = "upload_incomplete"
			value.Reason = "YouTube confirmed a partial upload. No new video bytes were sent by this status check."
			if value.ConfirmedAt == "" {
				value.State = "cancelled_before_publication"
				value.Reason = "The local upload stopped and YouTube confirmed it was incomplete."
			}
			if err := saveStudioPublication(record, value); err != nil {
				return err
			}
			return saveStudioPublicationJobResult(job, value, 100)
		}
		if status != 200 && status != 201 {
			return errors.New("saved YouTube upload status is unresolved")
		}
		var remote studioYouTubeVideo
		if common.Unmarshal(data, &remote) != nil || !StudioIDPattern.MatchString(remote.ID) {
			return errors.New("saved upload returned no verifiable remote ID")
		}
		receipt.RemoteID, receipt.Stage, receipt.Session = remote.ID, "uploaded", ""
		value.RemoteID = remote.ID
		if err := studioSavePublicationReceipt(value.ID, receipt); err != nil {
			return err
		}
	}
	if value.RemoteID == "" {
		return errors.New("no remote video is known; resume the saved upload session first")
	}
	remote, err := studioYouTubeRemote(ctx, config, value.RemoteID)
	if err != nil {
		return err
	}
	value.RemoteVisibility = remote.Status.PrivacyStatus
	switch remote.Status.UploadStatus {
	case "processed":
		switch remote.Status.PrivacyStatus {
		case "public":
			value.State = "published"
		case "unlisted":
			value.State = "published_unlisted"
		case "private":
			value.State = "uploaded_private"
		default:
			value.State = "processing"
		}
		if value.Visibility != remote.Status.PrivacyStatus {
			value.State = "visibility_mismatch"
			value.Reason = "The provider visibility differs from the confirmed request. Review the account restrictions before changing it."
		} else {
			value.Reason = "YouTube confirmed this remote video and its visibility."
		}
	case "failed", "rejected", "deleted":
		value.State = "provider_rejected"
		value.Reason = "YouTube rejected, failed or removed this video. Inspect the provider account."
	default:
		value.State = "processing"
		value.Reason = "The upload is stored; YouTube is still processing it."
	}
	if plan.Operation.Action == "metrics" {
		value.Metrics = &StudioPublicationMetrics{Provider: "youtube", RemoteID: remote.ID, Source: "YouTube Data API v3 videos.list statistics", FetchedAt: time.Now().UTC().Format(time.RFC3339), Window: "provider lifetime counters at fetch time", Timezone: "UTC fetch timestamp; cumulative counters have no daily timezone", Views: remote.Statistics.ViewCount, Likes: remote.Statistics.LikeCount, Comments: remote.Statistics.CommentCount}
	}
	if err := saveStudioPublication(record, value); err != nil {
		return err
	}
	return saveStudioPublicationJobResult(job, value, 100)
}

func StudioPublicationCanResume(job *model.StudioWorkflowJob) bool {
	if job.Kind != "publish" {
		return false
	}
	var plan StudioWorkflowPlan
	if common.Unmarshal([]byte(job.Plan), &plan) != nil || plan.Operation == nil {
		return false
	}
	if plan.Operation.Action != "publish" {
		return true
	}
	receipt, err := studioReadPublicationReceipt(plan.Operation.PublishID)
	return err == nil && (receipt.Session != "" || receipt.RemoteID != "" || receipt.Stage == "" || receipt.Stage == "rejected")
}
func QueueStudioPublication(actorID int, projectID, id, action, requestID string) (*model.StudioWorkflowJob, error) {
	project, role, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil || role != "owner" {
		return nil, model.ErrStudioAccess
	}
	value, record, err := ReadStudioPublication(actorID, projectID, id)
	if err != nil {
		return nil, err
	}
	operation := &StudioMediaOperation{PublishID: id, Action: action, ConfirmExternalWrite: action == "publish"}
	var document map[string]any
	if common.Unmarshal([]byte(project.Document), &document) != nil {
		return nil, errors.New("project is unavailable")
	}
	if err := ValidateStudioPublish(actorID, project, document, operation); err != nil {
		return nil, err
	}
	if action == "publish" || action == "package" {
		requestID = "publication_" + id + "_" + action
	}
	if !StudioIDPattern.MatchString(requestID) {
		return nil, errors.New("publishing needs a stable request ID")
	}
	runAfter := int64(0)
	if action == "publish" && value.ScheduleAt > time.Now().Unix() {
		runAfter = value.ScheduleAt
	}
	var existing model.StudioWorkflowJob
	if model.DB.Where("user_id = ? AND request_id = ?", actorID, requestID).First(&existing).Error == nil {
		if existing.ProjectID != projectID || existing.Kind != "publish" {
			return nil, model.ErrStudioRevision
		}
		var frozen StudioWorkflowPlan
		if common.Unmarshal([]byte(existing.Plan), &frozen) != nil || frozen.Operation == nil || frozen.Operation.PublishID != id || frozen.Operation.Action != action {
			return nil, model.ErrStudioRevision
		}
		if existing.Status == "failed" || existing.Status == "paused" || existing.Status == "uncertain" {
			if existing.LeaseUntil > time.Now().Unix() || !StudioPublicationCanResume(&existing) {
				return nil, errors.New("publication result is unresolved; inspect its saved receipt before retrying")
			}
			updated := model.DB.Model(&existing).Where("id = ? AND status = ? AND lease_until <= ?", existing.ID, existing.Status, time.Now().Unix()).Updates(map[string]any{"status": "queued", "error": "", "run_after": runAfter})
			if updated.Error != nil {
				return nil, updated.Error
			}
			if updated.RowsAffected != 1 {
				return nil, model.ErrStudioRevision
			}
			existing.Status = "queued"
		}
		return &existing, nil
	}
	job, err := QueueScheduledStudioWorkflow(actorID, projectID, requestID, "publish", project.Revision, 0, runAfter, nil, nil, operation)
	if err != nil {
		return nil, err
	}
	value.Jobs[action] = job.ID
	if action == "publish" {
		value.State = "queued"
		if runAfter > 0 {
			value.State = "scheduled"
		}
	}
	if action == "package" {
		value.PackageState = "queued_packages"
		if value.State == "draft" || value.State == "verification_blocked" {
			value.State = "queued_packages"
		}
	}
	if err := saveStudioPublication(record, value); err != nil {
		return nil, err
	}
	return job, nil
}
func CancelStudioPublication(actorID int, projectID, id string) (*StudioPublication, error) {
	_, role, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil || role != "owner" {
		return nil, model.ErrStudioAccess
	}
	value, record, err := ReadStudioPublication(actorID, projectID, id)
	if err != nil {
		return nil, err
	}
	receipt, err := studioReadPublicationReceipt(value.ID)
	if err != nil {
		return nil, err
	}
	if value.RemoteID != "" || receipt.RemoteID != "" {
		return nil, errors.New("the video has already been uploaded; cancellation cannot unpublish or delete it")
	}
	running := false
	var jobs []model.StudioWorkflowJob
	if err := model.DB.Where("user_id = ? AND project_id = ? AND kind = ?", actorID, projectID, "publish").Find(&jobs).Error; err != nil {
		return nil, err
	}
	for _, job := range jobs {
		var frozen StudioWorkflowPlan
		if common.Unmarshal([]byte(job.Plan), &frozen) != nil || frozen.Operation == nil || frozen.Operation.PublishID != value.ID {
			continue
		}
		if job.Status == "running" && job.LeaseUntil > time.Now().Unix() {
			running = true
		}
		if job.Status == "queued" || job.Status == "running" || job.Status == "paused" || job.Status == "waiting" {
			if err := model.DB.Model(&job).Where("id = ? AND status = ?", job.ID, job.Status).Update("status", "cancelled").Error; err != nil {
				return nil, err
			}
		}
	}
	if running {
		value.State = "cancellation_requested"
		value.Reason = "Stopping the worker. Verify the saved upload status before treating this cancellation as complete."
	} else if receipt.Uploaded > 0 || receipt.Stage == "uploading" {
		value.State = "stopped_pending_verification"
		value.Reason = "The local task stopped. Check the saved upload session to establish whether a remote video was created."
	} else {
		value.State = "cancelled"
		value.Reason = "The scheduled local task was cancelled before any video upload."
	}
	value.ConfirmedFingerprint = ""
	value.ConfirmedAt = ""
	if err := saveStudioPublication(record, value); err != nil {
		return nil, err
	}
	return value, nil
}

type StudioPublishingAccount struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	AccountID string `json:"account_id"`
	State     string `json:"state"`
	ExpiresAt int64  `json:"expires_at"`
}

func StudioPublishingAccounts(actorID int) ([]StudioPublishingAccount, error) {
	configs, err := studioConnectorConfigs(actorID)
	if err != nil {
		return nil, err
	}
	accounts := []StudioPublishingAccount{}
	for _, config := range configs {
		if config.Provider != "youtube" {
			continue
		}
		state := "credentials_unavailable"
		if studioConnectorReady(config) && StudioIDPattern.MatchString(config.AccountID) {
			state = "configured"
		}
		accounts = append(accounts, StudioPublishingAccount{ID: config.ID, Label: config.Label, AccountID: config.AccountID, State: state, ExpiresAt: config.ExpiresAt})
	}
	return accounts, nil
}
