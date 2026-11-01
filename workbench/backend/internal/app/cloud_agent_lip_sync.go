// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"encoding/json"
	"strconv"
	"yingce/backend/internal/protocol"
)

// Expose reviewed node identities and times, never storage locators or URLs.
func cloudAgentLipSyncSummary(node map[string]any, nodes map[string]map[string]any) map[string]any {
	meta, _ := node["metadata"].(map[string]any)
	raw := meta["lipSyncDraft"]
	if raw == nil {
		return nil
	}
	body, err := json.Marshal(raw)
	if err != nil {
		return map[string]any{"settingsReady": false}
	}
	var plan protocol.LipSyncPlan
	if json.Unmarshal(body, &plan) != nil || plan.Version != 1 || plan.SourceNodeID != stringValue(node["id"]) || len(plan.AudioNodeID) > 128 || plan.AudioNodeID == "" || plan.SourceKind != stringValue(node["type"]) || plan.Selection.Validate() != nil {
		return map[string]any{"settingsReady": false, "issue": "请在原画面补全并保存口型设置"}
	}
	audio := nodes[plan.AudioNodeID]
	audioMeta, _ := audio["metadata"].(map[string]any)
	bindings := meta["storageKey"] == plan.SourceStorageKey && audio["type"] == "audio" && audioMeta["storageKey"] == plan.AudioStorageKey
	_, decodeErr := protocol.DecodeLipSyncPlan(raw)
	return map[string]any{"sourceNodeId": plan.SourceNodeID, "audioNodeId": plan.AudioNodeID, "selection": plan.Selection, "settingsReady": bindings && decodeErr == nil, "rightsConfirmed": bindings && decodeErr == nil}
}

func (s *Service) prepareCloudAgentLipSync(userID, canvasID string, doc map[string]any, args cloudAgentMediaArgs, input map[string]any) error {
	if args.LipSyncSourceNodeID == "" {
		return nil
	}
	if args.Mode != "video" || len(args.ReferenceNodeIDs) != 2 || len(args.ReferenceTransientIDs) != 0 || args.SourceNodeID != "" {
		return BadAuthRequest("口型须引用原画面及已保存设置中的对白节点")
	}
	nodes, err := creationObjects(doc["nodes"])
	if err != nil {
		return err
	}
	node := nodes[args.LipSyncSourceNodeID]
	meta, _ := node["metadata"].(map[string]any)
	value := meta["lipSyncDraft"]
	if args.Prepared != nil {
		preparedMeta, _ := args.Prepared.Input["metadata"].(map[string]any)
		value = preparedMeta["nativeLipSync"]
	}
	plan, err := protocol.DecodeLipSyncPlan(value)
	if err != nil {
		return BadAuthRequest(err.Error())
	}
	if plan == nil || plan.SourceNodeID != args.LipSyncSourceNodeID {
		return BadAuthRequest("请先在画面节点保存时间、人物区域和对白设置，Agent不会猜测人物区域")
	}
	found := map[string]bool{}
	for _, id := range args.ReferenceNodeIDs {
		found[id] = true
	}
	if !found[plan.SourceNodeID] || !found[plan.AudioNodeID] {
		return BadAuthRequest("引用节点与已确认的口型画面、对白不同")
	}
	metadata, _ := input["metadata"].(map[string]any)
	metadata["nativeLipSync"] = value
	metadata["videoEditOperation"] = "lip_sync"
	seconds := int((plan.Selection.EndMs - plan.Selection.StartMs + 999) / 1000)
	if args.Duration != 0 && args.Duration != seconds {
		return BadAuthRequest("口型报价时长须覆盖已保存的片段，请沿用原设置")
	}
	config, _ := input["config"].(map[string]any)
	if config == nil {
		config = map[string]any{}
		input["config"] = config
	}
	config["videoSeconds"] = strconv.Itoa(seconds)
	return nil
}
