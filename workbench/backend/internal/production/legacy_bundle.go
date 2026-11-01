// SPDX-License-Identifier: AGPL-3.0-or-later
// Legacy production document contract derived from TouHouQing/new-api Studio.
// Original Studio code: Copyright (C) 2023-2026 QuantumNous.
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
	"regexp"
	"slices"
	"strings"
)

const (
	MaxLegacyBundleBytes   = 1024 * 1024 * 1024
	MaxLegacyDocumentBytes = 9_000_000
	MaxLegacyMediaBytes    = 512 * 1024 * 1024
	MaxLegacyMediaEntries  = 1000
)

var (
	ErrLegacyBundle = errors.New("invalid legacy Studio project bundle")
	legacyMediaPath = regexp.MustCompile(`^media/(0|[1-9][0-9]{0,3})$`)
)

type LegacyMediaEntry struct {
	Path string `json:"path"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}

type LegacyManifest struct {
	Format             string             `json:"format"`
	Version            int                `json:"version"`
	Project            map[string]any     `json:"project"`
	Media              []LegacyMediaEntry `json:"media"`
	NodeMedia          []*string          `json:"nodeMedia"`
	TakeMedia          [][]*string        `json:"takeMedia"`
	AssetMedia         []*string          `json:"assetMedia"`
	AssetVersionMedia  [][]*string        `json:"assetVersionMedia"`
	ShotVoiceoverMedia []*string          `json:"shotVoiceoverMedia"`
	AssembledMedia     *string            `json:"assembledMedia"`
	SoundtrackMedia    *string            `json:"soundtrackMedia"`
	VoiceoverMedia     *string            `json:"voiceoverMedia"`
	ProductionMedia    map[string]string  `json:"productionMedia"`
	TakeAuxiliaryMedia map[string]string  `json:"takeAuxiliaryMedia"`
	DocumentMedia      map[string]string  `json:"documentMedia"`
}

type LegacyResource struct {
	Path     string `json:"path"`
	MIMEType string `json:"mimeType"`
	Size     int64  `json:"size"`
	SHA256   string `json:"sha256"`
}

// This inspection is a migration input, not a claim that all production fields
// have already been converted into the target application's domain model.
type LegacyBundleInspection struct {
	Format            string            `json:"format"`
	SourceProjectID   string            `json:"sourceProjectId"`
	Title             string            `json:"title"`
	SourceFingerprint string            `json:"sourceFingerprint"`
	NodeCount         int               `json:"nodeCount"`
	TakeCount         int               `json:"takeCount"`
	Resources         []LegacyResource  `json:"resources"`
	MediaAliases      map[string]string `json:"mediaAliases"`
	MissingMediaIDs   []string          `json:"missingMediaIds"`
	ReadyForMigration bool              `json:"readyForMigration"`
}

type LegacyBundle struct {
	Manifest   LegacyManifest
	Inspection LegacyBundleInspection
	files      map[string]*zip.File
}

// OpenLegacyBundle validates and hashes every declared byte without extracting
// ZIP paths or fetching any historical URL. Resource ownership is checked later
// by the authenticated import service when the resources are created.
func OpenLegacyBundle(reader io.ReaderAt, size int64) (*LegacyBundle, error) {
	if size < 1 || size > MaxLegacyBundleBytes {
		return nil, ErrLegacyBundle
	}
	archive, err := zip.NewReader(reader, size)
	if err != nil || len(archive.File) > MaxLegacyMediaEntries+1 {
		return nil, ErrLegacyBundle
	}
	bundle := &LegacyBundle{files: make(map[string]*zip.File)}
	var expanded uint64
	for _, file := range archive.File {
		if file.Name != "project.json" && !legacyMediaPath.MatchString(file.Name) {
			return nil, ErrLegacyBundle
		}
		if _, exists := bundle.files[file.Name]; exists || file.Mode()&os.ModeSymlink != 0 || file.Flags&1 != 0 {
			return nil, ErrLegacyBundle
		}
		limit := uint64(MaxLegacyMediaBytes)
		if file.Name == "project.json" {
			limit = MaxLegacyDocumentBytes
		}
		if file.UncompressedSize64 > limit || expanded > MaxLegacyBundleBytes-file.UncompressedSize64 {
			return nil, ErrLegacyBundle
		}
		expanded += file.UncompressedSize64
		bundle.files[file.Name] = file
	}
	projectFile := bundle.files["project.json"]
	if projectFile == nil {
		return nil, ErrLegacyBundle
	}
	input, err := projectFile.Open()
	if err != nil {
		return nil, ErrLegacyBundle
	}
	data, readErr := io.ReadAll(io.LimitReader(input, MaxLegacyDocumentBytes+1))
	closeErr := input.Close()
	if readErr != nil || closeErr != nil || len(data) > MaxLegacyDocumentBytes {
		return nil, ErrLegacyBundle
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if decoder.Decode(&bundle.Manifest) != nil {
		return nil, ErrLegacyBundle
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return nil, ErrLegacyBundle
	}
	manifest := &bundle.Manifest
	if manifest.Format != "newapi-studio-project-bundle" || manifest.Version != 1 || manifest.Project == nil || len(manifest.Media) > MaxLegacyMediaEntries {
		return nil, ErrLegacyBundle
	}
	id, _ := manifest.Project["id"].(string)
	title, _ := manifest.Project["title"].(string)
	nodes, ok := manifest.Project["nodes"].([]any)
	if !ok || len(nodes) > 500 || strings.TrimSpace(id) == "" || len(id) > 128 || strings.TrimSpace(title) == "" || len([]rune(title)) > 200 {
		return nil, ErrLegacyBundle
	}
	if err := validateLegacyMediaSlots(manifest, nodes); err != nil {
		return nil, err
	}
	if err := validateLegacyDocumentSafety(manifest.Project); err != nil {
		return nil, err
	}
	bundle.Inspection = LegacyBundleInspection{Format: manifest.Format, SourceProjectID: id, Title: title, NodeCount: len(nodes), MediaAliases: make(map[string]string), Resources: []LegacyResource{}, MissingMediaIDs: []string{}}
	declared := make(map[string]bool)
	for _, entry := range manifest.Media {
		file := bundle.files[entry.Path]
		if !legacyMediaPath.MatchString(entry.Path) || declared[entry.Path] || file == nil || entry.Size < 1 || entry.Size > MaxLegacyMediaBytes || uint64(entry.Size) != file.UncompressedSize64 || entry.Type == "" || len(entry.Type) > 200 || strings.ContainsAny(entry.Type, "\r\n") {
			return nil, ErrLegacyBundle
		}
		declared[entry.Path] = true
		stream, err := file.Open()
		if err != nil {
			return nil, ErrLegacyBundle
		}
		hash := sha256.New()
		written, readErr := io.Copy(hash, io.LimitReader(stream, entry.Size+1))
		closeErr := stream.Close()
		if readErr != nil || closeErr != nil || written != entry.Size {
			return nil, ErrLegacyBundle
		}
		bundle.Inspection.Resources = append(bundle.Inspection.Resources, LegacyResource{Path: entry.Path, MIMEType: entry.Type, Size: written, SHA256: hex.EncodeToString(hash.Sum(nil))})
	}
	if len(declared)+1 != len(bundle.files) {
		return nil, ErrLegacyBundle
	}
	for _, mapping := range []map[string]string{manifest.ProductionMedia, manifest.TakeAuxiliaryMedia, manifest.DocumentMedia} {
		for legacyID, path := range mapping {
			if legacyID == "" || len(legacyID) > 128 || !declared[path] {
				return nil, ErrLegacyBundle
			}
			if previous, exists := bundle.Inspection.MediaAliases[legacyID]; exists && previous != path {
				return nil, ErrLegacyBundle
			}
			bundle.Inspection.MediaAliases[legacyID] = path
		}
	}
	for _, slots := range legacyMediaSlots(manifest) {
		for _, path := range slots {
			if path != nil && !declared[*path] {
				return nil, ErrLegacyBundle
			}
		}
	}
	for _, id := range legacyDocumentMediaIDs(manifest.Project) {
		if _, exists := bundle.Inspection.MediaAliases[id]; !exists {
			bundle.Inspection.MissingMediaIDs = append(bundle.Inspection.MissingMediaIDs, id)
		}
	}
	for _, node := range nodes {
		object, _ := node.(map[string]any)
		data, _ := object["data"].(map[string]any)
		takes, _ := data["takes"].([]any)
		bundle.Inspection.TakeCount += len(takes)
	}
	slices.Sort(bundle.Inspection.MissingMediaIDs)
	slices.SortFunc(bundle.Inspection.Resources, func(a, b LegacyResource) int { return strings.Compare(a.Path, b.Path) })
	bundle.Inspection.ReadyForMigration = len(bundle.Inspection.MissingMediaIDs) == 0
	fingerprint, err := json.Marshal(struct {
		Manifest  json.RawMessage  `json:"manifest"`
		Resources []LegacyResource `json:"resources"`
	}{data, bundle.Inspection.Resources})
	if err != nil {
		return nil, ErrLegacyBundle
	}
	digest := sha256.Sum256(fingerprint)
	bundle.Inspection.SourceFingerprint = hex.EncodeToString(digest[:])
	return bundle, nil
}

func (bundle *LegacyBundle) OpenMedia(path string) (io.ReadCloser, error) {
	if !legacyMediaPath.MatchString(path) || bundle.files[path] == nil {
		return nil, ErrLegacyBundle
	}
	return bundle.files[path].Open()
}

func validateLegacyMediaSlots(manifest *LegacyManifest, nodes []any) error {
	if len(manifest.NodeMedia) != len(nodes) || len(manifest.TakeMedia) != len(nodes) {
		return ErrLegacyBundle
	}
	nodeIDs := make(map[string]bool)
	for index, value := range nodes {
		node, ok := value.(map[string]any)
		if !ok {
			return ErrLegacyBundle
		}
		id, _ := node["id"].(string)
		data, ok := node["data"].(map[string]any)
		if id == "" || len(id) > 128 || nodeIDs[id] || !ok {
			return ErrLegacyBundle
		}
		nodeIDs[id] = true
		takes, isArray := data["takes"].([]any)
		if data["takes"] != nil && !isArray {
			return ErrLegacyBundle
		}
		if len(takes) > 500 || len(manifest.TakeMedia[index]) != len(takes) {
			return ErrLegacyBundle
		}
		seen := make(map[string]bool)
		for _, value := range takes {
			take, ok := value.(map[string]any)
			if !ok {
				return ErrLegacyBundle
			}
			id, _ := take["id"].(string)
			if id == "" || len(id) > 128 || seen[id] {
				return ErrLegacyBundle
			}
			seen[id] = true
		}
		selected, _ := data["selectedTakeId"].(string)
		if selected != "" && !seen[selected] {
			return ErrLegacyBundle
		}
	}
	assets, _ := manifest.Project["assets"].([]any)
	if len(assets) > 500 || len(manifest.AssetMedia) != len(assets) || (manifest.AssetVersionMedia != nil && len(manifest.AssetVersionMedia) != len(assets)) {
		return ErrLegacyBundle
	}
	assetIDs := map[string]bool{}
	for index, value := range assets {
		asset, ok := value.(map[string]any)
		if !ok {
			return ErrLegacyBundle
		}
		id, _ := asset["id"].(string)
		if id == "" || len(id) > 128 || assetIDs[id] {
			return ErrLegacyBundle
		}
		assetIDs[id] = true
		versions, _ := asset["versions"].([]any)
		if len(versions) > 500 {
			return ErrLegacyBundle
		}
		if manifest.AssetVersionMedia != nil && len(manifest.AssetVersionMedia[index]) != len(versions) {
			return ErrLegacyBundle
		}
	}
	shots, _ := manifest.Project["shots"].([]any)
	if len(shots) > 500 || (manifest.ShotVoiceoverMedia != nil && len(manifest.ShotVoiceoverMedia) != len(shots)) {
		return ErrLegacyBundle
	}
	shotIDs := map[string]bool{}
	for _, value := range shots {
		shot, ok := value.(map[string]any)
		if !ok {
			return ErrLegacyBundle
		}
		id, _ := shot["id"].(string)
		if id == "" || len(id) > 128 || shotIDs[id] {
			return ErrLegacyBundle
		}
		shotIDs[id] = true
	}
	return nil
}

func legacyMediaSlots(manifest *LegacyManifest) [][]*string {
	slots := [][]*string{manifest.NodeMedia, manifest.AssetMedia, manifest.ShotVoiceoverMedia, {manifest.AssembledMedia, manifest.SoundtrackMedia, manifest.VoiceoverMedia}}
	slots = append(slots, manifest.TakeMedia...)
	return append(slots, manifest.AssetVersionMedia...)
}

func legacyDocumentMediaIDs(document map[string]any) []string {
	ids := make(map[string]bool)
	var visit func(any)
	visit = func(value any) {
		switch object := value.(type) {
		case []any:
			for _, child := range object {
				visit(child)
			}
		case map[string]any:
			for key, child := range object {
				if key == "mediaId" || key == "media_id" || strings.HasSuffix(key, "MediaId") {
					if id, ok := child.(string); ok && id != "" {
						ids[id] = true
					}
				} else if slices.Contains([]string{"mediaIds", "referenceMediaIds", "reference_media_ids", "musicMediaIds"}, key) {
					if values, ok := child.([]any); ok {
						for _, value := range values {
							if id, ok := value.(string); ok && id != "" {
								ids[id] = true
							}
						}
					}
				} else if key == "approvedKeyImages" {
					if images, ok := child.(map[string]any); ok {
						for _, value := range images {
							if id, ok := value.(string); ok && id != "" {
								ids[id] = true
							}
						}
					}
				} else {
					visit(child)
				}
			}
		}
	}
	visit(document)
	values := make([]string, 0, len(ids))
	for id := range ids {
		values = append(values, id)
	}
	return values
}

// Safe error for the import UI: field names and counts, never file contents.
func (inspection LegacyBundleInspection) ValidateComplete() error {
	if !inspection.ReadyForMigration {
		return fmt.Errorf("legacy project has %d missing media references", len(inspection.MissingMediaIDs))
	}
	return nil
}
