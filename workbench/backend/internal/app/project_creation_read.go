package app

import (
	"errors"
	"net/http"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// Read-only recovery never creates another project or changes the original
// intent. A missing receipt is not permission to replace an in-flight request.
func (s *Service) ProjectCreationByKey(owner, key string) (model.Project, error) {
	if owner == "" {
		return model.Project{}, Unauthorized("请先登录")
	}
	if err := validateProjectCreationKey(key); err != nil || key == "" {
		return model.Project{}, BadAuthRequest("无效的创建请求编号")
	}
	receipt, err := s.repo.ProjectCreationReceiptForUser(owner, projectCreationHash([]byte(owner+"\x00"+key)))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.Project{}, NotFound("尚未找到创建回执，请保留原内容并稍后核对")
	}
	if err != nil {
		return model.Project{}, err
	}
	project, err := s.repo.ProjectForUser(owner, receipt.ProjectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.Project{}, NewAppError(http.StatusGone, "原请求创建的作品已删除；创建记录保留，请明确新建另一个作品")
	}
	if err != nil {
		return model.Project{}, err
	}
	return *project, nil
}
