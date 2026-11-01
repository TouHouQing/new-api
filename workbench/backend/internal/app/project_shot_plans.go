package app

import (
	"encoding/json"
	"errors"
	"strings"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ShotPlanSource struct {
	Snapshot model.ShotPlanSnapshot `json:"snapshot"`
	SHA256   string                 `json:"sha256"`
}
type ShotPlanView struct {
	Record    model.ProjectShotPlanRecord `json:"record"`
	Snapshot  model.ShotPlanSnapshot      `json:"snapshot"`
	Revisions []model.ShotRevision        `json:"revisions"`
	Page      int                         `json:"page"`
	PageSize  int                         `json:"pageSize"`
}
type ShotPlanPage struct {
	Versions []model.ProjectShotPlanRecord `json:"versions"`
	Total    int64                         `json:"total"`
	Page     int                           `json:"page"`
	PageSize int                           `json:"pageSize"`
}
type RestoreShotPlanRequest struct {
	RequestID            string   `json:"requestId"`
	SourceSHA256         string   `json:"sourceSha256"`
	ExpectedShotIDs      []string `json:"expectedShotIds"`
	ExpectedSourceSHA256 string   `json:"expectedSourceSha256"`
}

func shotPlanWriteError(err error) error {
	if errors.Is(err, repository.ErrShotRevisionChanged) {
		return shotRevisionConflict()
	}
	if errors.Is(err, repository.ErrShotPlanChanged) || errors.Is(err, repository.ErrProjectUnitShotsChanged) {
		e := NewAppError(409, "分镜方案已在其他页面更新，已保留本次结果；请读取当前方案后重新确认")
		e.Reason = "shot_plan_changed"
		return e
	}
	if errors.Is(err, repository.ErrShotPlanIntentChanged) {
		return NewAppError(409, "同一操作编号不能用于不同的分镜内容")
	}
	return shotOperationError(err)
}
func (s *Service) ReadShotPlanSource(userID, projectID, unitID string) (ShotPlanSource, error) {
	var result ShotPlanSource
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, shotOperationError(err)
	}
	snapshot, digest, err := s.repo.CurrentShotPlan(userID, projectID, unitID)
	return ShotPlanSource{Snapshot: snapshot, SHA256: digest}, shotOperationError(err)
}
func (s *Service) ListShotPlans(userID, projectID, unitID string, page, pageSize int) (ShotPlanPage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ShotPlanPage{}, shotOperationError(err)
	}
	if _, err := s.repo.ProjectUnit(projectID, unitID); err != nil {
		return ShotPlanPage{}, shotOperationError(err)
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}
	rows, total, err := s.repo.ShotPlanRecords(userID, projectID, unitID, page, pageSize)
	return ShotPlanPage{Versions: rows, Total: total, Page: page, PageSize: pageSize}, err
}
func (s *Service) ReadShotPlan(userID, projectID, id string, pages ...int) (ShotPlanView, error) {
	var result ShotPlanView
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, shotOperationError(err)
	}
	record, err := s.repo.ShotPlanRecord(userID, projectID, id)
	if err != nil {
		return result, shotOperationError(err)
	}
	if projectCreationHash([]byte(record.PayloadJSON)) != record.PayloadSHA256 {
		return result, BadAuthRequest("分镜方案摘要不匹配，原数据已保留，请核对备份")
	}
	if json.Unmarshal([]byte(record.PayloadJSON), &result.Snapshot) != nil || result.Snapshot.ProjectID != projectID || result.Snapshot.UnitID != record.UnitID || result.Snapshot.Version != 1 {
		return result, BadAuthRequest("原分镜方案无法读取")
	}
	result.Record = *record
	result.Revisions = []model.ShotRevision{}
	result.Page, result.PageSize = 1, 20
	if len(pages) > 0 && pages[0] > 0 {
		result.Page = min(pages[0], 1000)
	}
	start := min((result.Page-1)*result.PageSize, len(result.Snapshot.Entries))
	end := min(start+result.PageSize, len(result.Snapshot.Entries))
	for _, entry := range result.Snapshot.Entries[start:end] {
		if entry.RevisionID == "" {
			continue
		}
		revision, err := s.repo.ShotRevisionForShot(entry.ShotID, entry.RevisionID)
		if err != nil {
			return ShotPlanView{}, shotOperationError(err)
		}
		result.Revisions = append(result.Revisions, *revision)
	}
	return result, nil
}
func (s *Service) markCurrentShotPlan(projectID, unitID string, result *model.ShotPlanWriteResult) error {
	shots, err := s.repo.ProjectUnitShots(projectID, unitID)
	if err != nil {
		return err
	}
	current := map[string]model.Shot{}
	for _, shot := range shots {
		current[shot.ID] = shot
	}
	result.Current = len(shots) == len(result.Shots)
	for _, shot := range result.Shots {
		live, exists := current[shot.ID]
		if !exists || live.CurrentRevisionID != shot.CurrentRevisionID || live.Title != shot.Title || live.Position != shot.Position {
			result.Current = false
		}
	}
	return nil
}
func (s *Service) replaceProjectShotPlan(userID, projectID, unitID string, req ReplaceProjectUnitShotsRequest) (model.ShotPlanWriteResult, error) {
	var result model.ShotPlanWriteResult
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	req.RequestID = strings.TrimSpace(req.RequestID)
	if !validCutRequestID(req.RequestID) || !validExpectedImageSourceHash(req.ExpectedSourceSHA256) || req.ExpectedShotIDs == nil || len(req.ExpectedShotIDs) > 200 {
		return result, BadAuthRequest("请提供稳定分镜操作编号和有效来源摘要")
	}
	prior, err := s.repo.ReplayShotPlanMutation(userID, projectID, unitID, "replace", req.RequestID, cutSignature(req))
	if err != nil {
		return result, shotPlanWriteError(err)
	}
	if prior != nil {
		result = *prior
		if err := s.markCurrentShotPlan(projectID, unitID, &result); err != nil {
			return result, err
		}
		return result, nil
	}
	_, err = s.prepareAndReplaceProjectUnitShots(userID, projectID, unitID, req, &result)
	if err != nil {
		return result, shotPlanWriteError(err)
	}
	if err := s.markCurrentShotPlan(projectID, unitID, &result); err != nil {
		return result, err
	}
	return result, nil
}
func (s *Service) RestoreShotPlan(userID, projectID, id string, req RestoreShotPlanRequest) (model.ShotPlanWriteResult, error) {
	var result model.ShotPlanWriteResult
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	if !validCutRequestID(req.RequestID) || !validExpectedImageSourceHash(req.SourceSHA256) || !validExpectedImageSourceHash(req.ExpectedSourceSHA256) || req.ExpectedShotIDs == nil || len(req.ExpectedShotIDs) > 200 {
		return result, BadAuthRequest("请确认原方案摘要、当前分镜和稳定恢复编号")
	}
	source, err := s.ReadShotPlan(userID, projectID, id)
	if err != nil {
		return result, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	intent := cutSignature(struct {
		ID      string
		Request RestoreShotPlanRequest
	}{id, req})
	mutation := repository.ShotPlanMutation{RequestID: req.RequestID, RequestSHA256: intent, ExpectedSHA256: req.ExpectedSourceSHA256, Result: &result, CheckQuota: func(repo *repository.Repository, delta int64) error {
		return (&Service{repo: repo, dataDir: s.dataDir}).validateProductionDocumentStorage(userID, delta)
	}}
	if err := s.repo.RestoreShotPlan(userID, projectID, id, req.SourceSHA256, req.ExpectedShotIDs, mutation); err != nil {
		return result, shotPlanWriteError(err)
	}
	if err := s.markCurrentShotPlan(projectID, source.Record.UnitID, &result); err != nil {
		return result, err
	}
	return result, nil
}
