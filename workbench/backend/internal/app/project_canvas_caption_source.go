package app

import (
	"encoding/json"
	"errors"
	"strings"

	"gorm.io/gorm"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

type CanvasTimelineSource struct {
	production.CanvasCaptionOrigin
	Title        string                        `json:"title"`
	CaptionCount int                           `json:"captionCount"`
	PreviewCues  []production.CanvasCaptionCue `json:"previewCues"`
}

// Read the confirmed node from the owner-linked native canvas. Clients never
// supply subtitle text, a duration, or a replacement file in an edit command.
func (s *Service) canvasTimelineSnapshot(userID, projectID, canvasID, nodeID, resourceID string) (production.CanvasNodeCaptionSnapshot, CanvasTimelineSource, error) {
	var snapshot production.CanvasNodeCaptionSnapshot
	var view CanvasTimelineSource
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return snapshot, view, err
	}
	if !validProductionOpaqueID(canvasID) || !validProductionOpaqueID(nodeID) || !validProductionOpaqueID(resourceID) {
		return snapshot, view, BadAuthRequest("请从画布重新选择具体素材")
	}
	canvas, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil || canvas.ProjectID != projectID {
		return snapshot, view, NotFound("画布不存在或未关联当前项目")
	}
	resource, err := s.resourceAdoptionMetadata(userID, resourceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return snapshot, view, BadAuthRequest("原片不存在、不属于当前账号或尚未就绪")
		}
		return snapshot, view, err
	}
	if resource.Status != model.ResourceStatusReady {
		return snapshot, view, BadAuthRequest("原片不存在、不属于当前账号或尚未就绪")
	}
	kind := uploadedResourceKind(resource.MimeType)
	if kind != "video" && kind != "audio" && kind != "image" {
		return snapshot, view, BadAuthRequest("请选择图片、视频或声音素材")
	}
	var document struct {
		Nodes []json.RawMessage `json:"nodes"`
	}
	if json.Unmarshal([]byte(canvas.PayloadJSON), &document) != nil {
		return snapshot, view, BadAuthRequest("画布数据无法读取，请保留原工程")
	}
	var selected json.RawMessage
	for _, raw := range document.Nodes {
		var identity struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(raw, &identity) != nil {
			return snapshot, view, BadAuthRequest("画布节点无法读取")
		}
		if identity.ID == nodeID {
			if selected != nil {
				return snapshot, view, BadAuthRequest("画布节点编号重复，请先整理工程")
			}
			selected = raw
		}
	}
	if selected == nil {
		return snapshot, view, NotFound("节点已移除，请返回画布重新选择")
	}
	var nodeMetadata struct {
		Metadata struct {
			ImageLayerGroup json.RawMessage `json:"imageLayerGroup"`
		} `json:"metadata"`
	}
	if json.Unmarshal(selected, &nodeMetadata) != nil {
		return snapshot, view, BadAuthRequest("画布节点无法读取")
	}
	if len(nodeMetadata.Metadata.ImageLayerGroup) > 0 && string(nodeMetadata.Metadata.ImageLayerGroup) != "null" {
		if err := s.requireReadyImageLayerGroup(userID, canvasID, nodeID); err != nil {
			return snapshot, view, err
		}
	}
	snapshot, hash, err := production.ParseCanvasCaptionSource(selected, nodeID, resourceID, kind, resource.DurationMs)
	if err != nil {
		return snapshot, view, BadAuthRequest(err.Error())
	}
	view = CanvasTimelineSource{CanvasCaptionOrigin: production.CanvasCaptionOrigin{CanvasID: canvasID, NodeID: nodeID, CanvasRevision: canvas.Revision, NodeSHA256: hash, ResourceID: resourceID}, Title: snapshot.Title, CaptionCount: len(snapshot.Captions), PreviewCues: append([]production.CanvasCaptionCue{}, snapshot.Captions[:min(3, len(snapshot.Captions))]...)}
	return snapshot, view, nil
}

func validProductionOpaqueID(value string) bool {
	return value != "" && len(value) <= 128 && strings.TrimSpace(value) == value && !strings.ContainsAny(value, "/\\\x00\r\n\t")
}

func (s *Service) ReadCanvasTimelineSource(userID, projectID, canvasID, nodeID, resourceID string) (CanvasTimelineSource, error) {
	_, view, err := s.canvasTimelineSnapshot(userID, projectID, canvasID, nodeID, resourceID)
	return view, err
}

func (s *Service) resolveCanvasTimelineMedia(userID, projectID string, command *production.TimelineEditCommand) error {
	if command.CanvasRevision == nil || *command.CanvasRevision < 1 {
		return BadAuthRequest("请先读取并确认画布字幕快照")
	}
	snapshot, view, err := s.canvasTimelineSnapshot(userID, projectID, command.CanvasID, command.NodeID, command.ResourceID)
	if err != nil {
		return err
	}
	if view.NodeSHA256 != command.NodeSHA256 || view.CanvasRevision < *command.CanvasRevision {
		return cutConflict("画布原片或字幕已变化，请重新检查并确认")
	}
	// An unrelated node autosave may increase the canvas revision. The exact
	// confirmed input remains the same; preserve its original receipt identity.
	view.CanvasRevision = *command.CanvasRevision
	command.Media.Title = snapshot.Title
	command.Media.CanvasOrigin = &view.CanvasCaptionOrigin
	command.Media.CaptionCues = snapshot.Captions
	command.Media.SubtitleStyle = snapshot.Style
	command.Media.Highlights = snapshot.Highlights
	return nil
}
