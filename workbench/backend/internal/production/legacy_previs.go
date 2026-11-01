// SPDX-License-Identifier: AGPL-3.0-or-later
// Director scene conventions derived from new-api Studio (QuantumNous).
package production

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type LegacyPrevisReport struct {
	CanvasID       string `json:"canvasId"`
	SceneID        string `json:"sceneId"`
	NodeID         string `json:"nodeId"`
	Objects        int    `json:"objects"`
	Keyframes      int    `json:"keyframes"`
	Reused         bool   `json:"reused,omitempty"`
	CanvasRevision int64  `json:"canvasRevision"`
	BeforeSHA256   string `json:"beforeSha256"`
	PayloadSHA256  string `json:"payloadSha256"`
}

type legacyPrevisKey struct{ Time, X, Y, Z, Yaw float64 }

func legacyPrevisNumber(value any, fallback, min, max float64) (float64, error) {
	if value == nil {
		return fallback, nil
	}
	switch value.(type) {
	case json.Number, float64, int:
	default:
		return 0, ErrLegacyBundle
	}
	n := numberValue(value)
	if math.IsNaN(n) || math.IsInf(n, 0) || n < min || n > max {
		return 0, ErrLegacyBundle
	}
	return n, nil
}

func legacyPrevisTransform(key legacyPrevisKey, scale [3]float64, pitch, roll float64) map[string]any {
	return map[string]any{"position": []float64{key.X, key.Y, key.Z}, "rotation": []float64{pitch, key.Yaw * math.Pi / 180, roll}, "scale": scale}
}

func legacyPrevisSample(keys []legacyPrevisKey, t float64, fallback legacyPrevisKey) legacyPrevisKey {
	if len(keys) == 0 {
		return fallback
	}
	if t <= keys[0].Time {
		return keys[0]
	}
	for i := 1; i < len(keys); i++ {
		if keys[i].Time <= t {
			continue
		}
		a, b := keys[i-1], keys[i]
		p := (t - a.Time) / (b.Time - a.Time)
		return legacyPrevisKey{t, a.X + (b.X-a.X)*p, a.Y + (b.Y-a.Y)*p, a.Z + (b.Z-a.Z)*p, a.Yaw + (b.Yaw-a.Yaw)*p}
	}
	return keys[len(keys)-1]
}

// This only appends a native scene. The existing canvas, timeline and original
// receipt are not reconstructed from the old document during an upgrade.
func projectLegacyPrevis(rows *repository.ProductionImportRows, report *LegacyProjectionReport, document map[string]any, resources map[string]model.Resource, identities map[string]map[string]string, data LegacyProjectionData) error {
	value := objectValue(document["production"])["previs"]
	if !legacyVersionFieldHasContent(value) {
		return nil
	}
	source := objectValue(value)
	if source == nil {
		return ErrLegacyBundle
	}
	pathsVisible := true
	if raw, present := objectValue(source["advanced"])["showPaths"]; present {
		var ok bool
		pathsVisible, ok = raw.(bool)
		if !ok {
			return ErrLegacyBundle
		}
	}
	canvas := &rows.Canvas
	if canvas.ID == "" {
		canvas = data.Canvas
	}
	if canvas == nil || canvas.ID != rows.Receipt.CanvasID || canvas.ProjectID != rows.Project.ID || canvas.UserID != rows.Project.UserID {
		return ErrLegacyBundle
	}
	var payload map[string]any
	if json.Unmarshal([]byte(canvas.PayloadJSON), &payload) != nil || payload == nil {
		return ErrLegacyBundle
	}
	id := func(parts ...string) string {
		return legacyNativeID(append([]string{"legacy-previs", rows.Receipt.ID}, parts...)...)
	}
	sceneID, nodeID := id("scene"), id("node")
	result := &LegacyPrevisReport{CanvasID: canvas.ID, SceneID: sceneID, NodeID: nodeID, CanvasRevision: canvas.Revision, BeforeSHA256: fmt.Sprintf("%x", sha256.Sum256([]byte(canvas.PayloadJSON)))}
	for _, value := range listValue(payload["previsScenes"]) {
		scene := objectValue(value)
		if stringValue(scene, "id") != sceneID {
			continue
		}
		result.Reused = true
		result.Objects = len(listValue(scene["objects"]))
		result.PayloadSHA256 = result.BeforeSHA256
		if _, present := scene["motionPathsVisible"]; !present {
			scene["motionPathsVisible"] = pathsVisible
			if err := stageLegacyPrevisCanvas(rows, canvas, payload, result); err != nil {
				return err
			}
		}
		report.Previs = result
		report.NativeFields = appendUnique(report.NativeFields, "editable-director-previs")
		return nil
	}
	if data.PreviousPlanning != nil && data.PreviousPlanning.Previs != nil {
		// Absence after an accepted conversion is a user deletion, not a gap to
		// repair by resurrecting the original scene and its removed actors.
		result.Reused = true
		result.PayloadSHA256 = result.BeforeSHA256
		report.Previs = result
		return nil
	}
	duration, err := legacyPrevisNumber(source["duration"], 5, 1, 30)
	if err != nil {
		return err
	}
	advanced := objectValue(source["advanced"])
	objects := []any{}
	ids := map[string]string{}
	groups := []string{"actors", "props", "models"}
	for _, group := range groups {
		items := listValue(source[group])
		if group == "models" {
			items = listValue(advanced[group])
		}
		limit := 12
		if group == "props" {
			limit = 20
		}
		if len(items) > limit {
			return ErrLegacyBundle
		}
		for _, raw := range items {
			item := objectValue(raw)
			oldID := stringValue(item, "id")
			if oldID == "" || oldID == "__camera__" || ids[oldID] != "" {
				return ErrLegacyBundle
			}
			ids[oldID] = id("object", oldID)
		}
	}
	tracks := map[string][]legacyPrevisKey{}
	for _, raw := range listValue(advanced["tracks"]) {
		track := objectValue(raw)
		target := stringValue(track, "targetId")
		if target != "__camera__" && ids[target] == "" {
			return ErrLegacyBundle
		}
		if _, exists := tracks[target]; exists {
			return ErrLegacyBundle
		}
		keys := []legacyPrevisKey{}
		if len(listValue(track["keys"])) > 100 {
			return ErrLegacyBundle
		}
		for _, raw := range listValue(track["keys"]) {
			key := objectValue(raw)
			values := make([]float64, 5)
			for i, name := range []string{"time", "x", "y", "z", "yaw"} {
				min, max := -100.0, 100.0
				if name == "time" {
					min, max = 0, duration
				}
				if name == "yaw" {
					min, max = -180, 180
				}
				values[i], err = legacyPrevisNumber(key[name], 0, min, max)
				if err != nil {
					return err
				}
			}
			keys = append(keys, legacyPrevisKey{values[0], values[1], values[2], values[3], values[4]})
		}
		sort.Slice(keys, func(i, j int) bool { return keys[i].Time < keys[j].Time })
		for i := 1; i < len(keys); i++ {
			if keys[i].Time-keys[i-1].Time < 0.001 {
				return ErrLegacyBundle
			}
		}
		tracks[target] = keys
	}
	for _, group := range groups {
		items := listValue(source[group])
		if group == "models" {
			items = listValue(advanced[group])
		}
		for _, raw := range items {
			item := objectValue(raw)
			oldID := stringValue(item, "id")
			scale := [3]float64{1, 1, 1}
			base := legacyPrevisKey{}
			numbers := []*float64{&base.X, &base.Y, &base.Z, &base.Yaw}
			for i, name := range []string{"x", "y", "z", "yaw"} {
				*numbers[i], err = legacyPrevisNumber(item[name], 0, -180, 180)
				if err != nil {
					return err
				}
			}
			obj := map[string]any{"id": ids[oldID], "name": stringValue(item, "title"), "kind": "primitive", "primitive": "box", "color": stringValue(item, "color"), "visible": true, "castShadow": true, "receiveShadow": true}
			if obj["name"] == "" {
				obj["name"] = "导入对象 " + fmt.Sprint(len(objects)+1)
			}
			pitch, roll := 0.0, 0.0
			if group == "props" {
				for i, name := range []string{"width", "height", "depth"} {
					scale[i], err = legacyPrevisNumber(item[name], 1, 0.1, 5)
					if err != nil {
						return err
					}
				}
				base.Y = scale[1] / 2
			}
			if group == "actors" {
				obj["kind"] = "actor"
				delete(obj, "primitive")
				obj["pose"] = stringValue(item, "pose")
				if obj["pose"] == "" {
					obj["pose"] = "stand"
				}
				if !map[string]bool{"stand": true, "walk": true, "wave": true, "point": true, "sit": true}[obj["pose"].(string)] {
					return ErrLegacyBundle
				}
			}
			if obj["color"] == "" {
				obj["color"] = "#8ab4f8"
			}
			if group == "models" {
				resource, ok := resources[stringValue(item, "modelMediaId")]
				if !ok || resource.ID == "" {
					return ErrLegacyBundle
				}
				if resource.MimeType != "model/gltf-binary" && resource.MimeType != "model/gltf+json" {
					return ErrLegacyBundle
				}
				obj["kind"] = "model"
				delete(obj, "primitive")
				obj["storageKey"] = "resource:" + resource.ID
				obj["url"] = "/api/resources/" + resource.ID + "/file"
				obj["mimeType"] = resource.MimeType
				s, err := legacyPrevisNumber(item["scale"], 1, 0.01, 10)
				if err != nil {
					return err
				}
				scale = [3]float64{s, s, s}
				pitch, err = legacyPrevisNumber(item["pitch"], 0, -180, 180)
				if err != nil {
					return err
				}
				pitch *= math.Pi / 180
				roll, err = legacyPrevisNumber(item["roll"], 0, -180, 180)
				if err != nil {
					return err
				}
				roll *= math.Pi / 180
				obj["preferredAnimation"] = stringValue(item, "animation")
				obj["preserveModelUnits"] = true
			}
			if asset := stringValue(item, "assetId"); asset != "" {
				mapped := identities["assets"][asset]
				if mapped == "" {
					return ErrLegacyBundle
				}
				obj["assetId"] = mapped
				version := identities["assetRoots"][asset]
				if oldVersion := stringValue(item, "assetVersionId"); oldVersion != "" {
					version = identities["assetVersions"][asset+"/"+oldVersion]
					if version == "" {
						return ErrLegacyBundle
					}
				}
				obj["sourceAssetVersionId"] = version
			}
			keys := tracks[oldID]
			if len(keys) == 0 && group == "actors" {
				end := base
				end.Time = duration
				end.X, err = legacyPrevisNumber(item["endX"], base.X, -10, 10)
				if err != nil {
					return err
				}
				end.Z, err = legacyPrevisNumber(item["endZ"], base.Z, -10, 10)
				if err != nil {
					return err
				}
				keys = []legacyPrevisKey{base, end}
			}
			frames := []any{}
			for i, key := range keys {
				frames = append(frames, map[string]any{"id": id("object-key", oldID, fmt.Sprint(i)), "time": key.Time, "transform": legacyPrevisTransform(key, scale, pitch, roll), "easing": "linear"})
			}
			obj["transform"] = legacyPrevisTransform(legacyPrevisSample(keys, 0, base), scale, pitch, roll)
			obj["keyframes"] = frames
			result.Keyframes += len(frames)
			objects = append(objects, obj)
		}
	}
	cameraSource := objectValue(source["camera"])
	values := []float64{20, 20, 20, 10, 50}
	for i, name := range []string{"yaw", "endYaw", "pitch", "distance", "fov"} {
		min, max := -180.0, 180.0
		if i == 2 {
			min, max = 5, 80
		}
		if i == 3 {
			min, max = 3, 30
		}
		if i == 4 {
			min, max = 20, 100
		}
		values[i], err = legacyPrevisNumber(cameraSource[name], values[i], min, max)
		if err != nil {
			return err
		}
	}
	cameraID, shotID := id("camera"), id("shot")
	camera := map[string]any{"id": cameraID, "name": "导入的摄影机", "target": []float64{0, 1, 0}, "focalLength": 36 / (2 * math.Tan(values[4]*math.Pi/360)), "fov": values[4], "aperture": 2.8, "focusDistance": values[3], "near": 0.1, "far": 200}
	for old, name := range map[string]string{"followId": "followObjectId", "lookAtId": "lookAtObjectId"} {
		if target := stringValue(advanced, old); target != "" {
			if ids[target] == "" {
				return ErrLegacyBundle
			}
			camera[name] = ids[target]
		}
	}
	// Sample the orbit at the exported 24fps clock and every authored knot;
	// linear chords otherwise cut across large camera turns between sparse keys.
	times := map[float64]bool{0: true, duration: true}
	for frame := 1; float64(frame)/24 < duration; frame++ {
		times[float64(frame)/24] = true
	}
	for _, key := range tracks["__camera__"] {
		times[key.Time] = true
	}
	sorted := []float64{}
	for t := range times {
		sorted = append(sorted, t)
	}
	sort.Float64s(sorted)
	frames := []any{}
	for i, t := range sorted {
		orbit := legacyPrevisSample(tracks["__camera__"], t, legacyPrevisKey{Time: t, Yaw: values[0] + (values[1]-values[0])*t/duration})
		yaw, pitch := orbit.Yaw*math.Pi/180, values[2]*math.Pi/180
		key := legacyPrevisKey{X: math.Sin(yaw)*values[3]*math.Cos(pitch) + orbit.X, Y: math.Sin(pitch)*values[3] + 1 + orbit.Y, Z: math.Cos(yaw)*values[3]*math.Cos(pitch) + orbit.Z}
		transform := legacyPrevisTransform(key, [3]float64{1, 1, 1}, 0, 0)
		if i == 0 {
			camera["transform"] = transform
		}
		frames = append(frames, map[string]any{"id": id("camera-key", fmt.Sprint(i)), "time": t, "transform": transform, "easing": "linear"})
	}
	camera["keyframes"] = frames
	result.Keyframes += len(frames)
	result.Objects = len(objects)
	ratio := rows.Project.AspectRatio
	if ratio != "16:9" && ratio != "9:16" && ratio != "1:1" && ratio != "4:3" && ratio != "3:4" {
		ratio = "16:9"
		report.PreservedOnly = appendUnique(report.PreservedOnly, "production.previs.aspectRatio")
	}
	stamp := rows.Receipt.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z")
	scene := map[string]any{"id": sceneID, "version": 1, "title": "导入的导演预演", "background": "#14191f", "environmentIntensity": 0.7, "gridVisible": true, "objects": objects, "cameras": []any{camera}, "lights": []any{map[string]any{"id": id("light"), "name": "预演主光", "type": "directional", "transform": legacyPrevisTransform(legacyPrevisKey{X: 5, Y: 8, Z: 4}, [3]float64{1, 1, 1}, 0, 0), "color": "#ffffff", "intensity": 3, "castShadow": true}}, "shots": []any{map[string]any{"id": shotID, "name": "导入的预演镜头", "cameraId": cameraID, "duration": duration, "fps": 24, "aspectRatio": ratio, "shotSize": "wide", "cameraMove": "static", "prompt": ""}}, "activeShotId": shotID, "createdAt": stamp, "updatedAt": stamp}
	scene["motionPathsVisible"] = pathsVisible
	exports := []any{}
	for index, raw := range listValue(advanced["exports"]) {
		entry := objectValue(raw)
		resource, ok := resources[stringValue(entry, "modelMediaId")]
		if !ok || resource.ID == "" || resource.MimeType != "model/gltf-binary" {
			return ErrLegacyBundle
		}
		exports = append(exports, map[string]any{"id": id("export", fmt.Sprint(index)), "title": stringValue(entry, "title"), "createdAt": stringValue(entry, "createdAt"), "storageKey": "resource:" + resource.ID, "url": "/api/resources/" + resource.ID + "/file"})
	}
	scene["exports"] = exports
	payload["previsScenes"] = append(listValue(payload["previsScenes"]), scene)
	nodes := listValue(payload["nodes"])
	for _, value := range nodes {
		if stringValue(objectValue(value), "id") == nodeID {
			return ErrLegacyBundle
		}
	}
	payload["nodes"] = append(nodes, map[string]any{"id": nodeID, "type": "video", "title": "导入的导演预演", "position": map[string]any{"x": 0, "y": float64(len(nodes))*40 + 400}, "width": 520, "height": 340, "metadata": map[string]any{"workflowKind": "shot", "workflowTitle": "导入的导演预演", "shotIndex": len(nodes) + 1, "generationMode": "video", "videoEditOperation": "text_to_video", "status": "idle", "composerContent": "", "previsSceneId": sceneID, "previsShotId": shotID}})
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if len(encoded) > 20<<20 {
		return ErrLegacyBundle
	}
	if encodedScene, _ := json.Marshal(scene); len(encodedScene) > 1<<20 {
		return ErrLegacyBundle
	}
	result.PayloadSHA256 = fmt.Sprintf("%x", sha256.Sum256(encoded))
	report.Previs = result
	if rows.Canvas.ID != "" {
		rows.Canvas.PayloadJSON = string(encoded)
	} else {
		next := *canvas
		next.PayloadJSON = string(encoded)
		rows.PrevisCanvas = &next
		rows.PrevisCanvasBeforeSHA = result.BeforeSHA256
	}
	report.NativeFields = appendUnique(report.NativeFields, "editable-director-previs")
	remaining := []string{}
	for _, path := range report.PreservedOnly {
		if path != "production.previs" {
			remaining = append(remaining, path)
		}
	}
	report.PreservedOnly = remaining
	return nil
}
