package app

import (
	"encoding/json"
	"testing"

	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func TestImageOperationNativeApplyAvoidsNeighborAndExistingOutputs(t *testing.T) {
	source := map[string]any{"id": "source", "type": "image", "position": map[string]any{"x": float64(10), "y": float64(20)}, "width": float64(310), "height": float64(230)}
	neighbor := map[string]any{"id": "neighbor", "position": map[string]any{"x": float64(440), "y": float64(20)}, "width": float64(640), "height": float64(380)}
	nodes := []map[string]any{source, neighbor}
	input := imageOperationInput{Request: ImageOperationCreateRequest{SourceNodeID: "source", Recipe: imageops.Recipe{Operation: "split"}}}
	outputs := []imageOperationStoredOutput{{ResourceID: "output0", Width: 15, Height: 23, Piece: imageops.Piece{Width: 15, Height: 23, OutputWidth: 15, OutputHeight: 23}}, {ResourceID: "output1", Width: 16, Height: 23, Piece: imageops.Piece{Width: 16, Height: 23, OutputWidth: 16, OutputHeight: 23, Column: 1}}}
	for _, taskID := range []string{"first", "second"} {
		operations, added, _, err := imageOperationCanvasAdditions(model.Task{ID: taskID}, input, outputs, source, nodes, nil)
		if err != nil || len(added) != 2 {
			t.Fatal("missing native outputs", err)
		}
		var children []map[string]any
		for _, operation := range operations {
			if operation.Type != "create_node" {
				continue
			}
			var child map[string]any
			if err := json.Unmarshal(operation.Node, &child); err != nil {
				t.Fatal(err)
			}
			position := child["position"].(map[string]any)
			x, y, w, h := position["x"].(float64), position["y"].(float64), child["width"].(float64), child["height"].(float64)
			for _, node := range nodes {
				p := node["position"].(map[string]any)
				nx, ny, nw, nh := p["x"].(float64), p["y"].(float64), node["width"].(float64), node["height"].(float64)
				if !(x+w+36 <= nx || x >= nx+nw+36 || y+h+36 <= ny || y >= ny+nh+36) {
					t.Fatal("new result covers an existing node")
				}
			}
			children = append(children, child)
		}
		nodes = append(nodes, children...)
	}
}
