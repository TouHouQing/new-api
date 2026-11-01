package app

import (
	"encoding/json"
	"strings"

	"yingce/backend/internal/imageops"
)

type cloudAgentImageEditIntent struct {
	SourceNodeID string `json:"sourceNodeId"`
	UseSavedMask bool   `json:"useSavedMask"`
}

func (s *Service) prepareCloudAgentImageEdit(userID, canvasID string, doc map[string]any, args cloudAgentMediaArgs, input map[string]any) error {
	if args.ImageEdit == nil {
		return nil
	}
	intent := args.ImageEdit
	if args.Mode != "image" || !intent.UseSavedMask || len(args.ReferenceNodeIDs) != 1 || args.ReferenceNodeIDs[0] != intent.SourceNodeID || len(args.ReferenceTransientIDs) != 0 {
		return BadAuthRequest("选区修改须引用唯一原图节点及其已保存的涂抹区域")
	}
	nodes, err := creationObjects(doc["nodes"])
	if err != nil {
		return err
	}
	node := nodes[intent.SourceNodeID]
	meta, _ := node["metadata"].(map[string]any)
	var mask struct {
		Version          int                   `json:"version"`
		SourceStorageKey string                `json:"sourceStorageKey"`
		Width            int                   `json:"width"`
		Height           int                   `json:"height"`
		Mode             string                `json:"mode"`
		Strokes          []imageops.MaskStroke `json:"strokes"`
	}
	encoded, err := json.Marshal(meta["imageMaskDocument"])
	if err != nil || json.Unmarshal(encoded, &mask) != nil || mask.Version != 1 || stringValue(node["type"]) != "image" || mask.SourceStorageKey != stringValue(meta["storageKey"]) || mask.Mode != "keep" {
		return BadAuthRequest("请先在原图上涂抹要修改的区域并保存；Agent不会自行推测选区")
	}
	resourceID := strings.TrimPrefix(mask.SourceStorageKey, "resource:")
	if !strings.HasPrefix(mask.SourceStorageKey, "resource:") || resourceID == "" {
		return BadAuthRequest("选区原图尚未保存到平台")
	}
	data, err := s.readImageOperationSource(userID, resourceID)
	if err != nil {
		return err
	}
	source, err := imageops.Inspect(data)
	if err != nil {
		return err
	}
	metadata := input["metadata"].(map[string]any)
	metadata["edit"] = "mask"
	metadata["nativeImageEdit"] = map[string]any{"version": 1, "sourceNodeId": intent.SourceNodeID, "resourceId": resourceID, "expectedSourceSha256": source.SHA256, "mask": imageops.Mask{Width: mask.Width, Height: mask.Height, Mode: "keep", Strokes: mask.Strokes}}
	return s.prepareNativeImageEdit(userID, canvasID, input)
}
