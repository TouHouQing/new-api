package app

import (
	"context"
	"errors"
	"io"
	"log"
	"os"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

var resourceAdoptionInspectGate = make(chan struct{}, 2)

// Browser uploads normally carry metadata; headless uploads may not. Inspect
// original bytes before taking the canvas/storage lock, with bounded spooling.
func (s *Service) resourceAdoptionMetadata(userID, resourceID string) (*model.Resource, error) {
	resource, err := s.repo.ResourceForUser(userID, resourceID)
	if err != nil {
		return nil, err
	}
	kind := uploadedResourceKind(resource.MimeType)
	missing := (kind == "image" && (resource.Width <= 0 || resource.Height <= 0)) || (kind == "video" && (resource.Width <= 0 || resource.Height <= 0 || resource.DurationMs <= 0)) || (kind == "audio" && resource.DurationMs <= 0)
	if !missing || resource.Status != model.ResourceStatusReady {
		return resource, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	select {
	case resourceAdoptionInspectGate <- struct{}{}:
		defer func() { <-resourceAdoptionInspectGate }()
	case <-ctx.Done():
		return nil, WrapAppError(503, "素材检查繁忙，请稍后沿用原编号重试", ctx.Err())
	}
	_, stream, err := s.OpenResource(userID, resourceID)
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	temporary, err := os.CreateTemp("", "yingce-resource-inspect-*")
	if err != nil {
		return nil, err
	}
	defer func() {
		temporary.Close()
		if err := os.Remove(temporary.Name()); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("resource inspection spool cleanup failed: %v", err)
		}
	}()
	if resource.Size <= 0 || resource.Size > 1024*1024*1024 {
		return nil, BadAuthRequest("素材大小无效或超过检查上限")
	}
	count, err := io.Copy(temporary, io.LimitReader(stream, resource.Size+1))
	if err != nil {
		return nil, err
	}
	if count != resource.Size {
		return nil, BadAuthRequest("素材原文件不完整，请重新上传")
	}
	if _, err := temporary.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	width, height, duration, err := inspectProductionImportMedia(ctx, temporary, resource.MimeType)
	if errors.Is(err, errMediaInspectorUnavailable) {
		return nil, WrapAppError(503, "需要服务端FFprobe读取音视频信息，请配置后沿用原编号重试", err)
	}
	if err != nil {
		return nil, WrapAppError(400, "素材尺寸或时长检查失败", err)
	}
	inspected, err := s.repo.SaveInspectedResourceMetadata(resource, width, height, duration)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		conflict := NewAppError(409, "素材在读取期间发生变化，请重新检查后重试")
		conflict.Reason = "resource_metadata_changed"
		return nil, conflict
	}
	return inspected, err
}
