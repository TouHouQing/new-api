package app

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Resolve original imported revision identities, never the later current
// analysis pointer. Regional conversion only reads these immutable rows.
func (s *Service) legacyRegionalReframeContext(userID, projectID string, receipt *model.ProductionImport, document map[string]any, resources map[string]model.Resource, sourceID string) (production.LegacyVersionReframeContext, error) {
	result := production.LegacyVersionReframeContext{Analyses: production.LegacyMediaAnalysisProjection{AnalysisIDs: map[string]string{}, VersionIDs: map[string]string{}}, Data: production.LegacyProjectionData{Artifacts: map[string][]byte{}}}
	state, _ := document["production"].(map[string]any)
	refs := map[string]map[string]any{}
	values, _ := state["analysisRefs"].([]any)
	for _, value := range values {
		ref, _ := value.(map[string]any)
		if id, ok := ref["id"].(string); ok {
			refs[id] = ref
		}
	}
	versions, _ := state["regionalVersions"].([]any)
	needed := map[string]bool{}
	for _, value := range versions {
		version, _ := value.(map[string]any)
		if version["id"] != sourceID {
			continue
		}
		framingRefs, _ := version["reframes"].(map[string]any)
		for _, value := range framingRefs {
			ref, _ := value.(map[string]any)
			if id, ok := ref["analysisId"].(string); ok && id != "" && refs[id]["kind"] == "subjects" {
				needed[id] = true
			}
		}
	}
	if len(needed) == 0 {
		return result, nil
	}
	if len(needed) > 100 {
		return result, BadAuthRequest("区域构图数量超过本次转换范围")
	}
	var root *model.ProjectCut
	for version := production.LegacyNativeProjectionVersion; version >= 5; version-- {
		cut, err := s.repo.ProjectCutForRequest(userID, projectID, fmt.Sprintf("legacy-native-v%d:%s", version, receipt.ID))
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return result, err
		}
		root = cut
		break
	}
	if root == nil {
		failure := NewAppError(409, "请先在“旧工程的剪辑与制作内容”完成原生转换，再转换区域构图；工作剪辑未改变")
		failure.Reason = "legacy_analysis_upgrade_required"
		return result, failure
	}
	var metadata struct {
		SourceFingerprint string                       `json:"sourceFingerprint"`
		IdentityMap       map[string]map[string]string `json:"identityMap"`
	}
	if root.SourceImportID != receipt.ID || json.Unmarshal([]byte(root.MetadataJSON), &metadata) != nil || metadata.SourceFingerprint != receipt.SourceFingerprint {
		return result, NewAppError(500, "原生分析历史的导入身份无法核对")
	}
	ordered := make([]string, 0, len(needed))
	for id := range needed {
		ordered = append(ordered, id)
	}
	sort.Strings(ordered)
	seen := map[string]bool{}
	var total int64
	for _, oldID := range ordered {
		aid, rid := metadata.IdentityMap["mediaAnalyses"][oldID], metadata.IdentityMap["mediaAnalysisVersions"][oldID]
		if aid == "" || rid == "" {
			// Unsupported old analyses stay explicit in the regional report.
			continue
		}
		row, err := s.repo.ProjectMediaAnalysis(userID, projectID, aid)
		if err != nil {
			return result, err
		}
		version, err := s.repo.ProjectMediaAnalysisRevision(userID, aid, rid)
		if err != nil {
			return result, err
		}
		if row.SourceImportID != receipt.ID || row.SourceKind != "legacy_import" || row.Kind != "subject_track" {
			return result, BadAuthRequest("区域构图指向其他来源的分析，未创建转换版本")
		}
		artifactID, _ := refs[oldID]["artifactMediaId"].(string)
		if _, ok := result.Data.Artifacts[artifactID]; !ok {
			resource, exists := resources[artifactID]
			if !exists || resource.Status != model.ResourceStatusReady || resource.Size < 1 || resource.Size > production.MaxLegacyDocumentBytes {
				return result, BadAuthRequest("区域构图的历史分析文件缺失或过大")
			}
			total += resource.Size
			if total > 64<<20 {
				return result, BadAuthRequest("区域构图的历史分析总量过大")
			}
			_, reader, err := s.OpenResource(userID, artifactID)
			if err != nil {
				return result, err
			}
			raw, err := io.ReadAll(io.LimitReader(reader, resource.Size+1))
			reader.Close()
			if err != nil || int64(len(raw)) != resource.Size {
				return result, BadAuthRequest("区域构图的历史分析文件读取不完整")
			}
			result.Data.Artifacts[artifactID] = raw
		}
		raw := result.Data.Artifacts[artifactID]
		var evidence struct {
			History []struct {
				AnalysisID string `json:"analysisId"`
				ResourceID string `json:"artifactResourceId"`
				SHA256     string `json:"artifactSha256"`
			} `json:"legacyHistory"`
		}
		if json.Unmarshal([]byte(row.EvidenceJSON), &evidence) != nil {
			return result, BadAuthRequest("区域构图的分析来源记录无法读取")
		}
		verified := false
		for _, entry := range evidence.History {
			if entry.AnalysisID == oldID && entry.ResourceID == artifactID && entry.SHA256 == fmt.Sprintf("%x", sha256.Sum256(raw)) {
				verified = true
			}
		}
		if !verified {
			return result, BadAuthRequest("区域构图的历史分析文件与原始摘要不符")
		}
		if !seen[aid] {
			result.Analyses.Analyses = append(result.Analyses.Analyses, *row)
			seen[aid] = true
		}
		result.Analyses.Versions = append(result.Analyses.Versions, *version)
		result.Analyses.AnalysisIDs[oldID], result.Analyses.VersionIDs[oldID] = aid, rid
	}
	return result, nil
}
