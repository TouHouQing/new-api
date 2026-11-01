package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ReferenceShotRequest struct {
	RequestID               string   `json:"requestId"`
	AnalysisRevisionID      string   `json:"analysisRevisionId"`
	ExpectedProjectRevision int64    `json:"expectedProjectRevision"`
	Title                   string   `json:"title,omitempty"`
	SectionIDs              []string `json:"sectionIds,omitempty"`
}
type ReferenceShotApplyRequest struct {
	ReferenceShotRequest
	PreviewToken string `json:"previewToken"`
}
type ReferenceShotItem struct {
	SectionID  string `json:"sectionId"`
	ShotID     string `json:"shotId"`
	RevisionID string `json:"revisionId"`
	Title      string `json:"title"`
	StartMs    int64  `json:"startMs"`
	EndMs      int64  `json:"endMs"`
}
type ReferenceShotPreview struct {
	AdoptionID         string              `json:"adoptionId"`
	ProjectRevision    int64               `json:"projectRevision"`
	AnalysisID         string              `json:"analysisId"`
	AnalysisRevisionID string              `json:"analysisRevisionId"`
	ResourceID         string              `json:"resourceId"`
	SourceSHA256       string              `json:"sourceSha256"`
	UnitID             string              `json:"unitId"`
	Title              string              `json:"title"`
	Position           int                 `json:"position"`
	Shots              []ReferenceShotItem `json:"shots"`
	Warnings           []string            `json:"warnings"`
	PreviewToken       string              `json:"previewToken"`
}
type ReferenceShotResult struct {
	Plan           ReferenceShotPreview `json:"plan"`
	Replayed       bool                 `json:"replayed"`
	MissingShotIDs []string             `json:"missingShotIds"`
	UnitDeleted    bool                 `json:"unitDeleted"`
}

func (s *Service) ReadReferenceShotAdoption(userID, projectID, requestID string) (ReferenceShotResult, error) {
	var result ReferenceShotResult
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	if len(requestID) < 16 || validateProjectCreationKey(requestID) != nil {
		return result, BadAuthRequest("采用编号无效")
	}
	id := mediaAnalysisID("reference-shot-adoption-v1", userID, projectID, requestID)
	receipt, err := s.repo.ProjectReferenceAdoption(userID, projectID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("此采用编号尚无已完成回执")
	}
	if err != nil {
		return result, err
	}
	result, err = s.referenceShotReplay(userID, projectID, receipt, receipt.RequestSHA256)
	var failure *AppError
	if errors.As(err, &failure) && failure.Status == 410 {
		result.UnitDeleted = true
		result.Replayed = true
		result.MissingShotIDs = []string{}
		for _, shot := range result.Plan.Shots {
			result.MissingShotIDs = append(result.MissingShotIDs, shot.ShotID)
		}
		return result, nil
	}
	return result, err
}

func normalizeReferenceShotRequest(req ReferenceShotRequest) (ReferenceShotRequest, error) {
	req.Title = strings.TrimSpace(req.Title)
	if len(req.RequestID) < 16 || validateProjectCreationKey(req.RequestID) != nil || req.ExpectedProjectRevision < 1 || len(req.AnalysisRevisionID) == 0 || len(req.AnalysisRevisionID) > 80 || !utf8.ValidString(req.Title) || utf8.RuneCountInString(req.Title) > 240 || len(req.SectionIDs) > 200 || (req.SectionIDs != nil && len(req.SectionIDs) == 0) {
		return req, BadAuthRequest("请提供有效的采用编号、项目/分析版本和最多200个已核对分段")
	}
	seen := map[string]bool{}
	for _, id := range req.SectionIDs {
		if id == "" || len(id) > 128 || seen[id] {
			return req, BadAuthRequest("采用分段编号重复或无效")
		}
		seen[id] = true
	}
	return req, nil
}

func (s *Service) PreviewReferenceShots(userID, projectID, analysisID string, input ReferenceShotRequest) (ReferenceShotPreview, error) {
	var result ReferenceShotPreview
	req, err := normalizeReferenceShotRequest(input)
	if err != nil {
		return result, err
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return result, err
	}
	if project.Revision != req.ExpectedProjectRevision {
		return result, &AppError{Status: 409, Code: 409, Reason: "reference_shot_project_changed", Message: "项目已变化，请保留草稿并重新预览"}
	}
	view, err := s.GetProjectMediaAnalysis(userID, projectID, analysisID, req.AnalysisRevisionID)
	if err != nil {
		return result, err
	}
	if view.Analysis.Kind != "reference_video" || view.Analysis.SourceKind == "reference_checkpoint" || view.Analysis.Archived || !view.IsCurrent {
		return result, BadAuthRequest("请选择未归档参考分析的当前已核对版本")
	}
	resource, err := s.repo.ResourceForUser(userID, view.Source.ResourceID)
	if err != nil || resource.Kind != "video" || resource.Status != model.ResourceStatusReady || resource.ETag != view.Source.ETag || resource.Size != view.Source.Bytes {
		return result, BadAuthRequest("参考原片已变化或不可用，请核对来源")
	}
	wanted := map[string]bool{}
	for _, id := range req.SectionIDs {
		wanted[id] = true
	}
	specified := len(req.SectionIDs) > 0
	result = ReferenceShotPreview{AdoptionID: mediaAnalysisID("reference-shot-adoption-v1", userID, projectID, req.RequestID), ProjectRevision: project.Revision, AnalysisID: analysisID, AnalysisRevisionID: req.AnalysisRevisionID, ResourceID: view.Source.ResourceID, SourceSHA256: view.Source.SHA256, Title: req.Title, Shots: []ReferenceShotItem{}, Warnings: []string{"将已核对分段规划为一个新的原生章节，可继续编辑画面描述、角色参考和运镜。", "时长来自原片源区间。分段测量不代表已理解剧情，生成前请补充镜头描述并检查模型时长限制。"}}
	result.UnitID = mediaAnalysisID("reference-adopted-unit", result.AdoptionID)
	if result.Title == "" {
		result.Title = "参考分镜 · " + view.Analysis.Title
		if utf8.RuneCountInString(result.Title) > 240 {
			result.Title = string([]rune(result.Title)[:240])
		}
	}
	for _, section := range view.Document.Sections {
		if specified && !wanted[section.ID] {
			continue
		}
		if !section.Approved {
			if specified {
				return result, BadAuthRequest("所选分段尚未核对并保存")
			}
			continue
		}
		delete(wanted, section.ID)
		shotID := mediaAnalysisID("reference-adopted-shot", result.AdoptionID, section.ID)
		title := strings.TrimSpace(section.Title)
		if title == "" {
			title = fmt.Sprintf("参考片段 %d", len(result.Shots)+1)
		}
		result.Shots = append(result.Shots, ReferenceShotItem{SectionID: section.ID, ShotID: shotID, RevisionID: mediaAnalysisID("reference-adopted-shot-version", shotID), Title: title, StartMs: section.StartMs, EndMs: section.EndMs})
	}
	if len(wanted) > 0 || len(result.Shots) == 0 || len(result.Shots) > 200 {
		return result, BadAuthRequest("请选择1至200个属于这个版本的已核对分段")
	}
	units, err := s.repo.ProjectUnits(projectID)
	if err != nil {
		return result, err
	}
	for _, unit := range units {
		result.Position = max(result.Position, unit.Position+1)
	}
	result.PreviewToken = mediaAnalysisDigest([]any{"reference-shots-v1", userID, projectID, req, result})
	return result, nil
}

func (s *Service) referenceShotReplay(userID, projectID string, receipt *model.ProjectReferenceAdoption, signature string) (ReferenceShotResult, error) {
	var result ReferenceShotResult
	if receipt.RequestSHA256 != signature {
		return result, &AppError{Status: 409, Code: 409, Reason: "reference_shot_request_conflict", Message: "此采用编号已用于其他内容，请先查看原结果"}
	}
	if json.Unmarshal([]byte(receipt.ResultJSON), &result.Plan) != nil {
		return result, WrapAppError(500, "采用回执不完整", errors.New("invalid reference adoption receipt"))
	}
	if _, err := s.repo.ProjectUnit(projectID, receipt.UnitID); errors.Is(err, gorm.ErrRecordNotFound) {
		return result, &AppError{Status: 410, Code: 410, Reason: "reference_shot_unit_deleted", Message: "此前采用的章节已删除，原请求不会重新创建；新建需使用新的采用编号"}
	} else if err != nil {
		return result, err
	}
	result.Replayed = true
	result.MissingShotIDs = []string{}
	for _, shot := range result.Plan.Shots {
		if _, err := s.repo.ShotForProject(projectID, shot.ShotID); errors.Is(err, gorm.ErrRecordNotFound) {
			result.MissingShotIDs = append(result.MissingShotIDs, shot.ShotID)
		} else if err != nil {
			return result, err
		}
	}
	return result, nil
}

func (s *Service) ApplyReferenceShots(userID, projectID, analysisID string, input ReferenceShotApplyRequest) (ReferenceShotResult, error) {
	var result ReferenceShotResult
	req, err := normalizeReferenceShotRequest(input.ReferenceShotRequest)
	if err != nil {
		return result, err
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	id := mediaAnalysisID("reference-shot-adoption-v1", userID, projectID, req.RequestID)
	signature := mediaAnalysisDigest([]any{projectID, analysisID, req})
	if previous, err := s.repo.ProjectReferenceAdoption(userID, projectID, id); err == nil {
		return s.referenceShotReplay(userID, projectID, previous, signature)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	preview, err := s.PreviewReferenceShots(userID, projectID, analysisID, req)
	if err != nil {
		if previous, lookupErr := s.repo.ProjectReferenceAdoption(userID, projectID, id); lookupErr == nil {
			return s.referenceShotReplay(userID, projectID, previous, signature)
		}
		return result, err
	}
	if len(input.PreviewToken) != 64 || preview.PreviewToken != input.PreviewToken {
		return result, BadAuthRequest("请先检查分镜采用预览，项目或分析变化后需重新预览")
	}
	encoded, _ := json.Marshal(preview)
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(encoded))); err != nil {
		return result, err
	}
	now := time.Now()
	receipt := model.ProjectReferenceAdoption{ID: id, UserID: userID, ProjectID: projectID, RequestSHA256: signature, AnalysisID: analysisID, AnalysisRevisionID: req.AnalysisRevisionID, UnitID: preview.UnitID, ResultJSON: string(encoded), CreatedAt: now}
	err = s.repo.Transaction(func(tx *repository.Repository) error {
		if _, err := tx.LockReferenceAdoptionProject(userID, projectID, req.ExpectedProjectRevision); err != nil {
			return err
		}
		if previous, err := tx.ProjectReferenceAdoption(userID, projectID, id); err == nil {
			if previous.RequestSHA256 != signature {
				return repository.ErrMediaAnalysisMutationConflict
			}
			receipt = *previous
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		current, err := tx.ProjectMediaAnalysis(userID, projectID, analysisID)
		if err != nil {
			return err
		}
		if current.Archived || current.CurrentRevisionID != req.AnalysisRevisionID {
			return repository.ErrMediaAnalysisRevisionChanged
		}
		lines := make([]string, 0, len(preview.Shots))
		for _, shot := range preview.Shots {
			lines = append(lines, fmt.Sprintf("%s（原片 %.3f–%.3f秒）", shot.Title, float64(shot.StartMs)/1000, float64(shot.EndMs)/1000))
		}
		unit := model.ProjectUnit{ID: preview.UnitID, ProjectID: projectID, Kind: model.ProjectUnitKindChapter, Title: preview.Title, SourceText: strings.Join(lines, "\n"), Status: model.ProjectUnitStatusDraft, Position: preview.Position, CreatedAt: now, UpdatedAt: now}
		unit.WordCount = model.ProjectUnitWordCount(unit.SourceText)
		if err := tx.CreateProjectUnit(&unit); err != nil {
			return err
		}
		for index, item := range preview.Shots {
			duration := item.EndMs - item.StartMs
			revision, err := newShotRevision(userID, item.ShotID, ShotRevisionInput{PlotDescription: item.Title, DurationMs: duration, ContinuityNotes: fmt.Sprintf("参考原片 %.3f–%.3f秒，生成前请补充实际画面描述和角色设定", float64(item.StartMs)/1000, float64(item.EndMs)/1000)}, item.Title, duration, now)
			if err != nil {
				return err
			}
			revision.ID, revision.Version = item.RevisionID, 1
			shot := model.Shot{ID: item.ShotID, ProjectID: projectID, UnitID: unit.ID, CurrentRevisionID: revision.ID, Title: item.Title, Description: item.Title, Position: index, DurationMs: duration, Status: "draft", CreatedAt: now, UpdatedAt: now}
			if err := tx.SaveShotWithRevision(&shot, &revision, true, nil); err != nil {
				return err
			}
		}
		if _, err := (&Service{repo: tx}).createProjectWorkflow(projectID, unit.ID, "unit"); err != nil {
			return err
		}
		return tx.CreateReferenceAdoptionReceipt(&receipt)
	})
	if err != nil {
		if previous, lookupErr := s.repo.ProjectReferenceAdoption(userID, projectID, id); lookupErr == nil {
			return s.referenceShotReplay(userID, projectID, previous, signature)
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) || errors.Is(err, repository.ErrMediaAnalysisRevisionChanged) {
			return result, &AppError{Status: 409, Code: 409, Reason: "reference_shot_project_changed", Message: "采用期间项目或分析已变化，请保留草稿并重新预览"}
		}
		return result, err
	}
	result.Plan = preview
	result.MissingShotIDs = []string{}
	return result, nil
}
