// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func planningLegacyDocument() map[string]any {
	return map[string]any{"nodes": []any{map[string]any{"id": "image", "data": map[string]any{"kind": "image", "title": "参考", "prompt": "固定人物", "assetIds": []any{"role"}}}}, "shots": []any{map[string]any{"id": "shot", "title": "开场", "imageNodeId": "image", "dialogue": "欢迎"}}, "assets": []any{map[string]any{"id": "role", "kind": "character", "title": "主角", "prompt": "原始红外套", "profile": map[string]any{"wardrobe": "红外套"}, "mediaId": "original", "versions": []any{map[string]any{"id": "old-version", "prompt": "历史蓝外套", "profile": map[string]any{"wardrobe": "蓝外套"}, "mediaId": "historical"}}}}, "production": map[string]any{"guide": map[string]any{"goal": "product"}, "creativeBrief": map[string]any{"subject": "红色外套", "audience": "新手", "benefit": "看清面料", "callToAction": "查看细节"}, "brief": "原制作说明\n保留服装", "targetDuration": json.Number("6"), "shotNarrative": map[string]any{"shot": map[string]any{"purpose": "opening", "information": "介绍人物", "emotion": "平静", "visualBeat": "红外套", "continuityNeeds": "左手持伞"}}, "continuityStates": []any{map[string]any{"shotId": "shot", "assetId": "role", "wardrobe": "红外套", "referenceMediaIds": []any{"original"}}}}}
}

func TestLegacyPlanningInitialUsesSavedRootAndNativeIntentions(t *testing.T) {
	document := planningLegacyDocument()
	before, _ := json.Marshal(document)
	sequence := 0
	resources := map[string]model.Resource{"original": {ID: "original", MimeType: "image/png"}, "historical": {ID: "historical", MimeType: "image/png"}}
	rows, report, err := ProjectLegacyDocument(document, LegacyBundleInspection{SourceFingerprint: "source"}, resources, "owner", "import", time.Unix(1700000000, 0), func() string { sequence++; return fmt.Sprintf("id-%d", sequence) })
	if err != nil {
		t.Fatal(err)
	}
	if rows.Planning == nil || rows.Planning.Unit != nil || report.PlanningShots != 1 || len(rows.ShotRevisions) != 1 || !strings.Contains(rows.ShotRevisions[0].NarrativeJSON, "介绍人物") {
		t.Fatal("native initial planning missing", report)
	}
	var brief model.ProjectCreativeBrief
	if json.Unmarshal([]byte(rows.Project.CreativeBriefJSON), &brief) != nil || brief.Goal != "product" || brief.TargetDurationMs != 6000 || brief.Audience != "新手" || !strings.Contains(brief.KeyMessage, "查看细节") {
		t.Fatal("brief missing", brief)
	}
	var states []model.ShotReferenceState
	if json.Unmarshal([]byte(rows.ShotRevisions[0].ReferenceStatesJSON), &states) != nil || len(states) != 1 {
		t.Fatal("states missing")
	}
	var root *model.AssetVersion
	for i := range rows.Versions {
		if rows.Versions[i].ID == states[0].AssetVersionID {
			root = &rows.Versions[i]
		}
	}
	if root == nil || root.Prompt != "原始红外套" || !strings.Contains(root.DefinitionJSON, "红外套") {
		t.Fatal("silently substituted latest historical version", root)
	}
	if len(rows.ShotReferences) != 1 || rows.ShotReferences[0].AssetVersionID != root.ID || states[0].ReferenceResourceIDs[0] != "original" {
		t.Fatal("reference identity changed")
	}
	after, _ := json.Marshal(document)
	if string(after) != string(before) {
		t.Fatal("source changed")
	}
}

func TestLegacyPlanningUpgradeBuildsIndependentChapterWithoutMutatingCurrentProject(t *testing.T) {
	document := planningLegacyDocument()
	before, _ := json.Marshal(document)
	identities := map[string]map[string]string{"assets": {"role": "native-role"}, "assetVersions": {"role/old-version": "native-blue"}, "shots": {"shot": "existing-edited-shot"}, "takes": {}, "nodes": {}}
	current := model.Project{ID: "project", UserID: "owner", Description: "用户的新简介", CreativeBriefJSON: `{"version":1,"goal":"story"}`}
	rows := &repository.ProductionImportRows{Project: current, Receipt: model.ProductionImport{ID: "import", ProjectID: "project", UserID: "owner", CreatedAt: time.Unix(1700000000, 0)}}
	resources := map[string]model.Resource{"original": {ID: "original", MimeType: "image/png"}, "historical": {ID: "historical", MimeType: "image/png"}}
	fields, err := projectLegacyPlanning(rows, document, resources, identities)
	if err != nil {
		t.Fatal(err)
	}
	if rows.Project != current || rows.Planning == nil || rows.Planning.Unit == nil || len(fields) < 3 {
		t.Fatal("upgrade overwrote existing project or lost native plan")
	}
	if rows.Planning.Shots[0].ID == "existing-edited-shot" || rows.Planning.Shots[0].UnitID != rows.Planning.Unit.ID || !strings.Contains(rows.Planning.Revisions[0].ReferenceStatesJSON, "红外套") {
		t.Fatal("upgrade overwrote current shots")
	}
	if len(rows.Planning.Versions) != 1 || rows.Planning.Versions[0].Prompt != "原始红外套" || len(rows.Planning.Representations) != 1 {
		t.Fatal("root reference not preserved")
	}
	var snapshot model.ShotPlanSnapshot
	if json.Unmarshal([]byte(rows.Planning.Record.PayloadJSON), &snapshot) != nil || snapshot.ProjectDescription != "原制作说明\n保留服装" || len(snapshot.References) != 1 {
		t.Fatal("original recoverable plan incomplete")
	}
	other := &repository.ProductionImportRows{Project: current, Receipt: rows.Receipt}
	identityCopy := map[string]map[string]string{"assets": {"role": "native-role"}, "assetVersions": {"role/old-version": "native-blue"}, "shots": {"shot": "existing-edited-shot"}, "takes": {}, "nodes": {}}
	if _, err := projectLegacyPlanning(other, document, resources, identityCopy); err != nil || other.Planning.Record.PayloadJSON != rows.Planning.Record.PayloadJSON {
		t.Fatal("preview does not have a stable immutable source", err)
	}
	after, _ := json.Marshal(document)
	if string(before) != string(after) {
		t.Fatal("source mutated")
	}
}

func TestLegacyPlanningRejectsDanglingStatesAndInvalidNarrative(t *testing.T) {
	for _, scenario := range []string{"missing-version", "missing-image", "missing-shot", "bad-purpose", "duplicate-state"} {
		t.Run(scenario, func(t *testing.T) {
			document := planningLegacyDocument()
			production := objectValue(document["production"])
			state := objectValue(listValue(production["continuityStates"])[0])
			switch scenario {
			case "missing-version":
				state["versionId"] = "absent"
			case "missing-image":
				state["referenceMediaIds"] = []any{"absent"}
			case "missing-shot":
				state["shotId"] = "absent"
			case "bad-purpose":
				objectValue(objectValue(production["shotNarrative"])["shot"])["purpose"] = "unknown"
			case "duplicate-state":
				production["continuityStates"] = append(listValue(production["continuityStates"]), state)
			}
			index := 0
			_, _, err := ProjectLegacyDocument(document, LegacyBundleInspection{}, map[string]model.Resource{"original": {ID: "original", MimeType: "image/png"}, "historical": {ID: "historical", MimeType: "image/png"}}, "owner", "test", time.Now(), func() string { index++; return fmt.Sprint(index) })
			if err == nil {
				t.Fatal("invalid fixed planning silently accepted")
			}
		})
	}
}

func TestLegacyPlanningKeepsDifferentImageVideoReferenceStages(t *testing.T) {
	document := planningLegacyDocument()
	image := objectValue(objectValue(listValue(document["nodes"])[0])["data"])
	image["assetVersionIds"] = map[string]any{"role": "old-version"}
	document["nodes"] = append(listValue(document["nodes"]), map[string]any{"id": "video", "data": map[string]any{"kind": "video", "assetIds": []any{"role"}, "seconds": json.Number("2")}})
	objectValue(listValue(document["shots"])[0])["videoNodeId"] = "video"
	index := 0
	rows, _, err := ProjectLegacyDocument(document, LegacyBundleInspection{}, map[string]model.Resource{"original": {ID: "original", MimeType: "image/png"}, "historical": {ID: "historical", MimeType: "image/png"}}, "owner", "test", time.Unix(1700000000, 0), func() string { index++; return fmt.Sprint(index) })
	if err != nil {
		t.Fatal(err)
	}
	var states []model.ShotReferenceState
	if json.Unmarshal([]byte(rows.ShotRevisions[0].ReferenceStatesJSON), &states) != nil || len(states) != 2 {
		t.Fatal("per-stage references missing")
	}
	if states[0].Stage != "image" || states[0].ReferenceResourceIDs[0] != "original" || states[1].Stage != "video" || states[0].AssetVersionID == states[1].AssetVersionID {
		t.Fatal("stages conflated", states)
	}
	// Explicit review images override each stage's default picture; versions
	// still follow the source node's exact pin rather than the latest asset.
	if err := ValidateShotReferenceStates([]model.ShotReferenceState{{AssetVersionID: "same", Stage: "image"}, {AssetVersionID: "same", Stage: "video"}}); err != nil {
		t.Fatal(err)
	}
	for _, values := range [][]model.ShotReferenceState{{{AssetVersionID: "same"}, {AssetVersionID: "same", Stage: "image"}}, {{AssetVersionID: "same", Stage: "other"}}, {{AssetVersionID: "same", Stage: "image"}, {AssetVersionID: "same", Stage: "image"}}} {
		if ValidateShotReferenceStates(values) == nil {
			t.Fatal("overlapping or invalid stage accepted")
		}
	}
}

func TestLegacyPlanningGraphPinnedTakeKeepsItsOwnDefinitionAndImage(t *testing.T) {
	document := planningLegacyDocument()
	document["nodes"] = append(listValue(document["nodes"]), map[string]any{"id": "role-node", "data": map[string]any{"kind": "image", "linkedAssetId": "role", "takes": []any{map[string]any{"id": "take-pin", "prompt": "旧候选白外套", "status": "completed", "mediaId": "historical"}}}})
	document["edges"] = []any{map[string]any{"id": "edge", "source": "role-node", "target": "image", "data": map[string]any{"sourceTakeId": "take-pin"}}}
	before, _ := json.Marshal(document)
	index := 0
	rows, _, err := ProjectLegacyDocument(document, LegacyBundleInspection{}, map[string]model.Resource{"original": {ID: "original", MimeType: "image/png"}, "historical": {ID: "historical", MimeType: "image/png"}}, "owner", "test", time.Unix(1700000000, 0), func() string { index++; return fmt.Sprint(index) })
	if err != nil {
		t.Fatal(err)
	}
	var states []model.ShotReferenceState
	json.Unmarshal([]byte(rows.ShotRevisions[0].ReferenceStatesJSON), &states)
	if len(states) != 2 || states[0].Stage != "image" || states[1].Stage != "video" {
		t.Fatal("edge override did not remain stage-bound", states)
	}
	var version *model.AssetVersion
	for i := range rows.Versions {
		if rows.Versions[i].ID == states[0].AssetVersionID {
			version = &rows.Versions[i]
		}
	}
	if version == nil || version.Prompt != "旧候选白外套" || strings.Contains(version.DefinitionJSON, `"wardrobe":"红外套"`) {
		t.Fatal("graph pinned take adopted another profile", version)
	}
	after, _ := json.Marshal(document)
	if string(after) != string(before) {
		t.Fatal("original graph mutated")
	}
}

func TestLegacyPlanningReadyNodeWithoutTakeBecomesNativeCandidate(t *testing.T) {
	document := planningLegacyDocument()
	objectValue(objectValue(listValue(document["nodes"])[0])["data"])["mediaId"] = "original"
	index := 0
	rows, report, err := ProjectLegacyDocument(document, LegacyBundleInspection{}, map[string]model.Resource{"original": {ID: "original", MimeType: "image/png"}, "historical": {ID: "historical", MimeType: "image/png"}}, "owner", "test", time.Unix(1700000000, 0), func() string { index++; return fmt.Sprint(index) })
	if err != nil {
		t.Fatal(err)
	}
	if report.Takes != 0 || len(rows.ShotArtifacts) != 1 || rows.ShotArtifacts[0].Type != "storyboard" || rows.ShotArtifacts[0].ResourceID != "original" || !rows.ShotArtifacts[0].Selected || !strings.Contains(rows.ShotArtifacts[0].MetadataJSON, "legacy-node-file") {
		t.Fatal("uploaded original was hidden or represented as a fabricated model Take")
	}
	var plan model.ShotPlanSnapshot
	if json.Unmarshal([]byte(rows.Planning.Record.PayloadJSON), &plan) != nil || len(plan.Selections) != 1 || plan.Selections[0].ArtifactID != rows.ShotArtifacts[0].ID {
		t.Fatal("ready original not fixed in recoverable plan")
	}
}
