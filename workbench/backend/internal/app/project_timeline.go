package app

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

type ProjectTimelineView struct {
	OriginCutID      string          `json:"-"`
	DeliveryBlockers []string        `json:"deliveryBlockers,omitempty"`
	Revision         int64           `json:"revision"`
	Timeline         json.RawMessage `json:"timeline"`
	Exists           bool            `json:"exists"`
	UpdatedAt        *time.Time      `json:"updatedAt,omitempty"`
}
type SaveProjectTimelineRequest struct {
	ExpectedRevision int64           `json:"expectedRevision"`
	Timeline         json.RawMessage `json:"timeline"`
}

func (s *Service) GetProjectTimeline(userID, projectID string) (ProjectTimelineView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectTimelineView{}, err
	}
	stored, err := s.repo.ProjectTimeline(userID, projectID)
	if err == nil {
		return s.timelineOriginView(userID, projectID, stored.OriginCutID, ProjectTimelineView{Revision: stored.Revision, Timeline: json.RawMessage(stored.PayloadJSON), Exists: true, UpdatedAt: &stored.UpdatedAt})
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectTimelineView{}, err
	}
	// Early import receipts stored the cut in their linked canvas. Read it
	// until the first native project save; never overwrite an existing cut.
	if receipt, err := s.repo.ProductionImportForProject(userID, projectID); err == nil {
		canvas, err := s.repo.CanvasProjectForUser(userID, receipt.CanvasID)
		if err != nil {
			return ProjectTimelineView{}, err
		}
		var document map[string]json.RawMessage
		if err := json.Unmarshal([]byte(canvas.PayloadJSON), &document); err != nil {
			return ProjectTimelineView{}, err
		}
		if timeline := document["timeline"]; len(timeline) > 0 {
			clean, err := production.ValidateTimelineDocument(timeline)
			if err != nil {
				return ProjectTimelineView{}, err
			}
			return s.timelineOriginView(userID, projectID, "", ProjectTimelineView{Timeline: clean, Exists: true})
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectTimelineView{}, err
	}
	return ProjectTimelineView{Timeline: json.RawMessage(`{"version":2,"tracks":[],"clips":[],"durationMs":0}`)}, nil
}

func (s *Service) SaveProjectTimeline(userID, projectID string, req SaveProjectTimelineRequest) (ProjectTimelineView, error) {
	if req.ExpectedRevision < 0 {
		return ProjectTimelineView{}, BadAuthRequest("时间线版本无效")
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return ProjectTimelineView{}, err
	}
	clean, err := production.ValidateTimelineDocument(req.Timeline)
	if err != nil {
		return ProjectTimelineView{}, BadAuthRequest("时间线轨道、片段或时长无效")
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, clean); err != nil {
		return ProjectTimelineView{}, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	previous, err := s.repo.ProjectTimeline(userID, projectID)
	oldBytes := 0
	if err == nil {
		oldBytes = len(previous.PayloadJSON)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectTimelineView{}, err
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return ProjectTimelineView{}, err
	}
	usage, err := s.repo.UserStructuredStorageUsage(userID)
	if err != nil {
		return ProjectTimelineView{}, err
	}
	if err := validateStructuredStorageQuotaWithPolicy(usage, "canvas", false, int64(len(clean)-oldBytes), policy.Resource); err != nil {
		return ProjectTimelineView{}, err
	}
	var origins []string
	if req.ExpectedRevision == 0 {
		initial, err := s.timelineOriginView(userID, projectID, "", ProjectTimelineView{})
		if err != nil {
			return ProjectTimelineView{}, err
		}
		origins = []string{initial.OriginCutID}
	}
	stored, err := s.repo.SaveProjectTimeline(userID, projectID, string(clean), req.ExpectedRevision, origins...)
	if errors.Is(err, repository.ErrTimelineResourceChanged) {
		return ProjectTimelineView{}, timelineResourceChangedError()
	}
	if errors.Is(err, repository.ErrProjectTimelineConflict) {
		conflict := NewAppError(http.StatusConflict, "时间线已在其他窗口更新，请保留本地草稿并重新载入服务端版本")
		conflict.Reason = "project_timeline_revision_conflict"
		return ProjectTimelineView{}, conflict
	}
	if err != nil {
		return ProjectTimelineView{}, err
	}
	return s.timelineOriginView(userID, projectID, stored.OriginCutID, ProjectTimelineView{Revision: stored.Revision, Timeline: json.RawMessage(stored.PayloadJSON), Exists: true, UpdatedAt: &stored.UpdatedAt})
}

func timelineResourceChangedError() error {
	err := NewAppError(http.StatusConflict, "素材在保存前已被移除或不可用，本次编辑未应用，请重新选择素材；当前剪辑仍保留")
	err.Reason = "timeline_resource_changed"
	return err
}

func (s *Service) validateProjectTimelineMedia(userID, projectID string, raw []byte, projected ...projectReframeResolver) error {
	if err := s.validateTimelineVideoReworkOrigins(userID, projectID, raw); err != nil {
		return err
	}
	if err := s.validateTimelineReframes(userID, projectID, raw, projected...); err != nil {
		return err
	}
	if err := s.validateTimelineAnalysisMarkers(userID, projectID, raw); err != nil {
		return err
	}
	references, err := assets.CollectDocumentResourceReferences(string(raw))
	if err != nil {
		return err
	}
	for _, reference := range references {
		resource, err := s.repo.ResourceForUser(userID, reference.ResourceID)
		if err != nil {
			return BadAuthRequest("时间线引用了不存在或不属于当前账号的素材")
		}
		if resource.Status != model.ResourceStatusReady {
			return BadAuthRequest("时间线引用了尚未就绪的素材")
		}
	}
	var timeline struct {
		Clips []struct {
			Kind        string                    `json:"kind"`
			Graphic     *production.MotionGraphic `json:"graphic,omitempty"`
			DirectMedia struct {
				StorageKey string `json:"storageKey"`
				URL        string `json:"url"`
			} `json:"directMedia"`
			Binding struct {
				AssetVersionID       string `json:"assetVersionId"`
				ShotID               string `json:"shotId"`
				TranscriptID         string `json:"transcriptId"`
				TranscriptRevisionID string `json:"transcriptRevisionId"`
				TranscriptSegmentID  string `json:"transcriptSegmentId"`
				SourceClipID         string `json:"sourceClipId"`
			} `json:"productionBinding"`
		} `json:"clips"`
	}
	if err := json.Unmarshal(raw, &timeline); err != nil {
		return BadAuthRequest("时间线素材或版本引用格式无效")
	}
	type requestedTranscript struct {
		id, revision string
		spans        map[string]bool
	}
	transcriptVersions := map[string]*requestedTranscript{}
	for _, clip := range timeline.Clips {
		if clip.Graphic != nil && clip.Graphic.Kind == "image" {
			resource, err := s.repo.ResourceForUser(userID, clip.Graphic.ResourceID)
			if err != nil || resource.Status != model.ResourceStatusReady || !strings.HasPrefix(resource.MimeType, "image/") {
				return BadAuthRequest("图片叠层必须引用当前账号的就绪图片素材")
			}
		}
		binding := clip.Binding
		if binding.TranscriptID != "" || binding.TranscriptRevisionID != "" || binding.TranscriptSegmentID != "" || binding.SourceClipID != "" {
			if clip.Kind != "subtitle" || binding.TranscriptID == "" || binding.TranscriptRevisionID == "" || binding.TranscriptSegmentID == "" || binding.SourceClipID == "" || len(binding.SourceClipID) > 128 || len(binding.TranscriptID) > 80 || len(binding.TranscriptRevisionID) > 80 || len(binding.TranscriptSegmentID) > 80 {
				return BadAuthRequest("字幕文字稿来源缺少具体版本或片段实例")
			}
			key := binding.TranscriptID + ":" + binding.TranscriptRevisionID
			if transcriptVersions[key] == nil {
				transcriptVersions[key] = &requestedTranscript{id: binding.TranscriptID, revision: binding.TranscriptRevisionID, spans: map[string]bool{}}
			}
			transcriptVersions[key].spans[binding.TranscriptSegmentID] = false
		}
	}
	// Keep only requested IDs, rather than retaining every full transcript in
	// a timeline with many different source documents.
	for _, request := range transcriptVersions {
		view, err := s.GetProjectTranscriptVersion(userID, projectID, request.id, request.revision)
		if err != nil {
			return BadAuthRequest("字幕文字稿版本不存在或不属于当前项目")
		}
		for _, segment := range view.Document.Segments {
			if _, wanted := request.spans[segment.ID]; wanted {
				request.spans[segment.ID] = true
			}
		}
		for _, found := range request.spans {
			if !found {
				return BadAuthRequest("字幕文字稿条目不存在于所引用版本")
			}
		}
	}
	for _, clip := range timeline.Clips {
		if clip.Kind == "video" || clip.Kind == "audio" || clip.Kind == "image" {
			if !strings.HasPrefix(clip.DirectMedia.StorageKey, "resource:") || assets.ResourceID(clip.DirectMedia.StorageKey) == "" {
				return BadAuthRequest("请从项目素材库重新添加尚未固定来源的媒体片段")
			}
			if clip.DirectMedia.URL != "" && assets.ResourceID(clip.DirectMedia.URL) != assets.ResourceID(clip.DirectMedia.StorageKey) {
				return BadAuthRequest("媒体地址与固定素材不一致")
			}
			resource, err := s.repo.ResourceForUser(userID, assets.ResourceID(clip.DirectMedia.StorageKey))
			if err != nil || (resource.Kind != clip.Kind && uploadedResourceKind(resource.MimeType) != clip.Kind) {
				return BadAuthRequest("时间线媒体类型与素材内容不一致")
			}
		}
		if clip.Binding.AssetVersionID != "" {
			version, err := s.repo.AssetVersion(clip.Binding.AssetVersionID)
			if err != nil {
				return BadAuthRequest("固定候选版本不存在")
			}
			if _, err := s.repo.AssetForUser(userID, version.AssetID); err != nil {
				return BadAuthRequest("固定候选版本不属于当前账号")
			}
		}
		if clip.Binding.ShotID != "" {
			if _, err := s.repo.ShotForProject(projectID, clip.Binding.ShotID); err != nil {
				return BadAuthRequest("镜头不属于当前项目")
			}
		}
	}
	return nil
}
