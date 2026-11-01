// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// Upgrade only an absent native display preference. Original scenes, native
// edits and explicit user preferences remain authoritative after conversion.
func stageLegacyPrevisCanvas(rows *repository.ProductionImportRows, canvas *model.CanvasProject, payload map[string]any, result *LegacyPrevisReport) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if len(encoded) > 20<<20 {
		return ErrLegacyBundle
	}
	result.PayloadSHA256 = fmt.Sprintf("%x", sha256.Sum256(encoded))
	if rows.Canvas.ID != "" {
		rows.Canvas.PayloadJSON = string(encoded)
	} else {
		next := *canvas
		next.PayloadJSON = string(encoded)
		rows.PrevisCanvas = &next
		rows.PrevisCanvasBeforeSHA = result.BeforeSHA256
	}
	return nil
}
