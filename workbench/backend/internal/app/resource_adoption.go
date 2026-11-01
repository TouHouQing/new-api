package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"math"
	"strings"
	"time"
	"unicode/utf8"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ResourceAdoptionRequest struct {
	ResourceID string  `json:"resourceId"`
	RequestID  string  `json:"requestId"`
	Title      string  `json:"title"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
}

type ResourceAdoptionResult struct {
	CanvasID         string `json:"canvasId"`
	ResourceID       string `json:"resourceId"`
	AssetID          string `json:"assetId"`
	AssetVersionID   string `json:"assetVersionId"`
	RepresentationID string `json:"representationId"`
	NodeID           string `json:"nodeId"`
	RequestSHA256    string `json:"requestSha256"`
	Revision         int64  `json:"revision"`
	Replayed         bool   `json:"replayed"`
}

func resourceAdoptionID(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:16])
}

// Adoption commits native asset/version/representation and canvas history
// together, preserving original bytes and subsequent undo when replayed.
func (s *Service) AdoptResource(userID, canvasID string, req ResourceAdoptionRequest) (ResourceAdoptionResult, error) {
	var result ResourceAdoptionResult
	if strings.TrimSpace(userID) == "" {
		return result, Unauthorized("请先登录")
	}
	if err := validateProjectCreationKey(req.RequestID); err != nil || req.RequestID == "" {
		return result, BadAuthRequest("采用素材需要16到128字符的稳定请求编号")
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = "导入素材"
	}
	if canvasID == "" || len(canvasID) > 80 || req.ResourceID == "" || len(req.ResourceID) > 80 || utf8.RuneCountInString(req.Title) > 240 || math.IsNaN(req.X) || math.IsNaN(req.Y) || math.IsInf(req.X, 0) || math.IsInf(req.Y, 0) || math.Abs(req.X) > 1e7 || math.Abs(req.Y) > 1e7 {
		return result, BadAuthRequest("素材采用参数无效")
	}
	raw, err := json.Marshal(req)
	if err != nil {
		return result, err
	}
	digest := sha256.Sum256(raw)
	intentSHA := hex.EncodeToString(digest[:])
	intentID := resourceAdoptionID("resource-adoption", userID, canvasID, req.RequestID)
	mutationID := "resource-adoption:" + intentID
	if previous, err := resourceAdoptionReplay(s.repo, userID, canvasID, mutationID, intentSHA); err != nil {
		return result, err
	} else if previous != nil {
		return *previous, nil
	}
	if _, err := s.repo.CanvasProjectForUser(userID, canvasID); errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("画布不存在")
	} else if err != nil {
		return result, err
	}
	inspected, err := s.resourceAdoptionMetadata(userID, req.ResourceID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("素材文件不存在")
	}
	if err != nil {
		return result, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		if err := repo.LockCanvasMutation(userID, canvasID); err != nil {
			return err
		}
		if previous, err := resourceAdoptionReplay(repo, userID, canvasID, mutationID, intentSHA); err != nil {
			return err
		} else if previous != nil {
			result = *previous
			return nil
		}
		project, err := repo.CanvasProjectForUser(userID, canvasID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return NotFound("画布不存在")
		}
		if err != nil {
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if project.ProjectID != "" {
			if _, err := writer.activeProjectForUser(userID, project.ProjectID); err != nil {
				return err
			}
		}
		resource, err := repo.ResourceForUser(userID, req.ResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return NotFound("素材文件不存在")
		}
		if err != nil {
			return err
		}
		if resource.Status != model.ResourceStatusReady || (resource.Kind != "image" && resource.Kind != "video" && resource.Kind != "audio") {
			return BadAuthRequest("请采用已完成上传的图片、视频或音频")
		}
		if resource.Kind != inspected.Kind || resource.MimeType != inspected.MimeType || resource.Size != inspected.Size || resource.ObjectKey != inspected.ObjectKey || resource.Provider != inspected.Provider {
			return NewAppError(409, "源文件在检查后发生变化，请重新确认")
		}
		resource.Width, resource.Height, resource.DurationMs = inspected.Width, inspected.Height, inspected.DurationMs
		asset, version, representation, node, err := resourceAdoptionRows(userID, canvasID, intentID, req, *resource, project.ProjectID)
		if err != nil {
			return err
		}
		usage, err := repo.UserStructuredStorageUsage(userID)
		if err != nil {
			return err
		}
		policy, err := writer.RuntimePolicy()
		if err != nil {
			return err
		}
		if _, err := repo.AssetForUser(userID, asset.ID); errors.Is(err, gorm.ErrRecordNotFound) {
			if err := validateStructuredStorageQuotaWithPolicy(usage, "asset", true, int64(len(asset.PayloadJSON)+len(version.DefinitionJSON)+len(representation.MetadataJSON)), policy.Resource); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if err := repo.CreateUploadedResourceAsset(&asset, &version, &representation); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return NotFound("源文件已不存在或状态已改变")
			}
			return err
		}
		if project.ProjectID != "" {
			position, err := repo.NextProjectAssetPosition(project.ProjectID, "")
			if err != nil {
				return err
			}
			if _, err := repo.LinkProjectAsset(&asset, nil, &model.ProjectAssetLink{ID: newID(), ProjectID: project.ProjectID, AssetID: asset.ID, Position: position, CreatedAt: time.Now()}); err != nil {
				return err
			}
		}
		base := project.Revision
		summary, err := writer.canvasDomain().ApplyUserCanvasOperations(userID, canvasID, canvas.CanvasOperationsRequest{MutationID: mutationID, BaseRevision: &base, Operations: []canvas.CanvasOperation{{Type: "create_node", Node: node}}})
		if err != nil {
			return err
		}
		result = ResourceAdoptionResult{CanvasID: canvasID, ResourceID: resource.ID, AssetID: asset.ID, AssetVersionID: version.ID, RepresentationID: representation.ID, NodeID: "resource-adoption:" + intentID, RequestSHA256: intentSHA, Revision: summary.Revision}
		receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
		if err != nil {
			return err
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(receipt.ResultJSON), &envelope); err != nil {
			return err
		}
		encoded, err := json.Marshal(result)
		if err != nil {
			return err
		}
		envelope["resourceAdoption"] = encoded
		encoded, err = json.Marshal(envelope)
		if err != nil {
			return err
		}
		receipt.ResultJSON = string(encoded)
		return repo.FinalizeCanvasMutationReceipt(receipt)
	})
	return result, err
}

func resourceAdoptionReplay(repo *repository.Repository, userID, canvasID, mutationID, intentSHA string) (*ResourceAdoptionResult, error) {
	receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var envelope struct {
		ResourceAdoption *ResourceAdoptionResult `json:"resourceAdoption"`
	}
	if json.Unmarshal([]byte(receipt.ResultJSON), &envelope) != nil || envelope.ResourceAdoption == nil || envelope.ResourceAdoption.RequestSHA256 != intentSHA {
		return nil, NewAppError(409, "同一采用编号不能用于不同的素材或位置")
	}
	envelope.ResourceAdoption.Replayed = true
	return envelope.ResourceAdoption, nil
}

func resourceAdoptionRows(userID, canvasID, intentID string, req ResourceAdoptionRequest, resource model.Resource, projectID string) (model.Asset, model.AssetVersion, model.AssetRepresentation, json.RawMessage, error) {
	now := time.Now()
	assetID := resourceAdoptionID("uploaded-asset", userID, resource.ID)
	versionID := resourceAdoptionID("uploaded-version", userID, resource.ID)
	representationID := resourceAdoptionID("uploaded-representation", userID, resource.ID)
	url := resourceFileURL(resource.ID)
	definition, _ := json.Marshal(map[string]any{"version": 1, "source": "resource-upload", "resourceId": resource.ID, "mimeType": resource.MimeType, "bytes": resource.Size, "width": resource.Width, "height": resource.Height, "durationMs": resource.DurationMs})
	metadata := map[string]any{"source": "resource-upload", "sourceCanvasId": canvasID, "sourceNodeId": "resource-adoption:" + intentID, "resourceKey": "resource:" + resource.ID}
	if projectID != "" {
		metadata["projectIds"] = []string{projectID}
	}
	data := map[string]any{"storageKey": "resource:" + resource.ID, "width": resource.Width, "height": resource.Height, "bytes": resource.Size, "mimeType": resource.MimeType, "durationMs": resource.DurationMs}
	if resource.Kind == "image" {
		data["dataUrl"] = url
	} else {
		data["url"] = url
	}
	payload, err := json.Marshal(map[string]any{"id": assetID, "kind": resource.Kind, "title": req.Title, "category": model.AssetCategoryMaterial, "status": model.AssetVersionStatusConfirmed, "primaryVersionId": versionID, "source": "上传素材", "coverUrl": url, "tags": []string{}, "data": data, "metadata": metadata, "createdAt": now.UTC().Format(time.RFC3339Nano), "updatedAt": now.UTC().Format(time.RFC3339Nano)})
	asset := model.Asset{ID: assetID, UserID: userID, Kind: resource.Kind, Title: req.Title, Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, PrimaryVersionID: versionID, PayloadJSON: string(payload), CreatedAt: now, UpdatedAt: now}
	version := model.AssetVersion{ID: versionID, AssetID: assetID, Version: 1, Status: model.AssetVersionStatusConfirmed, DefinitionJSON: string(definition), CreatedAt: now, UpdatedAt: now}
	// No synthetic task: distinguish original roles in the task-role index
	// while keeping the concrete version and original resource references.
	representation := model.AssetRepresentation{ID: representationID, AssetVersionID: versionID, ResourceID: resource.ID, MediaType: resource.Kind, Role: "import:" + representationID[:24], MetadataJSON: string(definition), CreatedAt: now}
	if err != nil {
		return asset, version, representation, nil, err
	}
	width, height := 320.0, 240.0
	if resource.Kind == "audio" {
		width, height = 340, 120
	} else if resource.Width > 0 && resource.Height > 0 {
		ratio := math.Min(320/float64(resource.Width), 240/float64(resource.Height))
		width, height = math.Max(1, math.Round(float64(resource.Width)*ratio)), math.Max(1, math.Round(float64(resource.Height)*ratio))
	}
	nodeMetadata := map[string]any{"content": url, "storageKey": "resource:" + resource.ID, "status": "success", "assetId": assetID, "assetVersionId": versionID, "bytes": resource.Size, "mimeType": resource.MimeType, "durationMs": resource.DurationMs, "naturalWidth": resource.Width, "naturalHeight": resource.Height}
	node, err := json.Marshal(map[string]any{"id": "resource-adoption:" + intentID, "type": resource.Kind, "title": req.Title, "position": map[string]any{"x": req.X, "y": req.Y}, "width": width, "height": height, "metadata": nodeMetadata})
	return asset, version, representation, node, err
}
