// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestLegacyTranscriptNativeHistoryPreservesWordsCorrectionsAndExplicitParents(t *testing.T) {
	const digest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	initial := map[string]any{"kind": "transcript", "language": "zh", "segments": []any{map[string]any{"id": "segment-1", "start": .125, "end": 1.875, "text": "原始识别", "confidence": .6}}, "words": []any{map[string]any{"id": "word-1", "start": .125, "end": .5, "text": "原始", "confidence": .7}, map[string]any{"id": "word-2", "start": .6, "end": 1.875, "text": "识别"}}}
	raw, _ := json.Marshal(initial)
	var corrected map[string]any
	json.Unmarshal(raw, &corrected)
	corrected["segments"].([]any)[0].(map[string]any)["text"] = "校正台词"
	corrected["segments"].([]any)[0].(map[string]any)["speaker"] = "角色甲"
	corrected["segments"].([]any)[0].(map[string]any)["human_corrected"] = true
	corrected["manual_correction"] = map[string]any{"parent_analysis_id": "original"}
	changed, _ := json.Marshal(corrected)
	ref := func(id, artifact string) map[string]any {
		return map[string]any{"id": id, "kind": "transcript", "sourceMediaId": "media", "sourceDigest": digest, "artifactMediaId": artifact, "createdAt": "2026-10-01T08:30:00Z"}
	}
	// Deliberately reversed order proves parent links determine the native
	// history; a separate recognition is never silently merged by source alone.
	document := map[string]any{"production": map[string]any{"analysisRefs": []any{ref("corrected", "json-corrected"), ref("independent", "json-independent"), ref("original", "json-original")}}}
	before, _ := json.Marshal(document)
	data := LegacyProjectionData{ResourceSHA256: map[string]string{"media": digest}, Artifacts: map[string][]byte{"json-original": raw, "json-corrected": changed, "json-independent": raw}}
	resources := map[string]model.Resource{"media": {ID: "media", ETag: "immutable-etag", Size: 1234, DurationMs: 2000}}
	result, err := ProjectLegacyTranscripts(document, resources, data, "owner", "project", "import", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Transcripts) != 2 || len(result.Versions) != 3 || result.TranscriptIDs["original"] != result.TranscriptIDs["corrected"] || result.TranscriptIDs["original"] == result.TranscriptIDs["independent"] {
		t.Fatalf("history grouping lost %+v", result)
	}
	byID := map[string]model.ProjectTranscriptRevision{}
	for _, version := range result.Versions {
		byID[version.ID] = version
	}
	var v1, v2 TranscriptDocument
	json.Unmarshal([]byte(byID[result.VersionIDs["original"]].DocumentJSON), &v1)
	json.Unmarshal([]byte(byID[result.VersionIDs["corrected"]].DocumentJSON), &v2)
	if v1.Segments[0].Text != "原始识别" || v1.WordTextNeedsReview || v1.Segments[0].StartMs != 125 || v1.Segments[0].EndMs != 1875 {
		t.Fatal("original recognition mutated", v1)
	}
	if v2.Segments[0].Text != "校正台词" || v2.Segments[0].Speaker != "角色甲" || !v2.Segments[0].Corrected || !v2.WordTextNeedsReview || !reflect.DeepEqual(v1.Words, v2.Words) {
		t.Fatal("correction fabricated words or lost speaker", v2)
	}
	for _, row := range result.Transcripts {
		if row.SourceTaskID != "" || row.SourceKind != "legacy_import" || row.SourceImportID != "import" || row.SourceETag != "immutable-etag" || row.SourceBytes != 1234 || row.SourceDurationMs != 2000 {
			t.Fatal("source identity not pinned", row)
		}
		if row.ID == result.TranscriptIDs["corrected"] && (row.Revision != 2 || row.CurrentRevisionID != result.VersionIDs["corrected"]) {
			t.Fatal("current correction not selected", row)
		}
	}
	after, _ := json.Marshal(document)
	if !reflect.DeepEqual(before, after) || len(result.PreservedOnly) != 0 {
		t.Fatal("source document changed or valid transcript left unconverted")
	}
	resources["media"] = model.Resource{ID: "media", DurationMs: 1000}
	outside, err := ProjectLegacyTranscripts(document, resources, data, "owner", "project", "import", time.Now())
	if err != nil || len(outside.Transcripts) != 0 || len(outside.PreservedOnly) != 3 {
		t.Fatal("out of source transcript was clipped or fabricated", err, outside)
	}
	resources["media"] = model.Resource{ID: "media", DurationMs: 2000}
	data.ResourceSHA256["media"] = strings.Repeat("b", 64)
	if _, err := ProjectLegacyTranscripts(document, resources, data, "owner", "project", "import", time.Now()); err == nil {
		t.Fatal("changed source digest accepted")
	}
}

func TestLegacyTranscriptCorrectionCyclesAndCrossSourceParentsRejected(t *testing.T) {
	digest := strings.Repeat("a", 64)
	refs := []any{}
	data := LegacyProjectionData{Artifacts: map[string][]byte{}, ResourceSHA256: map[string]string{"one": digest, "two": digest}}
	resources := map[string]model.Resource{"one": {ID: "one", DurationMs: 3000}, "two": {ID: "two", DurationMs: 3000}}
	for _, id := range []string{"a", "b"} {
		parent := "a"
		if id == "a" {
			parent = "b"
		}
		raw, _ := json.Marshal(map[string]any{"kind": "transcript", "segments": []any{map[string]any{"id": "s", "start": 0, "end": 1, "text": "台词"}}, "manual_correction": map[string]any{"parent_analysis_id": parent}})
		data.Artifacts[id] = raw
		refs = append(refs, map[string]any{"id": id, "kind": "transcript", "sourceMediaId": "one", "sourceDigest": digest, "artifactMediaId": id})
	}
	document := map[string]any{"production": map[string]any{"analysisRefs": refs}}
	if _, err := ProjectLegacyTranscripts(document, resources, data, "owner", "project", "import", time.Now()); err == nil {
		t.Fatal("cyclic correction history accepted")
	}
	var root map[string]any
	json.Unmarshal(data.Artifacts["a"], &root)
	delete(root, "manual_correction")
	data.Artifacts["a"], _ = json.Marshal(root)
	refs[1].(map[string]any)["sourceMediaId"] = "two"
	if _, err := ProjectLegacyTranscripts(document, resources, data, "owner", "project", "import", time.Now()); err == nil {
		t.Fatal("correction parent crossed exact source")
	}
}
