package app

import (
	"errors"
	"strings"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ShotVideoSourceInput struct {
	Source         string  `json:"source"`
	ExpectedSource *string `json:"expectedSource"`
}
type ShotArtifactChangeInput struct {
	Action             string  `json:"action"`
	ExpectedSelectedID *string `json:"expectedSelectedId"`
}

func (s *Service) SaveShotVideoSource(userID, projectID, shotID string, input ShotVideoSourceInput) (*model.Shot, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return nil, shotOperationError(err)
	}
	if _, err := s.repo.ActiveShotForProject(projectID, shotID); err != nil {
		return nil, shotOperationError(err)
	}
	if input.ExpectedSource == nil {
		return nil, BadAuthRequest("请携带当前画面来源，再保存选择")
	}
	source := strings.TrimSpace(input.Source)
	if source != "text" && source != "assets" {
		if !strings.HasPrefix(source, "frame:") || len(source) > 100 {
			return nil, BadAuthRequest("不支持的视频画面来源")
		}
		artifact, err := s.repo.ShotArtifactForShot(projectID, shotID, strings.TrimPrefix(source, "frame:"))
		if err != nil {
			return nil, shotOperationError(err)
		}
		if artifact.Archived || artifact.ResourceID == "" || (artifact.Type != "storyboard" && artifact.Type != "start_frame") || (artifact.Status != "ready" && artifact.Status != "stale") {
			return nil, BadAuthRequest("请选择一版可用的分镜图或首帧")
		}
		resource, err := s.repo.ResourceForUser(userID, artifact.ResourceID)
		if err != nil {
			return nil, shotOperationError(err)
		}
		if resource.Status != model.ResourceStatusReady || !strings.HasPrefix(resource.MimeType, "image/") {
			return nil, BadAuthRequest("首帧图片尚不可用")
		}
	}
	shot, err := s.repo.SaveShotVideoSource(projectID, shotID, source, *input.ExpectedSource, time.Now())
	if errors.Is(err, repository.ErrShotPreferencesChanged) {
		return nil, NewAppError(409, "画面来源已在其他页面修改，请刷新后重新选择")
	}
	if errors.Is(err, repository.ErrShotArtifactUnavailable) {
		return nil, BadAuthRequest("所选首帧已变化，请刷新后重新选择")
	}
	return shot, shotOperationError(err)
}

func (s *Service) ChangeShotArtifact(userID, projectID, shotID, artifactID string, input ShotArtifactChangeInput) (*model.ShotArtifact, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return nil, shotOperationError(err)
	}
	if input.ExpectedSelectedID == nil {
		return nil, BadAuthRequest("请携带当前选用版本，再操作候选")
	}
	if input.Action != "select" && input.Action != "archive" && input.Action != "restore" {
		return nil, BadAuthRequest("不支持的候选操作")
	}
	if input.Action == "select" {
		artifact, err := s.repo.ShotArtifactForShot(projectID, shotID, artifactID)
		if err != nil {
			return nil, shotOperationError(err)
		}
		resource, err := s.repo.ResourceForUser(userID, artifact.ResourceID)
		if err != nil {
			return nil, shotOperationError(err)
		}
		if resource.Status != model.ResourceStatusReady {
			return nil, BadAuthRequest("候选文件尚不可用")
		}
	}
	artifact, err := s.repo.ChangeShotArtifact(projectID, shotID, artifactID, input.Action, *input.ExpectedSelectedID, time.Now())
	if errors.Is(err, repository.ErrShotPreferencesChanged) {
		return nil, NewAppError(409, "选用版本已变化，请刷新后重新确认")
	}
	if errors.Is(err, repository.ErrShotArtifactUnavailable) {
		return nil, BadAuthRequest("当前选用或用作视频首帧的候选不能归档，请先更换；选用前须恢复候选并确认文件可用")
	}
	return artifact, shotOperationError(err)
}
