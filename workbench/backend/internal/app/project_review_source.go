package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectReviewTargetRequest struct {
	Kind               string `json:"kind"`
	CutID              string `json:"cutId,omitempty"`
	CutSHA256          string `json:"cutSha256,omitempty"`
	RenderTaskID       string `json:"renderTaskId,omitempty"`
	ArtifactID         string `json:"artifactId,omitempty"`
	AssetVersionID     string `json:"assetVersionId,omitempty"`
	RepresentationID   string `json:"representationId,omitempty"`
	ReviewID           string `json:"reviewId,omitempty"`
	ReviewTargetSHA256 string `json:"reviewTargetSha256,omitempty"`
}

func validReviewTarget(input ProjectReviewTargetRequest) bool {
	for _, id := range []string{input.CutID, input.RenderTaskID, input.ArtifactID, input.AssetVersionID, input.RepresentationID, input.ReviewID} {
		if len(id) > 36 || strings.ContainsRune(id, 0) {
			return false
		}
	}
	if input.Kind == "snapshot" {
		return input.ReviewID != "" && len(input.ReviewTargetSHA256) == 64 && input.CutID == "" && input.CutSHA256 == "" && input.RenderTaskID == "" && input.ArtifactID == "" && input.AssetVersionID == "" && input.RepresentationID == ""
	}
	if input.ReviewID != "" || input.ReviewTargetSHA256 != "" {
		return false
	}
	switch input.Kind {
	case "cut":
		return input.CutID != "" && len(input.CutSHA256) == 64 && input.RenderTaskID != "" && input.ArtifactID == "" && input.AssetVersionID == "" && input.RepresentationID == ""
	case "artifact":
		return input.ArtifactID != "" && input.CutID == "" && input.CutSHA256 == "" && input.RenderTaskID == "" && input.AssetVersionID == "" && input.RepresentationID == ""
	case "asset":
		return input.AssetVersionID != "" && input.RepresentationID != "" && input.CutID == "" && input.CutSHA256 == "" && input.RenderTaskID == "" && input.ArtifactID == ""
	}
	return false
}

func (s *Service) projectReviewSource(owner, projectID string, input ProjectReviewTargetRequest) (production.ReviewSource, *model.Resource, error) {
	source := production.ReviewSource{Version: 1, Kind: input.Kind}
	var programDuration int64
	if !validReviewTarget(input) {
		return source, nil, BadAuthRequest("请选择一个具体剪辑与成片、镜头候选，或资产表现版本；不能混用来源")
	}
	switch input.Kind {
	case "snapshot":
		row, err := s.repo.ProjectReview(owner, projectID, input.ReviewID)
		if err != nil {
			return source, nil, reviewMissing()
		}
		if row.TargetSHA256 != input.ReviewTargetSHA256 {
			return source, nil, reviewConflict("上一轮原片版本不匹配，请重新读取")
		}
		source, err = decodeReviewSource(row)
		if err != nil {
			return source, nil, err
		}
		source.OriginReviewID = row.ID
		programDuration = source.DurationMs
	case "cut":
		view, err := s.GetProjectCut(owner, projectID, input.CutID)
		if err != nil {
			return source, nil, err
		}
		if view.Cut.Archived || view.Cut.TimelineSHA256 != input.CutSHA256 {
			return source, nil, reviewConflict("剪辑版本已归档或摘要不匹配，请重新选择")
		}
		if len(view.DeliveryBlockers) > 0 {
			return source, nil, cutDeliveryPending()
		}
		task, err := s.repo.TaskForUser(owner, input.RenderTaskID)
		if err != nil {
			return source, nil, reviewMissing()
		}
		var frozen timelineRenderInput
		var output timelineRenderResult
		if task.ProjectID != projectID || task.Type != model.TaskTypeTimelineRender || task.Status != model.TaskStatusSucceeded || json.Unmarshal([]byte(task.InputJSON), &frozen) != nil || frozen.CutID != view.Cut.ID || frozen.CutSHA256 != view.Cut.TimelineSHA256 || json.Unmarshal([]byte(task.ResultJSON), &output) != nil || output.ResourceID == "" {
			return source, nil, BadAuthRequest("请选择这个固定剪辑已完成的成片，不能使用其他版本或尚未完成的导出")
		}
		source.CutID = view.Cut.ID
		source.CutSHA256 = view.Cut.TimelineSHA256
		source.RenderTaskID = task.ID
		source.ResourceID = output.ResourceID
		var document struct {
			DurationMs int64             `json:"durationMs"`
			Clips      []json.RawMessage `json:"clips"`
		}
		if json.Unmarshal(view.Timeline, &document) != nil {
			return source, nil, NewAppError(500, "固定剪辑无法读取")
		}
		programDuration = document.DurationMs
		for _, raw := range document.Clips {
			var clip renderClip
			var title struct {
				Title string `json:"title"`
			}
			if json.Unmarshal(raw, &clip) != nil || json.Unmarshal(raw, &title) != nil {
				return source, nil, NewAppError(500, "固定剪辑片段无法读取")
			}
			rate := clip.PlaybackRate
			if rate == 0 {
				rate = 1
			}
			item := production.ReviewClipSource{ID: clip.ID, Title: title.Title, Kind: clip.Kind, StartMs: clip.StartMs, DurationMs: clip.DurationMs, SourceStartMs: clip.SourceStartMs, SourceDurationMs: clip.SourceDurationMs, PlaybackRate: rate}
			if clip.DirectMedia != nil {
				item.ResourceID = clip.DirectMedia.ID
			}
			if clip.ProductionBinding != nil {
				item.ShotID = clip.ProductionBinding.ShotID
				item.ArtifactID = clip.ProductionBinding.ArtifactID
				item.AssetVersionID = clip.ProductionBinding.AssetVersionID
			}
			source.Clips = append(source.Clips, item)
		}
	case "artifact":
		artifact, err := s.repo.ReviewShotArtifact(projectID, input.ArtifactID)
		if err != nil {
			return source, nil, reviewMissing()
		}
		if artifact.Archived || artifact.ResourceID == "" || artifact.Status != "ready" && artifact.Status != "completed" && artifact.Status != "succeeded" && artifact.Status != "stale" {
			return source, nil, BadAuthRequest("请选择一个已完成且未归档的具体镜头候选")
		}
		source.ArtifactID = artifact.ID
		source.UnitID = artifact.UnitID
		source.ShotID = artifact.ShotID
		source.ShotRevisionID = artifact.RevisionID
		source.ResourceID = artifact.ResourceID
	case "asset":
		version, err := s.repo.AssetVersionForProject(projectID, input.AssetVersionID)
		if err != nil {
			return source, nil, reviewMissing()
		}
		if string(version.Status) == "archived" || string(version.Status) == "deleted" {
			return source, nil, BadAuthRequest("请选择可用的具体资产版本")
		}
		representations, err := s.repo.AssetRepresentations(version.ID)
		if err != nil {
			return source, nil, err
		}
		for _, item := range representations {
			if item.ID == input.RepresentationID {
				source.ResourceID = item.ResourceID
				source.RepresentationID = item.ID
				break
			}
		}
		if source.ResourceID == "" {
			return source, nil, BadAuthRequest("这个表现不属于所选资产版本，或还没有可审片的原片")
		}
		source.AssetID = version.AssetID
		source.AssetVersionID = version.ID
	}
	metadata, err := s.resourceAdoptionMetadata(owner, source.ResourceID)
	if err != nil {
		return source, nil, err
	}
	kind := uploadedResourceKind(metadata.MimeType)
	if metadata.Status != model.ResourceStatusReady || kind != "image" && kind != "video" && kind != "audio" || metadata.Size <= 0 || metadata.Size > 8<<30 || kind != "image" && (metadata.DurationMs <= 0 || metadata.DurationMs > 86400000) {
		return source, nil, BadAuthRequest("请选择已保存、时长可核对且不超过8GB的图片、声音或视频")
	}
	if source.Kind == "cut" && kind != "video" {
		return source, nil, BadAuthRequest("固定剪辑成片的媒体类型不正确")
	}
	// Hash the owned stream without making another media file on disk.
	resource, reader, err := s.OpenResource(owner, source.ResourceID)
	if err != nil {
		return source, nil, err
	}
	if reader == nil {
		return source, nil, NotFound("审片原片暂时无法读取")
	}
	defer reader.Close()
	if !sameReviewResource(resource, metadata) {
		return source, nil, reviewConflict("原片记录在检查期间发生变化，请重新选择")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	stop := context.AfterFunc(ctx, func() { _ = reader.Close() })
	defer stop()
	digest := sha256.New()
	count, err := io.Copy(digest, io.LimitReader(reader, resource.Size+1))
	if err != nil || ctx.Err() != nil || count != resource.Size {
		return source, nil, NewAppError(503, "审片原片未能完整读取，请保留原操作编号后重试")
	}
	source.ResourceSHA256 = hex.EncodeToString(digest.Sum(nil))
	source.ResourceETag = resource.ETag
	source.ResourceBytes = resource.Size
	source.StorageIdentity = reviewResourceIdentity(resource)
	source.ResourceKind = kind
	source.DurationMs = resource.DurationMs
	if source.Kind == "cut" {
		if programDuration <= 0 || resource.DurationMs < programDuration-100 || resource.DurationMs > programDuration+250 {
			return source, nil, reviewConflict("成片时长与固定剪辑不一致，请核对导出记录")
		}
		source.DurationMs = programDuration
	}
	if kind == "image" {
		source.DurationMs = 0
	}
	if input.Kind == "snapshot" {
		original, err := s.repo.ProjectReview(owner, projectID, input.ReviewID)
		if err != nil {
			return source, nil, err
		}
		previous, err := decodeReviewSource(original)
		if err != nil {
			return source, nil, err
		}
		previous.OriginReviewID = original.ID
		if cutSignature(previous) != cutSignature(source) {
			return source, nil, reviewConflict("旧轮原片发生变化，不能按同一原片重新送审")
		}
	}
	if _, err = production.ResolveReviewLocation(source, production.ReviewLocation{}); err != nil {
		return source, nil, BadAuthRequest("审片来源的时间范围无法核对")
	}
	for _, clip := range source.Clips {
		if _, err = production.ResolveReviewLocation(source, production.ReviewLocation{ClipID: clip.ID}); err != nil {
			return source, nil, BadAuthRequest("固定剪辑有无法定位的片段，请核对时长、原片和变速后重新导出")
		}
	}
	return source, resource, nil
}

func sameReviewResource(left, right *model.Resource) bool {
	return left != nil && right != nil && left.ID == right.ID && left.UserID == right.UserID && left.Status == model.ResourceStatusReady && right.Status == model.ResourceStatusReady && left.Size == right.Size && left.ETag == right.ETag && left.ObjectKey == right.ObjectKey && left.Bucket == right.Bucket && left.Provider == right.Provider && left.Endpoint == right.Endpoint && left.StorageSettingID == right.StorageSettingID && left.MimeType == right.MimeType && left.DurationMs == right.DurationMs
}

func reviewResourceIdentity(resource *model.Resource) string {
	return cutSignature(struct {
		Owner, ID, Provider, Endpoint, Bucket, Key, Storage, ETag, MIME string
		Bytes                                                           int64
	}{resource.UserID, resource.ID, resource.Provider, resource.Endpoint, resource.Bucket, resource.ObjectKey, resource.StorageSettingID, resource.ETag, resource.MimeType, resource.Size})
}

func verifyReviewSourceIdentity(r *repository.Repository, owner, projectID string, source production.ReviewSource, resource *model.Resource) error {
	current, err := r.LockProjectReviewResource(owner, source.ResourceID)
	if err != nil {
		return err
	}
	if !sameReviewResource(current, resource) {
		return reviewConflict("审片原片已变化，请重新选择这个版本")
	}
	if source.OriginReviewID != "" {
		origin, err := r.ProjectReview(owner, projectID, source.OriginReviewID)
		if err != nil {
			return err
		}
		previous, err := decodeReviewSource(origin)
		if err != nil {
			return err
		}
		previous.OriginReviewID = origin.ID
		if cutSignature(previous) != cutSignature(source) {
			return reviewConflict("原审片来源已变化，请重新核对")
		}
		return nil
	}
	switch source.Kind {
	case "cut":
		cut, err := r.ProjectCut(owner, projectID, source.CutID)
		if err != nil {
			return err
		}
		if cut.Archived || cut.TimelineSHA256 != source.CutSHA256 {
			return reviewConflict("固定剪辑已变化，请重新选择")
		}
		task, err := r.TaskForUser(owner, source.RenderTaskID)
		if err != nil {
			return err
		}
		var input timelineRenderInput
		var output timelineRenderResult
		if task.ProjectID != projectID || task.Type != model.TaskTypeTimelineRender || task.Status != model.TaskStatusSucceeded || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.CutID != source.CutID || input.CutSHA256 != source.CutSHA256 || json.Unmarshal([]byte(task.ResultJSON), &output) != nil || output.ResourceID != source.ResourceID {
			return reviewConflict("成片的导出记录已变化，请重新核对")
		}
	case "artifact":
		artifact, err := r.ReviewShotArtifact(projectID, source.ArtifactID)
		if err != nil {
			return err
		}
		if artifact.Archived || artifact.ResourceID != source.ResourceID || artifact.ShotID != source.ShotID || artifact.RevisionID != source.ShotRevisionID || artifact.Status != "ready" && artifact.Status != "completed" && artifact.Status != "succeeded" && artifact.Status != "stale" {
			return reviewConflict("镜头候选已变化，请重新选择")
		}
	case "asset":
		version, err := r.AssetVersionForProject(projectID, source.AssetVersionID)
		if err != nil {
			return err
		}
		if version.AssetID != source.AssetID || string(version.Status) == "archived" || string(version.Status) == "deleted" {
			return reviewConflict("资产版本已变化，请重新选择")
		}
		rows, err := r.AssetRepresentations(version.ID)
		if err != nil {
			return err
		}
		found := false
		for _, row := range rows {
			if row.ID == source.RepresentationID && row.ResourceID == source.ResourceID {
				found = true
				break
			}
		}
		if !found {
			return reviewConflict("资产表现已变化，请重新选择")
		}
	default:
		return errors.New("invalid fixed review source kind")
	}
	return nil
}
