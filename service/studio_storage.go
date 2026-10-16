package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	studioagent "github.com/QuantumNous/new-api/integrations/studio-agent"
	"github.com/QuantumNous/new-api/model"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var StudioIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

const StudioMaxDocumentBytes = 8 << 20
const StudioMaxMediaBytes = 512 << 20

var studioSchemaOnce sync.Once
var studioDocumentSchema *jsonschema.Schema
var studioDocumentSchemaError error

type studioImageLayerDocument struct {
	Width  int `json:"width"`
	Height int `json:"height"`
	Layers []struct {
		ID      string `json:"id"`
		Kind    string `json:"kind"`
		MediaID string `json:"mediaId"`
	} `json:"layers"`
}

func StudioMediaReferences(document map[string]any) map[string]bool {
	ids := map[string]bool{}
	var visit func(any)
	visit = func(value any) {
		switch item := value.(type) {
		case map[string]any:
			for key, value := range item {
				if key == "mediaId" || strings.HasSuffix(key, "MediaId") {
					if id, ok := value.(string); ok && id != "" {
						ids[id] = true
					}
				} else if key == "mediaIds" || key == "referenceMediaIds" || key == "musicMediaIds" {
					if values, ok := value.([]any); ok {
						for _, value := range values {
							if id, ok := value.(string); ok {
								ids[id] = true
							}
						}
					}
				} else if key == "approvedKeyImages" {
					if images, ok := value.(map[string]any); ok {
						for _, value := range images {
							if id, ok := value.(string); ok && id != "" {
								ids[id] = true
							}
						}
					}
				}
				visit(value)
			}
		case []any:
			for _, value := range item {
				visit(value)
			}
		}
	}
	visit(document)
	return ids
}

func LinkStudioProjectMedia(projectID, mediaID string) error {
	link := model.StudioProjectMediaLink{ProjectID: projectID, MediaID: mediaID}
	return model.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&link).Error
}

func StudioProjectHasMedia(projectID, mediaID string) bool {
	var count int64
	return model.DB.Model(&model.StudioProjectMediaLink{}).Where("project_id = ? AND media_id = ?", projectID, mediaID).Count(&count).Error == nil && count > 0
}

func ValidateStudioProjectMedia(userID int, projectID string, document map[string]any) error {
	project, role, err := model.StudioProjectAccess(model.DB, userID, projectID, true)
	ownerID := userID
	if err == nil {
		ownerID = project.OwnerID
	} else {
		var existing model.StudioProject
		if model.DB.Unscoped().Where("id = ?", projectID).First(&existing).Error == nil {
			return model.ErrStudioAccess
		}
		role = "owner"
	}
	for mediaID := range StudioMediaReferences(document) {
		if role != "owner" && !StudioProjectHasMedia(projectID, mediaID) {
			return errors.New("media is outside this project")
		}
		if _, err := GetStudioMedia(ownerID, mediaID); err != nil {
			return errors.New("upload all referenced media before saving")
		}
		if role == "owner" {
			if err := LinkStudioProjectMedia(projectID, mediaID); err != nil {
				return err
			}
		}
	}
	return nil
}

func ValidateStudioDocument(id string, raw []byte) (string, error) {
	if !StudioIDPattern.MatchString(id) || len(raw) == 0 || len(raw) > StudioMaxDocumentBytes {
		return "", errors.New("invalid project document")
	}
	studioSchemaOnce.Do(func() {
		var definition any
		if err := common.Unmarshal(studioagent.ProjectSchema(), &definition); err != nil {
			studioDocumentSchemaError = err
			return
		}
		compiler := jsonschema.NewCompiler()
		if err := compiler.AddResource("studio-project.json", definition); err != nil {
			studioDocumentSchemaError = err
			return
		}
		studioDocumentSchema, studioDocumentSchemaError = compiler.Compile("studio-project.json")
	})
	if studioDocumentSchemaError != nil {
		return "", errors.New("project schema is unavailable")
	}
	var document any
	if err := common.Unmarshal(raw, &document); err != nil {
		return "", errors.New("invalid project JSON")
	}
	if err := studioDocumentSchema.Validate(document); err != nil {
		return "", errors.New("project document does not match the Studio schema")
	}
	var doc struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Nodes []struct {
			ID   string `json:"id"`
			Data struct {
				TextDocument []struct {
					ID   string `json:"id"`
					Text string `json:"text"`
				} `json:"textDocument"`
				MetadataJSON     string                    `json:"metadataJson"`
				PayloadPatchJSON string                    `json:"payloadPatchJson"`
				ImageLayers      *studioImageLayerDocument `json:"imageLayers"`
				Takes            []struct {
					ImageLayers *studioImageLayerDocument `json:"imageLayers"`
				} `json:"takes"`
			} `json:"data"`
		} `json:"nodes"`
		Edges []struct{ ID, Source, Target string } `json:"edges"`
	}
	if err := common.Unmarshal(raw, &doc); err != nil || doc.ID != id || strings.TrimSpace(doc.Title) == "" || len([]rune(doc.Title)) > 200 || len(doc.Nodes) > 500 || len(doc.Edges) > 1000 {
		return "", errors.New("invalid project document")
	}
	ids := make(map[string]bool)
	for _, node := range doc.Nodes {
		characters := max(0, len(node.Data.TextDocument)-1)
		blockIDs := map[string]bool{}
		for _, block := range node.Data.TextDocument {
			if block.ID != "" && blockIDs[block.ID] {
				return "", errors.New("formatted draft block IDs must be unique")
			}
			if block.ID != "" {
				blockIDs[block.ID] = true
			}
			characters += len([]rune(block.Text))
		}
		if characters > 30000 {
			return "", errors.New("formatted draft exceeds the supported text length")
		}
		if !StudioIDPattern.MatchString(node.ID) || ids[node.ID] {
			return "", errors.New("invalid or duplicate node ID")
		}
		ids[node.ID] = true
		documents := []*studioImageLayerDocument{node.Data.ImageLayers}
		for _, take := range node.Data.Takes {
			documents = append(documents, take.ImageLayers)
		}
		for _, layers := range documents {
			if layers == nil {
				continue
			}
			if int64(layers.Width)*int64(layers.Height)*int64(len(layers.Layers)) > 32_000_000 {
				return "", errors.New("image layers exceed the editable pixel budget")
			}
			seen := map[string]bool{}
			for _, layer := range layers.Layers {
				if seen[layer.ID] || layer.Kind == "image" && layer.MediaID == "" {
					return "", errors.New("image layers require unique IDs and stored image references")
				}
				seen[layer.ID] = true
			}
		}
		if _, err := StudioRequestOptions(node.Data.MetadataJSON); err != nil {
			return "", err
		}
		if _, err := StudioRequestOptions(node.Data.PayloadPatchJSON); err != nil {
			return "", err
		}
	}
	edges := make(map[string]bool)
	for _, edge := range doc.Edges {
		if !StudioIDPattern.MatchString(edge.ID) || edges[edge.ID] || !ids[edge.Source] || !ids[edge.Target] || edge.Source == edge.Target {
			return "", errors.New("invalid canvas connection")
		}
		edges[edge.ID] = true
	}
	object, _ := document.(map[string]any)
	canvas, _ := object["canvas"].(map[string]any)
	frameIDs, members := map[string]bool{}, map[string]bool{}
	for _, frame := range studioObjects(canvas, "frames") {
		id, _ := frame["id"].(string)
		if !StudioIDPattern.MatchString(id) || ids[id] || frameIDs[id] {
			return "", errors.New("canvas group IDs must be unique")
		}
		frameIDs[id] = true
		for _, raw := range frame["nodeIds"].([]any) {
			nodeID, _ := raw.(string)
			if !ids[nodeID] || members[nodeID] {
				return "", errors.New("canvas group members must exist and belong to one group")
			}
			members[nodeID] = true
		}
	}
	production, _ := object["production"].(map[string]any)
	if production["previs"] != nil {
		if _, err := StudioPrevisDocument(object); err != nil {
			return "", err
		}
	}
	shots, assets := map[string]bool{}, map[string]map[string]any{}
	for _, shot := range studioObjects(object, "shots") {
		if id, ok := shot["id"].(string); ok {
			shots[id] = true
		}
	}
	for _, asset := range studioObjects(object, "assets") {
		if id, ok := asset["id"].(string); ok {
			assets[id] = asset
		}
	}
	states := map[string]bool{}
	for _, state := range studioObjects(production, "continuityStates") {
		shotID, _ := state["shotId"].(string)
		assetID, _ := state["assetId"].(string)
		key := shotID + ":" + assetID
		if !shots[shotID] || assets[assetID] == nil || states[key] {
			return "", errors.New("shot continuity must reference one existing shot and asset")
		}
		states[key] = true
		if versionID, ok := state["versionId"].(string); ok && versionID != "" {
			found := false
			for _, version := range studioObjects(assets[assetID], "versions") {
				if version["id"] == versionID {
					found = true
				}
			}
			if !found {
				return "", errors.New("shot continuity version is unavailable")
			}
		}
	}
	cues := map[string]bool{}
	for _, cue := range studioObjects(production, "dialogueCues") {
		id, _ := cue["id"].(string)
		shotID, _ := cue["shotId"].(string)
		if !StudioIDPattern.MatchString(id) || cues[id] || !shots[shotID] {
			return "", errors.New("dialogue must reference an existing shot and a unique cue")
		}
		cues[id] = true
		if characterID, ok := cue["characterId"].(string); ok && characterID != "" && (assets[characterID] == nil || assets[characterID]["kind"] != "character") {
			return "", errors.New("dialogue character is unavailable")
		}
	}
	voices, _ := production["voiceBindings"].(map[string]any)
	for id := range voices {
		if assets[id] == nil || assets[id]["kind"] != "character" {
			return "", errors.New("voice binding character is unavailable")
		}
	}
	return doc.Title, nil
}

func StudioStorageRoot() (string, error) {
	root := os.Getenv("STUDIO_STORAGE_DIR")
	if root == "" {
		root = filepath.Join("data", "studio")
	}
	return filepath.Abs(root)
}

func StudioMediaPath(media *model.StudioMedia) (string, error) {
	root, err := StudioStorageRoot()
	if err != nil {
		return "", err
	}
	if len(media.Digest) != 64 || !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(media.Digest) {
		return "", errors.New("invalid stored media digest")
	}
	return filepath.Join(root, "objects", fmt.Sprint(media.OwnerID), media.Digest[:2], media.Digest), nil
}

// Media IDs are immutable. A retry may resend the same bytes, never replace an
// existing Take's bytes with a different object.
func SaveStudioMedia(ownerID int, mediaID, mediaType string, content io.Reader) (*model.StudioMedia, error) {
	if ownerID <= 0 || !StudioIDPattern.MatchString(mediaID) {
		return nil, errors.New("invalid media ID")
	}
	mediaType, _, _ = mime.ParseMediaType(mediaType)
	if !(strings.HasPrefix(mediaType, "image/") || strings.HasPrefix(mediaType, "video/") || strings.HasPrefix(mediaType, "audio/") || mediaType == "model/gltf-binary" || mediaType == "application/zip" || mediaType == "text/plain" || mediaType == "application/json") || mediaType == "image/svg+xml" {
		return nil, errors.New("unsupported media type")
	}
	root, err := StudioStorageRoot()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(root, "incoming"), 0700); err != nil {
		return nil, err
	}
	temporary, err := os.CreateTemp(filepath.Join(root, "incoming"), "upload-*")
	if err != nil {
		return nil, err
	}
	defer os.Remove(temporary.Name())
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(temporary, hash), io.LimitReader(content, StudioMaxMediaBytes+1))
	closeErr := temporary.Close()
	if copyErr != nil {
		return nil, copyErr
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if size == 0 || size > StudioMaxMediaBytes {
		return nil, errors.New("media must be between 1 byte and 512 MiB")
	}
	media := model.StudioMedia{OwnerID: ownerID, MediaID: mediaID, MimeType: mediaType, Size: size, Digest: hex.EncodeToString(hash.Sum(nil))}
	var existing model.StudioMedia
	err = model.DB.Where("owner_id = ? AND media_id = ?", ownerID, mediaID).First(&existing).Error
	if err == nil {
		if existing.Digest != media.Digest {
			return nil, errors.New("media ID already contains different bytes")
		}
		storedPath, pathErr := StudioMediaPath(&existing)
		if pathErr != nil {
			return nil, pathErr
		}
		if _, err := os.Stat(storedPath); errors.Is(err, os.ErrNotExist) {
			if err := os.MkdirAll(filepath.Dir(storedPath), 0700); err != nil {
				return nil, err
			}
			if err := os.Rename(temporary.Name(), storedPath); err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		}
		if err := finishStudioObjectPersistence(&existing, storedPath); err != nil {
			return nil, err
		}
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	path, err := StudioMediaPath(&media)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.Rename(temporary.Name(), path); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	media.ObjectKey = filepath.ToSlash(filepath.Join("objects", fmt.Sprint(ownerID), media.Digest[:2], media.Digest))
	// Commit the immutable local receipt before uploading to object storage.
	// A remote storage outage must not erase the request-to-result mapping.
	if err := model.DB.Create(&media).Error; err != nil {
		if model.DB.Where("owner_id = ? AND media_id = ? AND digest = ?", ownerID, mediaID, media.Digest).First(&existing).Error == nil {
			if err := finishStudioObjectPersistence(&existing, path); err != nil {
				return nil, err
			}
			return &existing, nil
		}
		return nil, err
	}
	if err := finishStudioObjectPersistence(&media, path); err != nil {
		return nil, err
	}
	return &media, nil
}

func GetStudioMedia(ownerID int, mediaID string) (*model.StudioMedia, error) {
	var media model.StudioMedia
	err := model.DB.Where("owner_id = ? AND media_id = ?", ownerID, mediaID).First(&media).Error
	if err == nil {
		localPath, pathErr := StudioMediaPath(&media)
		if pathErr != nil {
			return nil, pathErr
		}
		err = restoreStudioObject(&media, localPath)
	}
	return &media, err
}
