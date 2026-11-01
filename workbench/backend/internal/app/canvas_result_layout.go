package app

import "math"

type canvasResultRectangle struct {
	x, y, width, height float64
}

// Keep one output group intact and choose the nearer clear area below or to
// the right. Existing nodes, including manually moved earlier outputs, stay put.
func availableCanvasResultPosition(nodes []map[string]any, preferred canvasResultRectangle) canvasResultRectangle {
	rectangles := make([]canvasResultRectangle, 0, len(nodes))
	for _, node := range nodes {
		position, _ := node["position"].(map[string]any)
		x, xOK := position["x"].(float64)
		y, yOK := position["y"].(float64)
		width, wOK := node["width"].(float64)
		height, hOK := node["height"].(float64)
		if !xOK || !yOK || !wOK || !hOK || width <= 0 || height <= 0 || math.IsNaN(x+width) || math.IsNaN(y+height) || math.IsInf(x+width, 0) || math.IsInf(y+height, 0) {
			continue
		}
		rectangles = append(rectangles, canvasResultRectangle{x, y, width, height})
	}
	resolve := func(down bool) canvasResultRectangle {
		candidate := preferred
		for attempt := 0; attempt <= len(rectangles); attempt++ {
			next := candidate
			collided := false
			for _, node := range rectangles {
				if candidate.x+candidate.width+36 <= node.x || candidate.x >= node.x+node.width+36 || candidate.y+candidate.height+36 <= node.y || candidate.y >= node.y+node.height+36 {
					continue
				}
				collided = true
				if down {
					next.y = math.Max(next.y, node.y+node.height+36)
				} else {
					next.x = math.Max(next.x, node.x+node.width+36)
				}
			}
			if !collided {
				return candidate
			}
			candidate = next
		}
		return candidate
	}
	down, right := resolve(true), resolve(false)
	if down.y-preferred.y <= right.x-preferred.x {
		return down
	}
	return right
}
