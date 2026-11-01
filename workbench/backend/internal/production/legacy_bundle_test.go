// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"reflect"
	"testing"
)

func legacyFixture(t *testing.T) (LegacyManifest, map[string][]byte) {
	t.Helper()
	media := map[string][]byte{"media/0": []byte("original source byte fixture"), "media/1": []byte("exact auxiliary subtitle fixture")}
	first, second := "media/0", "media/1"
	return LegacyManifest{
		Format: "newapi-studio-project-bundle", Version: 1,
		Project: map[string]any{
			"id": "legacy-project", "title": "原工程",
			"nodes":      []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "selectedTakeId": "old-take", "takes": []any{map[string]any{"id": "old-take", "status": "completed", "requestSnapshot": `{"media_id":"historical-only"}`, "auxiliary": []any{map[string]any{"role": "subtitles", "mediaId": "subtitles"}}}}}}},
			"production": map[string]any{"mediaDraft": map[string]any{"media_id": "source", "reference_media_ids": []any{"source"}}},
		},
		NodeMedia: []*string{&first}, TakeMedia: [][]*string{{&first}},
		Media:         []LegacyMediaEntry{{Path: first, Size: int64(len(media[first])), Type: "video/mp4"}, {Path: second, Size: int64(len(media[second])), Type: "text/plain"}},
		DocumentMedia: map[string]string{"source": first}, TakeAuxiliaryMedia: map[string]string{"subtitles": second},
	}, media
}

func buildLegacyFixture(t *testing.T, manifest LegacyManifest, media map[string][]byte, extra string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	file, err := writer.Create("project.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewEncoder(file).Encode(manifest); err != nil {
		t.Fatal(err)
	}
	for name, data := range media {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if extra != "" {
		file, err := writer.Create(extra)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte("unexpected")); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestLegacyBundleRetainsAuxiliaryDraftReferencesAndExactBytes(t *testing.T) {
	manifest, media := legacyFixture(t)
	data := buildLegacyFixture(t, manifest, media, "")
	bundle, err := OpenLegacyBundle(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	if err := bundle.Inspection.ValidateComplete(); err != nil {
		t.Fatal(err)
	}
	if bundle.Inspection.TakeCount != 1 || bundle.Inspection.NodeCount != 1 || len(bundle.Inspection.Resources) != 2 {
		t.Fatalf("wrong inventory: %+v", bundle.Inspection)
	}
	if !reflect.DeepEqual(bundle.Inspection.MediaAliases, map[string]string{"source": "media/0", "subtitles": "media/1"}) {
		t.Fatal("lost explicit media alias")
	}
	for _, resource := range bundle.Inspection.Resources {
		digest := sha256.Sum256(media[resource.Path])
		if resource.SHA256 != hex.EncodeToString(digest[:]) {
			t.Fatal("file hash differs")
		}
		stream, err := bundle.OpenMedia(resource.Path)
		if err != nil {
			t.Fatal(err)
		}
		actual, err := io.ReadAll(stream)
		stream.Close()
		if err != nil || !bytes.Equal(actual, media[resource.Path]) {
			t.Fatal("original bytes differ")
		}
	}
	if _, err := bundle.OpenMedia("project.json"); !errors.Is(err, ErrLegacyBundle) {
		t.Fatal("document exposed as media")
	}
	if len(bundle.Inspection.SourceFingerprint) != 64 {
		t.Fatal("missing source fingerprint")
	}
}

func TestLegacyBundleReportsIncompleteOldAuxiliaryBeforeMigration(t *testing.T) {
	manifest, media := legacyFixture(t)
	manifest.TakeAuxiliaryMedia = nil
	data := buildLegacyFixture(t, manifest, media, "")
	bundle, err := OpenLegacyBundle(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(bundle.Inspection.MissingMediaIDs, []string{"subtitles"}) || bundle.Inspection.ValidateComplete() == nil {
		t.Fatalf("missing auxiliary was not blocked: %+v", bundle.Inspection)
	}
}

func TestLegacyBundleRejectsAmbiguousSlotsPathsAndTruncatedFiles(t *testing.T) {
	for _, name := range []string{"slot count", "different alias", "wrong size", "unknown path", "duplicate archive entry", "truncated archive"} {
		t.Run(name, func(t *testing.T) {
			manifest, media := legacyFixture(t)
			extra := ""
			switch name {
			case "slot count":
				manifest.TakeMedia = nil
			case "different alias":
				manifest.ProductionMedia = map[string]string{"source": "media/1"}
			case "wrong size":
				manifest.Media[0].Size++
			case "unknown path":
				extra = "../outside"
			case "duplicate archive entry":
				extra = "media/0"
			}
			data := buildLegacyFixture(t, manifest, media, extra)
			if name == "truncated archive" {
				data = data[:len(data)-16]
			}
			if _, err := OpenLegacyBundle(bytes.NewReader(data), int64(len(data))); !errors.Is(err, ErrLegacyBundle) {
				t.Fatalf("unsafe bundle accepted: %v", err)
			}
		})
	}
}

func TestLegacyBundleExistingProductionArchive(t *testing.T) {
	path := os.Getenv("YINGCE_LEGACY_ARCHIVE_FIXTURE")
	if path == "" {
		t.Skip("set an existing owned Studio export to verify its real inventory")
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := OpenLegacyBundle(file, info.Size())
	if err != nil {
		t.Fatal(err)
	}
	if err := bundle.Inspection.ValidateComplete(); err != nil {
		t.Fatalf("%v: %v", err, bundle.Inspection.MissingMediaIDs)
	}
	resources := make(map[string]string)
	for index, resource := range bundle.Inspection.Resources {
		resources[resource.Path] = fmt.Sprintf("verified-import-resource-%d", index)
	}
	if _, err := bundle.RestoreLegacyMedia(resources); err != nil {
		t.Fatal(err)
	}
	if bundle.Inspection.NodeCount == 0 || bundle.Inspection.TakeCount == 0 || len(bundle.Inspection.Resources) == 0 {
		t.Fatal("expected an actual production export with nodes, Takes and files")
	}
	t.Logf("Existing archive: %d nodes, %d Takes, %d exact files, fingerprint %s", bundle.Inspection.NodeCount, bundle.Inspection.TakeCount, len(bundle.Inspection.Resources), bundle.Inspection.SourceFingerprint)
}

func TestLegacyMediaRestorationPreservesOriginalAndHistoricalSnapshot(t *testing.T) {
	manifest, media := legacyFixture(t)
	data := buildLegacyFixture(t, manifest, media, "")
	bundle, err := OpenLegacyBundle(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(bundle.Manifest.Project)
	document, err := bundle.RestoreLegacyMedia(map[string]string{"media/0": "new-source", "media/1": "new-subtitles"})
	if err != nil {
		t.Fatal(err)
	}
	node := document["nodes"].([]any)[0].(map[string]any)["data"].(map[string]any)
	take := node["takes"].([]any)[0].(map[string]any)
	if node["mediaId"] != "new-source" || take["mediaId"] != "new-source" || node["selectedTakeId"] != "old-take" {
		t.Fatal("lost current or selected historical output")
	}
	if take["requestSnapshot"] != `{"media_id":"historical-only"}` {
		t.Fatal("historical request snapshot was changed")
	}
	aux := take["auxiliary"].([]any)[0].(map[string]any)
	if aux["mediaId"] != "new-subtitles" {
		t.Fatal("auxiliary reference was not remapped")
	}
	draft := document["production"].(map[string]any)["mediaDraft"].(map[string]any)
	if draft["media_id"] != "new-source" || draft["reference_media_ids"].([]any)[0] != "new-source" {
		t.Fatal("active draft references were not remapped")
	}
	after, _ := json.Marshal(bundle.Manifest.Project)
	if !bytes.Equal(before, after) {
		t.Fatal("source document was mutated")
	}
	if _, err := bundle.RestoreLegacyMedia(map[string]string{"media/0": "new-source"}); err == nil {
		t.Fatal("incomplete target resource set was accepted")
	}
}
