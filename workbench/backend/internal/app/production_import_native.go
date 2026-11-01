package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type LegacyNativeRequest struct {
	ExpectedProjectRevision  int64  `json:"expectedProjectRevision"`
	ExpectedTimelineRevision int64  `json:"expectedTimelineRevision"`
	PreviewToken             string `json:"previewToken,omitempty"`
}
type LegacyNativeStatus struct {
	Available               bool              `json:"available"`
	ConverterVersion        int               `json:"converterVersion"`
	OriginalContractVersion int               `json:"originalContractVersion,omitempty"`
	Cut                     *model.ProjectCut `json:"cut,omitempty"`
}
type LegacyNativePreview struct {
	ImportID         string                            `json:"importId"`
	ConverterVersion int                               `json:"converterVersion"`
	ProjectRevision  int64                             `json:"projectRevision"`
	TimelineRevision int64                             `json:"timelineRevision"`
	CutID            string                            `json:"cutId"`
	TimelineSHA256   string                            `json:"timelineSha256"`
	Report           production.LegacyProjectionReport `json:"report"`
	PreviewToken     string                            `json:"previewToken"`
}

func (s *Service) GetLegacyNativeStatus(userID, projectID string) (LegacyNativeStatus, error) {
	result := LegacyNativeStatus{ConverterVersion: production.LegacyNativeProjectionVersion}
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	receipt, err := s.repo.ProductionImportForProject(userID, projectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	result.Available = true
	result.OriginalContractVersion = receipt.ContractVersion
	row, err := s.repo.ProjectCutForRequest(userID, projectID, production.LegacyNativeRequestID(receipt.ID))
	if err == nil {
		result.Cut = row
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	return result, nil
}

func (s *Service) buildLegacyNativeProjection(ctx context.Context, userID, projectID string, req LegacyNativeRequest) (*repository.ProductionImportRows, LegacyNativePreview, error) {
	var plan LegacyNativePreview
	if req.ExpectedProjectRevision < 1 || req.ExpectedTimelineRevision < 0 {
		return nil, plan, BadAuthRequest("请先读取当前项目与剪辑版本")
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return nil, plan, err
	}
	if project.Revision != req.ExpectedProjectRevision {
		return nil, plan, cutConflict("项目已更新，请重新核对旧工程转换")
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return nil, plan, err
	}
	if timeline.Revision != req.ExpectedTimelineRevision {
		return nil, plan, cutConflict("当前剪辑已更新，请保存后重新核对转换")
	}
	receipt, err := s.repo.ProductionImportForProject(userID, projectID)
	if err != nil {
		return nil, plan, NotFound("当前项目没有可转换的原始导入记录")
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader([]byte(receipt.SourceDocumentJSON)))
	decoder.UseNumber()
	if decoder.Decode(&document) != nil {
		return nil, plan, NewAppError(500, "原始导入记录无法读取，请检查备份")
	}
	var identities map[string]map[string]string
	var report production.LegacyProjectionReport
	if json.Unmarshal([]byte(receipt.IdentityMapJSON), &identities) != nil || identities == nil || json.Unmarshal([]byte(receipt.ReportJSON), &report) != nil {
		return nil, plan, NewAppError(500, "原始身份映射或迁移报告无法读取")
	}
	var references []struct {
		ResourceID string `json:"resourceId"`
	}
	if json.Unmarshal([]byte(receipt.ResourceRefsJSON), &references) != nil || len(references) > 1000 {
		return nil, plan, NewAppError(500, "原始素材映射无法读取")
	}
	resources := map[string]model.Resource{}
	for _, ref := range references {
		if err := ctx.Err(); err != nil {
			return nil, plan, err
		}
		resource, err := s.repo.ResourceForUser(userID, ref.ResourceID)
		if err != nil || resource.Status != model.ResourceStatusReady {
			return nil, plan, BadAuthRequest("原工程的部分素材不可用，请先恢复素材后再转换")
		}
		resources[resource.ID] = *resource
	}
	data := production.LegacyProjectionData{Artifacts: map[string][]byte{}, ResourceSHA256: map[string]string{}}
	if receipt.ContractVersion >= 8 {
		data.PreviousPlanning = &report
	} else if previous, lookupErr := s.repo.ProjectCutForRequest(userID, projectID, "legacy-native-v8:"+receipt.ID); lookupErr == nil {
		var metadata struct {
			ConverterVersion  int                               `json:"converterVersion"`
			SourceImportID    string                            `json:"sourceImportId"`
			SourceFingerprint string                            `json:"sourceFingerprint"`
			Report            production.LegacyProjectionReport `json:"report"`
		}
		if previous.SourceImportID != receipt.ID || previous.SourceKey != "studio-native-v8" || json.Unmarshal([]byte(previous.MetadataJSON), &metadata) != nil || metadata.ConverterVersion != 8 || metadata.SourceImportID != receipt.ID || metadata.SourceFingerprint != receipt.SourceFingerprint {
			return nil, plan, NewAppError(500, "此前的制作方案转换记录无法核对，请保留现有章节并检查备份")
		}
		data.PreviousPlanning = &metadata.Report
	} else if !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
		return nil, plan, lookupErr
	}
	var analysisRefs []struct {
		Kind            string `json:"kind"`
		SourceMediaID   string `json:"sourceMediaId"`
		ArtifactMediaID string `json:"artifactMediaId"`
	}
	if raw := document["production"]; raw != nil {
		encoded, _ := json.Marshal(raw)
		var state struct {
			AnalysisRefs json.RawMessage `json:"analysisRefs"`
		}
		if json.Unmarshal(encoded, &state) != nil {
			return nil, plan, BadAuthRequest("原始制作设定无法读取")
		}
		if len(state.AnalysisRefs) > 0 && json.Unmarshal(state.AnalysisRefs, &analysisRefs) != nil {
			return nil, plan, BadAuthRequest("原始分析引用无法读取")
		}
	}
	if len(analysisRefs) > 500 {
		return nil, plan, BadAuthRequest("原始分析数量超过转换范围")
	}
	var artifactBytes int64
	for _, ref := range analysisRefs {
		if ref.Kind != "transcript" && ref.Kind != "scenes" && ref.Kind != "audio" && ref.Kind != "subjects" {
			continue
		}
		if err := ctx.Err(); err != nil {
			return nil, plan, err
		}
		if data.ResourceSHA256[ref.SourceMediaID] == "" {
			resource, ok := resources[ref.SourceMediaID]
			if !ok || resource.Size < 1 || resource.Size > 1<<30 {
				return nil, plan, BadAuthRequest("分析的原片源不可用或超出大小限制")
			}
			_, reader, err := s.OpenResource(userID, resource.ID)
			if err != nil {
				return nil, plan, err
			}
			digest := sha256.New()
			count, err := io.Copy(digest, io.LimitReader(reader, resource.Size+1))
			reader.Close()
			if err != nil || count != resource.Size {
				return nil, plan, BadAuthRequest("分析原片源读取不完整，未创建转换版本")
			}
			data.ResourceSHA256[resource.ID] = fmt.Sprintf("%x", digest.Sum(nil))
		}
		if _, ok := data.Artifacts[ref.ArtifactMediaID]; !ok {
			resource, ok := resources[ref.ArtifactMediaID]
			if !ok || resource.Size < 1 || resource.Size > production.MaxLegacyDocumentBytes {
				return nil, plan, BadAuthRequest("历史分析文件缺失或过大")
			}
			_, reader, err := s.OpenResource(userID, resource.ID)
			if err != nil {
				return nil, plan, err
			}
			raw, err := io.ReadAll(io.LimitReader(reader, resource.Size+1))
			reader.Close()
			if err != nil || int64(len(raw)) != resource.Size {
				return nil, plan, BadAuthRequest("历史分析文件读取不完整")
			}
			artifactBytes += int64(len(raw))
			if artifactBytes > 64<<20 {
				return nil, plan, BadAuthRequest("历史分析总量超出本次转换范围")
			}
			data.Artifacts[resource.ID] = raw
		}
	}
	rows := &repository.ProductionImportRows{Project: *project, Receipt: *receipt}
	if receipt.CanvasID != "" {
		data.Canvas, err = s.repo.CanvasProjectForUser(userID, receipt.CanvasID)
		if err != nil || data.Canvas.ProjectID != projectID {
			return nil, plan, cutConflict("原工程画布不可用或已移至其他项目，请先恢复画布再转换")
		}
	}
	report, err = production.EnrichLegacyImport(rows, report, document, resources, identities, data, time.Now())
	if err != nil {
		return nil, plan, BadAuthRequest("原工程部分时间、素材或分析版本无法安全映射，未改变当前项目，请核对原工程")
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, json.RawMessage(rows.Cut.PayloadJSON), s.projectedLegacyReframeResolver(userID, projectID, rows)); err != nil {
		return nil, plan, err
	}
	plan = LegacyNativePreview{ImportID: receipt.ID, ConverterVersion: production.LegacyNativeProjectionVersion, ProjectRevision: project.Revision, TimelineRevision: timeline.Revision, CutID: rows.Cut.ID, TimelineSHA256: rows.Cut.TimelineSHA256, Report: report}
	plan.PreviewToken = cutSignature(struct {
		UserID    string
		ProjectID string
		Source    string
		Plan      LegacyNativePreview
	}{userID, projectID, receipt.SourceFingerprint, plan})
	return rows, plan, nil
}
func (s *Service) PreviewLegacyNative(ctx context.Context, userID, projectID string, req LegacyNativeRequest) (LegacyNativePreview, error) {
	status, err := s.GetLegacyNativeStatus(userID, projectID)
	if err != nil {
		return LegacyNativePreview{}, err
	}
	if status.Cut != nil {
		project, err := s.activeProjectForUser(userID, projectID)
		if err != nil {
			return LegacyNativePreview{}, err
		}
		timeline, err := s.GetProjectTimeline(userID, projectID)
		if err != nil {
			return LegacyNativePreview{}, err
		}
		if req.ExpectedProjectRevision != project.Revision || req.ExpectedTimelineRevision != timeline.Revision {
			return LegacyNativePreview{}, cutConflict("项目或剪辑已更新，请重新核对转换记录")
		}
		receipt, err := s.repo.ProductionImportForProject(userID, projectID)
		if err != nil {
			return LegacyNativePreview{}, err
		}
		return legacyNativeReceiptPreview(userID, projectID, receipt, status.Cut, req)
	}
	_, plan, err := s.buildLegacyNativeProjection(ctx, userID, projectID, req)
	return plan, err
}
func (s *Service) ApplyLegacyNative(ctx context.Context, userID, projectID string, req LegacyNativeRequest) (ProjectCutView, error) {
	status, err := s.GetLegacyNativeStatus(userID, projectID)
	if err != nil {
		return ProjectCutView{}, err
	}
	if !status.Available {
		return ProjectCutView{}, NotFound("当前项目没有原始导入记录")
	}
	if req.PreviewToken == "" {
		return ProjectCutView{}, cutConflict("请先核对具体转换版本，使用原确认令牌查询结果")
	}
	receipt, err := s.repo.ProductionImportForProject(userID, projectID)
	if err != nil {
		return ProjectCutView{}, err
	}
	for version := production.LegacyNativeProjectionVersion; version >= 2; version-- {
		cut, lookupErr := s.repo.ProjectCutForRequest(userID, projectID, fmt.Sprintf("legacy-native-v%d:%s", version, receipt.ID))
		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			continue
		}
		if lookupErr != nil {
			return ProjectCutView{}, lookupErr
		}
		preview, previewErr := legacyNativeReceiptPreview(userID, projectID, receipt, cut, req)
		if previewErr == nil && preview.PreviewToken == req.PreviewToken {
			return s.ownedProjectCutView(cut, true)
		}
	}
	if status.Cut != nil {
		return ProjectCutView{}, cutConflict("此令牌与已确认的转换版本不一致，请读取原回执或重新预览")
	}
	rows, plan, err := s.buildLegacyNativeProjection(ctx, userID, projectID, req)
	if err != nil {
		return ProjectCutView{}, err
	}
	if req.PreviewToken == "" || req.PreviewToken != plan.PreviewToken {
		return ProjectCutView{}, cutConflict("转换预览已变化，请核对后重新确认")
	}
	incoming := int64(len(rows.Cut.PayloadJSON) + len(rows.Cut.MetadataJSON))
	for _, version := range rows.TranscriptRevisions {
		incoming += int64(len(version.DocumentJSON))
	}
	for _, analysis := range rows.MediaAnalyses {
		incoming += int64(len(analysis.SourceJSON) + len(analysis.EvidenceJSON))
	}
	for _, version := range rows.MediaAnalysisRevisions {
		incoming += int64(len(version.DocumentJSON))
	}
	if rows.Planning != nil {
		incoming += legacyPlanningStorageBytes(rows.Planning)
	}
	if rows.PrevisCanvas != nil {
		incoming += int64(len(rows.PrevisCanvas.PayloadJSON))
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(userID, incoming); err != nil {
		return ProjectCutView{}, err
	}
	cut := rows.Cut
	rows.Cut = nil
	err = s.repo.WithContext(ctx).CreateProjectCut(cut, req.ExpectedTimelineRevision, &req.ExpectedProjectRevision, func(tx *repository.Repository) error {
		if err := applyLegacyPrevisCanvas(tx, rows); err != nil {
			return err
		}
		if err := tx.CreateLegacySupplementRows(rows); err != nil {
			return err
		}
		return (&Service{repo: tx}).validateProjectTimelineMedia(userID, projectID, []byte(cut.PayloadJSON))
	})
	if err != nil {
		if existing, e := s.repo.ProjectCutForRequest(userID, projectID, cut.RequestID); e == nil {
			original, originalErr := legacyNativeReceiptPreview(userID, projectID, receipt, existing, req)
			if originalErr == nil && original.PreviewToken == req.PreviewToken {
				return s.ownedProjectCutView(existing, true)
			}
			return ProjectCutView{}, cutConflict("已有转换的确认内容不同，请读取原回执后再核对")
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) {
			return ProjectCutView{}, cutConflict("项目或剪辑已更新，转换未写入，请重新预览")
		}
		return ProjectCutView{}, err
	}
	return s.ownedProjectCutView(cut, false)
}
