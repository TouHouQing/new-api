package imageplan

// OutputSchema constrains local visual planning. Pixel ownership, semantics,
// source identity and usable extraction bounds are still checked by Parse.
func OutputSchema(size Size) map[string]any {
	text := func(maximum int) map[string]any {
		return map[string]any{"type": "string", "minLength": 1, "maxLength": maximum}
	}
	enum := func(values ...string) map[string]any { return map[string]any{"type": "string", "enum": values} }
	object := func(properties map[string]any, required ...string) map[string]any {
		return map[string]any{"type": "object", "additionalProperties": false, "properties": properties, "required": required}
	}
	generation := object(map[string]any{"prompt": text(2400), "background": enum("opaque", "transparent")}, "prompt", "background")
	extraction := object(map[string]any{"method": enum("source", "source-region", "generate"), "shape": enum("rect", "rounded-rect", "ellipse"), "radiusRatio": map[string]any{"type": "number", "minimum": 0, "maximum": 0.5}}, "method")
	layer := object(map[string]any{"name": text(80), "description": text(1000), "kind": enum("background", "object"), "generation": generation, "editUnit": enum("scene", "object", "text", "decoration", "group"), "removeFromBackground": map[string]any{"type": "boolean"}, "bbox": map[string]any{"type": "array", "minItems": 4, "maxItems": 4, "items": map[string]any{"type": "number", "minimum": 0, "maximum": 1000}}, "extraction": extraction}, "name", "description", "kind", "generation", "extraction")
	ready := object(map[string]any{"canPlan": map[string]any{"const": true}, "layout": enum("continuous", "composition", "mixed"), "coordinateSpace": map[string]any{"const": "normalized1000"}, "imageSize": object(map[string]any{"width": map[string]any{"const": size.Width}, "height": map[string]any{"const": size.Height}}, "width", "height"), "reasoning": object(map[string]any{"structure": text(1000), "editingGoal": text(1000), "strategy": text(1000)}, "structure", "editingGoal", "strategy"), "layers": map[string]any{"type": "array", "minItems": 2, "maxItems": 8, "items": layer}}, "canPlan", "layout", "coordinateSpace", "imageSize", "layers")
	unavailable := object(map[string]any{"canPlan": map[string]any{"const": false}, "reason": text(1000)}, "canPlan", "reason")
	return map[string]any{"anyOf": []any{ready, unavailable}}
}
