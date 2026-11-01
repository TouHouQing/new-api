package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type LegacyVersionEntry struct {
	production.LegacyVersionSource
	Cut             *model.ProjectCut `json:"cut,omitempty"`
	RequiresUpgrade bool              `json:"requiresUpgrade,omitempty"`
}

type LegacyVersionPage struct {
	ConverterVersion int                  `json:"converterVersion"`
	SourceSHA256     string               `json:"sourceSha256"`
	Versions         []LegacyVersionEntry `json:"versions"`
	NextCursor       int                  `json:"nextCursor,omitempty"`
}

type LegacyVersionRequest struct {
	SourceID                 string   `json:"sourceId"`
	SourceSHA256             string   `json:"sourceSha256"`
	ExpectedProjectRevision  int64    `json:"expectedProjectRevision"`
	ExpectedTimelineRevision int64    `json:"expectedTimelineRevision"`
	PreviewToken             string   `json:"previewToken,omitempty"`
	AcceptPreservedFields    []string `json:"acceptPreservedFields,omitempty"`
}

type LegacyVersionPreview struct {
	Source        production.LegacyVersionSource `json:"source"`
	CutID         string                         `json:"cutId"`
	Summary       ProjectCutSummary              `json:"summary"`
	PreservedOnly []string                       `json:"preservedOnly"`
	Warnings      []string                       `json:"warnings"`
	Output        timelineRenderFormat           `json:"output"`
	PreviewToken  string                         `json:"previewToken"`
}

func (s *Service) legacyVersionDocument(userID, projectID string) (*model.ProductionImport, map[string]any, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return nil, nil, NotFound("项目不存在或无权查看")
	}
	receipt, err := s.repo.ProductionImportForProject(userID, projectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, NotFound("当前项目没有原始导入记录")
	}
	if err != nil {
		return nil, nil, err
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewBufferString(receipt.SourceDocumentJSON))
	decoder.UseNumber()
	if decoder.Decode(&document) != nil || document == nil {
		return nil, nil, NewAppError(500, "原始工程档案无法读取，请检查备份")
	}
	return receipt, document, nil
}

func legacyVersionRequestID(importID, sourceID string) string {
	return legacyVersionRequestIDFor(production.LegacyRegionalProjectionVersion, importID, sourceID)
}

func legacyVersionRequestIDFor(version int, importID, sourceID string) string {
	label := "legacy-regional-v" + strconv.Itoa(version)
	return label + ":" + mediaAnalysisID("legacy-regional-request-v"+strconv.Itoa(version), importID, sourceID)
}

func (s *Service) ReadLegacyVersions(userID, projectID, sourceSHA256 string, cursor, limit int) (LegacyVersionPage, error) {
	result := LegacyVersionPage{ConverterVersion: production.LegacyRegionalProjectionVersion, Versions: []LegacyVersionEntry{}}
	if cursor < 0 || limit < 1 || limit > 20 {
		return result, BadAuthRequest("旧工程版本分页无效")
	}
	receipt, document, err := s.legacyVersionDocument(userID, projectID)
	if err != nil {
		return result, err
	}
	result.SourceSHA256 = cutSignature(json.RawMessage(receipt.SourceDocumentJSON))
	if sourceSHA256 != "" && sourceSHA256 != result.SourceSHA256 || cursor > 0 && sourceSHA256 == "" {
		return result, cutConflict("原始工程档案已变化，请重新读取版本")
	}
	sources, err := production.LegacyVersionSources(document)
	if err != nil || cursor > len(sources) {
		return result, BadAuthRequest("原工程版本身份或分页无法核对")
	}
	end := min(len(sources), cursor+limit)
	for _, source := range sources[cursor:end] {
		entry := LegacyVersionEntry{LegacyVersionSource: source}
		for version := production.LegacyRegionalProjectionVersion; version >= 1; version-- {
			entry.Cut, err = s.repo.ProjectCutForRequest(userID, projectID, legacyVersionRequestIDFor(version, receipt.ID, source.ID))
			if errors.Is(err, gorm.ErrRecordNotFound) {
				entry.Cut = nil
			} else if err != nil {
				return result, err
			} else {
				entry.RequiresUpgrade = version < 2 && source.HasMotionGraphics || version < 3 && source.HasReframes || version < 4 && source.HasAttachedAudio
				break
			}
		}
		result.Versions = append(result.Versions, entry)
	}
	if end < len(sources) {
		result.NextCursor = end
	}
	return result, nil
}

func (s *Service) buildLegacyVersion(userID, projectID string, request LegacyVersionRequest) (*model.ProjectCut, LegacyVersionPreview, error) {
	var result LegacyVersionPreview
	if request.SourceID == "" || len(request.SourceID) > 128 || len(request.SourceSHA256) != 64 || request.ExpectedProjectRevision < 1 || request.ExpectedTimelineRevision < 0 {
		return nil, result, BadAuthRequest("请读取原始版本和当前剪辑，再预览转换")
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return nil, result, err
	}
	current, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return nil, result, err
	}
	if project.Revision != request.ExpectedProjectRevision || current.Revision != request.ExpectedTimelineRevision {
		return nil, result, cutConflict("项目或工作剪辑已变化，请保存后重新预览转换")
	}
	receipt, document, err := s.legacyVersionDocument(userID, projectID)
	if err != nil {
		return nil, result, err
	}
	if request.SourceSHA256 != cutSignature(json.RawMessage(receipt.SourceDocumentJSON)) {
		return nil, result, cutConflict("原始工程档案已变化，请重新读取版本")
	}
	var identities map[string]map[string]string
	var references []struct {
		ResourceID string `json:"resourceId"`
	}
	if json.Unmarshal([]byte(receipt.IdentityMapJSON), &identities) != nil || identities == nil || json.Unmarshal([]byte(receipt.ResourceRefsJSON), &references) != nil || len(references) > 1000 {
		return nil, result, NewAppError(500, "原始素材或身份映射无法读取")
	}
	resources := map[string]model.Resource{}
	for _, ref := range references {
		resource, err := s.repo.ResourceForUser(userID, ref.ResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Other archived versions may refer to missing files. The domain
			// converter rejects missing files used by this exact version.
			continue
		}
		if err != nil {
			return nil, result, err
		}
		if resource.Status == model.ResourceStatusReady {
			resources[resource.ID] = *resource
		}
	}
	framing, err := s.legacyRegionalReframeContext(userID, projectID, receipt, document, resources, request.SourceID)
	if err != nil {
		return nil, result, err
	}
	converted, err := production.ProjectLegacyVersion(document, request.SourceID, receipt.ID, resources, identities, false, framing)
	if err != nil {
		return nil, result, BadAuthRequest("此版本的固定原片、时间或字幕无法完整转换，请先核对原工程；当前剪辑未改变")
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, converted.Timeline); err != nil {
		return nil, result, err
	}
	output := timelineRenderFormat{Width: converted.Source.Width, Height: converted.Source.Height, FPS: converted.Source.FPS, Fit: converted.Source.Fit}
	if err := validateTimelineOutput(output); err != nil {
		return nil, result, BadAuthRequest(err.Error())
	}
	converter := "legacy-regional-v" + strconv.Itoa(production.LegacyRegionalProjectionVersion)
	id := mediaAnalysisID("legacy-regional-cut-v"+strconv.Itoa(production.LegacyRegionalProjectionVersion), userID, projectID, receipt.ID, request.SourceID)
	result = LegacyVersionPreview{Source: converted.Source, CutID: id, Summary: cutSummary(converted.Timeline), PreservedOnly: converted.PreservedOnly, Warnings: converted.Warnings, Output: output}
	metadata, _ := json.Marshal(map[string]any{"converter": converter, "sourceImportId": receipt.ID, "sourceSha256": request.SourceSHA256, "sourceVersion": converted.Source, "preservedOnly": converted.PreservedOnly, "warnings": converted.Warnings, "renderOutput": output})
	row := &model.ProjectCut{ID: id, UserID: userID, ProjectID: projectID, RequestID: legacyVersionRequestID(receipt.ID, request.SourceID), RequestSHA256: cutSignature(struct{ SourceID, SourceSHA256 string }{request.SourceID, request.SourceSHA256}), Title: converted.Source.Title, Kind: "locale", Language: converted.Source.Language, Region: converted.Source.Region, SourceImportID: receipt.ID, SourceKey: converter + ":" + request.SourceID, TimelineRevision: current.Revision, TimelineSHA256: result.Summary.SHA256, PayloadJSON: string(converted.Timeline), MetadataJSON: string(metadata), CreatedAt: time.Now()}
	if len([]rune(row.Language)) > 40 || len([]rune(row.Region)) > 100 {
		return nil, result, BadAuthRequest("原始版本语言或地区超过支持范围")
	}
	for ratio, dimensions := range map[string][2]int{"16:9": {16, 9}, "9:16": {9, 16}, "1:1": {1, 1}, "4:3": {4, 3}, "3:4": {3, 4}} {
		if converted.Source.Width > 0 && converted.Source.Height > 0 && converted.Source.Width*dimensions[1] == converted.Source.Height*dimensions[0] {
			row.AspectRatio = ratio
			break
		}
	}
	request.PreviewToken = ""
	request.AcceptPreservedFields = nil
	result.PreviewToken = cutSignature(struct {
		User, Project string
		Request       LegacyVersionRequest
		Plan          LegacyVersionPreview
	}{userID, projectID, request, result})
	return row, result, nil
}

func (s *Service) PreviewLegacyVersion(userID, projectID string, request LegacyVersionRequest) (LegacyVersionPreview, error) {
	_, preview, err := s.buildLegacyVersion(userID, projectID, request)
	return preview, err
}

func (s *Service) ApplyLegacyVersion(userID, projectID string, request LegacyVersionRequest) (ProjectCutView, error) {
	receipt, _, err := s.legacyVersionDocument(userID, projectID)
	if err != nil {
		return ProjectCutView{}, err
	}
	if request.SourceSHA256 != cutSignature(json.RawMessage(receipt.SourceDocumentJSON)) || strings.TrimSpace(request.SourceID) == "" {
		return ProjectCutView{}, cutConflict("原始版本不匹配，请重新读取")
	}
	requestID := legacyVersionRequestID(receipt.ID, request.SourceID)
	signature := cutSignature(struct{ SourceID, SourceSHA256 string }{request.SourceID, request.SourceSHA256})
	if previous, err := s.repo.ProjectCutForRequest(userID, projectID, requestID); err == nil {
		if previous.RequestSHA256 != signature {
			return ProjectCutView{}, cutConflict("原始档案与已转换版本不一致，请保留两个版本后检查")
		}
		return s.ownedProjectCutView(previous, true)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectCutView{}, err
	}
	row, plan, err := s.buildLegacyVersion(userID, projectID, request)
	if err != nil {
		return ProjectCutView{}, err
	}
	if request.PreviewToken == "" || request.PreviewToken != plan.PreviewToken {
		return ProjectCutView{}, cutConflict("请重新检查固定素材和转换预览后确认")
	}
	if !slices.Equal(request.AcceptPreservedFields, plan.PreservedOnly) {
		return ProjectCutView{}, BadAuthRequest("请明确核对仍保留在原始档案中的高级设置")
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(row.PayloadJSON)+len(row.MetadataJSON))); err != nil {
		return ProjectCutView{}, err
	}
	if err := s.repo.CreateProjectCut(row, request.ExpectedTimelineRevision, &request.ExpectedProjectRevision, nil); err != nil {
		if previous, e := s.repo.ProjectCutForRequest(userID, projectID, requestID); e == nil && previous.RequestSHA256 == signature {
			return s.ownedProjectCutView(previous, true)
		}
		if errors.Is(err, repository.ErrTimelineResourceChanged) {
			return ProjectCutView{}, timelineResourceChangedError()
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) || errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCutView{}, cutConflict("项目、工作剪辑或素材已变化，未转换；请重新预览")
		}
		return ProjectCutView{}, fmt.Errorf("create native regional cut: %w", err)
	}
	return s.ownedProjectCutView(row, false)
}

func (s *Service) legacyRegionalDeliveryBlockers(cut *model.ProjectCut) []string {
	if !strings.HasPrefix(cut.SourceKey, "legacy-regional-v") {
		return nil
	}
	blocked := func(reason string) []string { return []string{"regionalVersions." + reason} }
	label, sourceID, ok := strings.Cut(cut.SourceKey, ":")
	version, parseError := strconv.Atoi(strings.TrimPrefix(label, "legacy-regional-v"))
	if !ok || sourceID == "" || parseError != nil || version < 1 || version > production.LegacyRegionalProjectionVersion || label != "legacy-regional-v"+strconv.Itoa(version) {
		return blocked("converter-mismatch")
	}
	receipt, err := s.repo.ProductionImportForProject(cut.UserID, cut.ProjectID)
	if err != nil || receipt.ID != cut.SourceImportID {
		return blocked("source-unavailable")
	}
	var metadata struct {
		Converter     string   `json:"converter"`
		SourceSHA256  string   `json:"sourceSha256"`
		PreservedOnly []string `json:"preservedOnly"`
	}
	if json.Unmarshal([]byte(cut.MetadataJSON), &metadata) != nil {
		return blocked("source-unreadable")
	}
	if metadata.Converter != "" && metadata.Converter != label || version >= 3 && metadata.Converter != label {
		return blocked("converter-mismatch")
	}
	if metadata.SourceSHA256 != cutSignature(json.RawMessage(receipt.SourceDocumentJSON)) {
		return blocked("source-changed")
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewBufferString(receipt.SourceDocumentJSON))
	decoder.UseNumber()
	if decoder.Decode(&document) != nil {
		return blocked("source-unreadable")
	}
	fields, err := production.LegacyVersionPreservedFields(document, sourceID)
	if err != nil {
		return blocked("source-unavailable")
	}
	if version >= 2 {
		fields = slices.DeleteFunc(fields, func(field string) bool { return field == "regionalVersions.motionGraphics" })
	}
	if version >= 3 {
		fields = slices.DeleteFunc(fields, func(field string) bool { return field == "regionalVersions.reframes" })
	}
	for _, field := range metadata.PreservedOnly {
		if !slices.Contains(fields, field) {
			fields = append(fields, field)
		}
	}
	return fields
}
