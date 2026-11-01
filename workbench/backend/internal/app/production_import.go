package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

type LegacyProjectInspection struct {
	production.LegacyBundleInspection
	Projection *production.LegacyProjectionReport `json:"projection,omitempty"`
}
type LegacyProjectImportResult struct {
	Receipt model.ProductionImport            `json:"receipt"`
	Report  production.LegacyProjectionReport `json:"report"`
	Reused  bool                              `json:"reused"`
}

func (s *Service) InspectLegacyProject(userID string, reader io.ReaderAt, size int64) (LegacyProjectInspection, error) {
	if _, err := s.repo.User(userID); err != nil {
		return LegacyProjectInspection{}, err
	}
	bundle, err := production.OpenLegacyBundle(reader, size)
	if err != nil {
		return LegacyProjectInspection{}, BadAuthRequest("工程包格式、文件或引用校验失败，请重新导出完整备份")
	}
	result := LegacyProjectInspection{LegacyBundleInspection: bundle.Inspection}
	if !bundle.Inspection.ReadyForMigration {
		return result, nil
	}
	report, err := preflightLegacyProjection(bundle, userID)
	if err != nil {
		return LegacyProjectInspection{}, BadAuthRequest("工程包含无法映射的节点、连接或素材版本，请先修复原工程")
	}
	result.Projection = &report
	return result, nil
}

func preflightLegacyProjection(bundle *production.LegacyBundle, userID string) (production.LegacyProjectionReport, error) {
	paths := map[string]string{}
	resources := map[string]model.Resource{}
	for _, entry := range bundle.Inspection.Resources {
		id := "preflight-" + entry.Path
		paths[entry.Path] = id
		resources[id] = model.Resource{ID: id, UserID: userID, MimeType: entry.MIMEType, Size: entry.Size}
	}
	document, err := bundle.RestoreLegacyMedia(paths)
	if err != nil {
		return production.LegacyProjectionReport{}, err
	}
	data, err := bundle.ProjectionData(paths)
	if err != nil {
		return production.LegacyProjectionReport{}, err
	}
	data.Preflight = true
	_, report, err := production.ProjectLegacyDocument(document, bundle.Inspection, resources, userID, bundle.Inspection.Title, time.Now(), newID, data)
	return report, err
}

func (s *Service) ImportLegacyProject(ctx context.Context, userID string, reader io.ReaderAt, size int64, expectedFingerprint, name string) (LegacyProjectImportResult, error) {
	if _, err := s.repo.User(userID); err != nil {
		return LegacyProjectImportResult{}, err
	}
	bundle, err := production.OpenLegacyBundle(reader, size)
	if err != nil {
		return LegacyProjectImportResult{}, BadAuthRequest("工程包格式、文件或引用校验失败，请重新导出完整备份")
	}
	if err = bundle.Inspection.ValidateComplete(); err != nil {
		return LegacyProjectImportResult{}, BadAuthRequest("工程包缺少素材，无法完整迁移，请重新导出")
	}
	if expectedFingerprint == "" || expectedFingerprint != bundle.Inspection.SourceFingerprint {
		return LegacyProjectImportResult{}, BadAuthRequest("工程包已变化，请重新检查后导入")
	}
	if existing, lookupErr := s.repo.ProductionImportForSource(userID, expectedFingerprint); lookupErr == nil {
		return s.productionImportResult(userID, existing, true)
	} else if !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
		return LegacyProjectImportResult{}, lookupErr
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = bundle.Inspection.Title + "（导入）"
	}
	if len([]rune(name)) > 200 {
		return LegacyProjectImportResult{}, BadAuthRequest("项目名称不能超过 200 字")
	}
	if _, err := preflightLegacyProjection(bundle, userID); err != nil {
		return LegacyProjectImportResult{}, BadAuthRequest("工程包含无法映射的节点、连接或素材版本，请先修复原工程")
	}
	if err := s.EnsureBuiltinProjectWorkflowTemplate(); err != nil {
		return LegacyProjectImportResult{}, err
	}
	tmpDir := filepath.Join(s.dataDir, "tmp", "production-imports")
	if s.dataDir == "" {
		return LegacyProjectImportResult{}, errors.New("production import requires the configured persistent data directory")
	}
	if err := os.MkdirAll(tmpDir, 0700); err != nil {
		return LegacyProjectImportResult{}, err
	}
	paths := map[string]string{}
	resources := map[string]model.Resource{}
	for _, entry := range bundle.Inspection.Resources {
		if err := ctx.Err(); err != nil {
			return LegacyProjectImportResult{}, err
		}
		resource, err := s.importLegacyResource(ctx, bundle, userID, tmpDir, entry)
		if err != nil {
			return LegacyProjectImportResult{}, err
		}
		paths[entry.Path] = resource.ID
		resources[resource.ID] = *resource
	}
	document, err := bundle.RestoreLegacyMedia(paths)
	if err != nil {
		return LegacyProjectImportResult{}, BadAuthRequest("工程包中素材的位置与内容不一致")
	}
	data, err := bundle.ProjectionData(paths)
	if err != nil {
		return LegacyProjectImportResult{}, BadAuthRequest("旧文字稿文件无法完整解析，未创建项目，请检查工程包")
	}
	rows, report, err := production.ProjectLegacyDocument(document, bundle.Inspection, resources, userID, name, time.Now(), newID, data)
	if err != nil {
		return LegacyProjectImportResult{}, BadAuthRequest("工程中包含无法映射的节点或连接，请先修复原工程")
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	policy, err := s.RuntimePolicy()
	if err != nil {
		return LegacyProjectImportResult{}, err
	}
	usage, err := s.repo.UserStorageUsage(userID)
	if err != nil {
		return LegacyProjectImportResult{}, err
	}
	structuredIncoming := int64(len(rows.Canvas.PayloadJSON) + len(rows.Receipt.SourceDocumentJSON) + len(rows.Receipt.ResourceRefsJSON) + len(rows.Receipt.ReportJSON) + len(rows.Receipt.IdentityMapJSON))
	structuredIncoming += int64(len(rows.Project.Description)+len(rows.Project.CreativeBriefJSON)+len(rows.Unit.SourceText)) + legacyPlanningStorageBytes(rows.Planning)
	for _, revision := range rows.ShotRevisions {
		raw, _ := json.Marshal(revision)
		structuredIncoming += int64(len(raw))
	}
	if rows.Timeline != nil {
		structuredIncoming += int64(len(rows.Timeline.PayloadJSON))
	}
	if rows.Cut != nil {
		structuredIncoming += int64(len(rows.Cut.PayloadJSON) + len(rows.Cut.MetadataJSON))
	}
	for _, revision := range rows.TranscriptRevisions {
		structuredIncoming += int64(len(revision.DocumentJSON))
	}
	for _, analysis := range rows.MediaAnalyses {
		structuredIncoming += int64(len(analysis.SourceJSON) + len(analysis.EvidenceJSON))
	}
	for _, revision := range rows.MediaAnalysisRevisions {
		structuredIncoming += int64(len(revision.DocumentJSON))
	}
	for _, asset := range rows.Assets {
		structuredIncoming += int64(len(asset.PayloadJSON))
	}
	if usage.AssetCount+int64(len(rows.Assets)) > policy.Resource.AssetCount {
		return LegacyProjectImportResult{}, QuotaExceeded("导入后会超过素材数量上限，请先整理素材库")
	}
	if err := validateStructuredStorageQuotaWithPolicy(usage, "canvas", true, structuredIncoming, policy.Resource); err != nil {
		return LegacyProjectImportResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return LegacyProjectImportResult{}, err
	}
	err = s.repo.WithContext(ctx).CreateProductionImport(rows, func(repo *repository.Repository) error {
		transactionService := &Service{repo: repo}
		if rows.Timeline != nil {
			if err := transactionService.validateProjectTimelineMedia(userID, rows.Project.ID, json.RawMessage(rows.Timeline.PayloadJSON)); err != nil {
				return err
			}
		}
		if _, err := transactionService.createProjectWorkflow(rows.Project.ID, "", "project"); err != nil {
			return err
		}
		_, err := transactionService.createProjectWorkflow(rows.Project.ID, rows.Unit.ID, "unit")
		return err
	})
	if err != nil {
		// A concurrent identical request may have committed first. Never convert
		// an arbitrary failure into success without an owner-scoped receipt.
		if receipt, lookupErr := s.repo.ProductionImportForSource(userID, expectedFingerprint); lookupErr == nil {
			return s.productionImportResult(userID, receipt, true)
		}
		if errors.Is(err, repository.ErrProjectNameConflict) {
			conflict := NewAppError(http.StatusConflict, "项目名称已存在，请换一个名称后重试")
			conflict.Reason = ReasonProjectNameConflict
			return LegacyProjectImportResult{}, conflict
		}
		return LegacyProjectImportResult{}, err
	}
	return LegacyProjectImportResult{Receipt: rows.Receipt, Report: report}, nil
}

func (s *Service) productionImportResult(userID string, receipt *model.ProductionImport, reused bool) (LegacyProjectImportResult, error) {
	if _, err := s.repo.ProjectForUser(userID, receipt.ProjectID); err != nil {
		return LegacyProjectImportResult{}, err
	}
	var report production.LegacyProjectionReport
	if err := json.Unmarshal([]byte(receipt.ReportJSON), &report); err != nil {
		return LegacyProjectImportResult{}, err
	}
	return LegacyProjectImportResult{Receipt: *receipt, Report: report, Reused: reused}, nil
}

func (s *Service) importLegacyResource(ctx context.Context, bundle *production.LegacyBundle, userID, tmpDir string, entry production.LegacyResource) (*model.Resource, error) {
	stream, err := bundle.OpenMedia(entry.Path)
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	temporary, err := os.CreateTemp(tmpDir, "media-*")
	if err != nil {
		return nil, err
	}
	defer func() {
		temporary.Close()
		if err := os.Remove(temporary.Name()); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("production import spool cleanup failed: %v", err)
		}
	}()
	if n, err := io.Copy(temporary, io.LimitReader(stream, entry.Size+1)); err != nil || n != entry.Size {
		return nil, fmt.Errorf("工程素材读取失败: %s", entry.Path)
	}
	extension := ".bin"
	if extensions, _ := mime.ExtensionsByType(entry.MIMEType); len(extensions) > 0 {
		extension = extensions[0]
	}
	width, height, duration, err := inspectProductionImportMedia(ctx, temporary, entry.MIMEType)
	if err != nil {
		return nil, err
	}
	return s.UploadResourceFile(userID, "studio-"+entry.SHA256[:16]+extension, entry.Size, "", width, height, duration, temporary, "studio-import:"+bundle.Inspection.SourceFingerprint+":"+entry.Path)
}
