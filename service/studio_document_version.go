package service

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const StudioDocumentVersion = 2

var ErrStudioClientVersion = errors.New("update the editor before saving this project version")

// These fields are versioned as a group. A legacy read is a projection only;
// legacy writes to a version-2 document are rejected before media side effects.
var studioProductionV2Keys = []string{"documentVersion", "analysisRefs", "shotNarrative", "appliedEditPlans", "templateOrigin", "continuityReviews", "reframes", "musicVideoPlan", "finalDurations"}

func studioVersionedProductionSections(production map[string]any) []map[string]any {
	sections := []map[string]any{production}
	return append(sections, studioObjects(production, "regionalVersions")...)
}

func StudioProjectDocumentVersion(raw model.StudioDocument) (int, error) {
	var document map[string]any
	if err := common.Unmarshal([]byte(raw), &document); err != nil {
		return 0, errors.New("invalid project document")
	}
	production, _ := document["production"].(map[string]any)
	for _, node := range studioObjects(document, "nodes") {
		data, _ := node["data"].(map[string]any)
		rework, _ := data["reworkRange"].(map[string]any)
		if rework["replacementDuration"] != nil && production["documentVersion"] != float64(StudioDocumentVersion) {
			return 0, ErrStudioClientVersion
		}
	}
	for _, section := range studioVersionedProductionSections(production) {
		for _, key := range []string{"motionGraphics", "audioTracks"} {
			for _, item := range studioObjects(section, key) {
				for _, field := range []string{"phaseOffset", "phaseDuration", "anchorKind", "anchorClipId", "anchorSourceStart", "speed"} {
					if item[field] != nil && production["documentVersion"] != float64(StudioDocumentVersion) {
						return 0, ErrStudioClientVersion
					}
				}
			}
		}
	}
	if production == nil || production["documentVersion"] == nil {
		for _, key := range studioProductionV2Keys[1:] {
			if _, present := production[key]; present {
				return 0, ErrStudioClientVersion
			}
		}
		return 1, nil
	}
	value, ok := production["documentVersion"].(float64)
	if !ok || value < 1 || value > StudioDocumentVersion || value != float64(int(value)) {
		return 0, ErrStudioClientVersion
	}
	if value < StudioDocumentVersion {
		for _, key := range studioProductionV2Keys[1:] {
			if _, present := production[key]; present {
				return 0, ErrStudioClientVersion
			}
		}
	}
	return int(value), nil
}

func StudioProjectDocumentForClient(raw model.StudioDocument, clientVersion int) (model.StudioDocument, error) {
	if _, err := StudioProjectDocumentVersion(raw); err != nil {
		return "", err
	}
	if clientVersion >= StudioDocumentVersion {
		return raw, nil
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(raw), &document); err != nil {
		return "", err
	}
	for _, node := range studioObjects(document, "nodes") {
		data, _ := node["data"].(map[string]any)
		rework, _ := data["reworkRange"].(map[string]any)
		delete(rework, "replacementDuration")
	}
	if production, ok := document["production"].(map[string]any); ok {
		for _, section := range studioVersionedProductionSections(production) {
			for _, key := range []string{"motionGraphics", "audioTracks"} {
				for _, item := range studioObjects(section, key) {
					for _, field := range []string{"phaseOffset", "phaseDuration", "anchorKind", "anchorClipId", "anchorSourceStart", "speed"} {
						delete(item, field)
					}
				}
			}
		}
		for _, key := range studioProductionV2Keys {
			delete(production, key)
		}
	}
	encoded, err := common.Marshal(document)
	return model.StudioDocument(encoded), err
}

func ValidateStudioClientWrite(existing, next model.StudioDocument, clientVersion int) error {
	nextVersion, err := StudioProjectDocumentVersion(next)
	if err != nil || nextVersion > clientVersion {
		return ErrStudioClientVersion
	}
	if existing == "" {
		return nil
	}
	version, err := StudioProjectDocumentVersion(existing)
	if err != nil || version > clientVersion || nextVersion < version {
		return ErrStudioClientVersion
	}
	return nil
}
