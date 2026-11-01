package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ProjectMemberRequest struct {
	RequestID        string `json:"requestId"`
	ExpectedRevision int64  `json:"expectedRevision"`
	MemberUserID     string `json:"userId,omitempty"`
	Username         string `json:"username,omitempty"`
	Role             string `json:"role"`
	Active           *bool  `json:"active"`
}
type ProjectMemberPage struct {
	Members []ProjectMemberView `json:"members"`
}

func (s *Service) ListProjectMembers(actor, projectID string) (ProjectMemberPage, error) {
	result := ProjectMemberPage{Members: []ProjectMemberView{}}
	project, role, err := s.projectReviewAccess(actor, projectID)
	if err != nil {
		return result, err
	}
	if role != "owner" {
		return result, NewAppError(403, "只有项目所有者可以管理协作者")
	}
	rows, err := s.repo.ProjectMembers(project.UserID, projectID)
	if err != nil {
		return result, err
	}
	for _, row := range rows {
		name := "已停用账号"
		user, err := s.repo.User(row.MemberUserID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return result, err
		}
		if err == nil {
			name = user.Username
		}
		result.Members = append(result.Members, ProjectMemberView{ProjectMember: row, Username: name})
	}
	return result, nil
}
func (s *Service) SaveProjectMember(actor, projectID string, request ProjectMemberRequest) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	request.Username = strings.TrimSpace(request.Username)
	request.MemberUserID = strings.TrimSpace(request.MemberUserID)
	if !validCutRequestID(request.RequestID) || request.ExpectedRevision < 0 || request.Active == nil || request.Role != "viewer" && request.Role != "reviewer" && request.Role != "editor" || (request.MemberUserID == "") == (request.Username == "") || len(request.MemberUserID) > 36 || len(request.Username) > 120 {
		return result, BadAuthRequest("请提供协作者账号、明确权限和启用状态，以及当前授权版本")
	}
	project, role, err := s.projectReviewAccess(actor, projectID)
	if err != nil {
		return result, err
	}
	if err = requireReviewWrite(project, role, true); err != nil {
		return result, err
	}
	signature := cutSignature(struct {
		Kind    string
		Request ProjectMemberRequest
	}{"project-member", request})
	actorKey := reviewActorKey(actor)
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, request.RequestID, signature, "project-member"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	var user *model.User
	if request.MemberUserID != "" {
		user, err = s.repo.User(request.MemberUserID)
	} else {
		user, err = s.repo.UserByUsername(request.Username)
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, BadAuthRequest("没有找到可添加的账号，请核对用户名或账号ID")
	}
	if err != nil {
		return result, err
	}
	if user.ID == project.UserID {
		return result, BadAuthRequest("所有者权限由项目确定，无需添加或修改自己的协作者授权")
	}
	if *request.Active && user.Status != model.UserStatusActive {
		return result, BadAuthRequest("此账号已停用，不能授予项目权限")
	}
	existing, err := s.repo.ProjectMember(project.UserID, projectID, user.ID)
	isNew := errors.Is(err, gorm.ErrRecordNotFound)
	if err != nil && !isNew {
		return result, err
	}
	if isNew && request.ExpectedRevision != 0 || !isNew && existing.Revision != request.ExpectedRevision {
		return result, reviewConflict("协作者权限已变化，请重新读取后确认")
	}
	now := time.Now()
	row := model.ProjectMember{ID: mediaAnalysisID("project-member-v1", projectID, user.ID), UserID: project.UserID, ProjectID: projectID, MemberUserID: user.ID, Role: request.Role, Active: *request.Active, Revision: request.ExpectedRevision + 1, CreatedAt: now, UpdatedAt: now}
	if !isNew {
		row.CreatedAt = existing.CreatedAt
	}
	result = ProjectReviewWriteResult{Kind: "project-member", Member: &ProjectMemberView{ProjectMember: row, Username: user.Username}}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, request.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: request.RequestID, RequestSHA256: signature, Kind: result.Kind, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, int64(len(raw))); err != nil {
		return ProjectReviewWriteResult{}, err
	}
	err = s.repo.ProjectReviewTransaction(projectID, func(r *repository.Repository, current *model.Project) error {
		if current.UserID != project.UserID {
			return reviewMissing()
		}
		role, err := projectReviewRole(r, actor, current)
		if err != nil {
			return err
		}
		if err = requireReviewWrite(current, role, true); err != nil {
			return err
		}
		target, err := r.User(user.ID)
		if err != nil {
			return err
		}
		if row.Active && target.Status != model.UserStatusActive {
			return reviewConflict("协作者账号状态已变化，请重新读取")
		}
		if isNew {
			if _, err := r.ProjectMember(project.UserID, projectID, user.ID); err == nil {
				return reviewConflict("该账号已存在项目授权，请重新读取后修改")
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			members, err := r.ProjectMembers(project.UserID, projectID)
			if err != nil {
				return err
			}
			if len(members) >= 200 {
				return BadAuthRequest("项目已达到200条协作者授权记录的上限，请复用已有账号授权")
			}
			if err = r.CreateProjectMember(&row); err != nil {
				return err
			}
		} else if err = r.UpdateProjectMember(&row, request.ExpectedRevision); err != nil {
			return err
		}
		return r.CreateProjectReviewReceipt(&receipt)
	})
	if err != nil {
		if prior, lookup := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, request.RequestID, signature, result.Kind); lookup == nil && prior != nil {
			return *prior, nil
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) {
			return ProjectReviewWriteResult{}, reviewConflict("协作者权限已变化，本次未修改，请重新读取")
		}
		return ProjectReviewWriteResult{}, err
	}
	return result, nil
}
