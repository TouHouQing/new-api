package imageops

import "errors"

// Each crop uses its own original pixel frame. The app freezes the file hashes
// and verifies these identities again before decoding and publishing outputs.
type LayerTrim struct {
	ID         string    `json:"id"`
	ResourceID string    `json:"resourceId"`
	Width      int       `json:"width"`
	Height     int       `json:"height"`
	Crop       PixelCrop `json:"crop"`
}

func planLayerTrims(recipe Recipe) ([]Piece, error) {
	if recipe.Operation != "trim-layers" || len(recipe.TrimLayers) < 1 || len(recipe.TrimLayers) > MaxCompositionLayers || recipe.Split != nil || recipe.Crop != nil || recipe.CropPixels != nil || recipe.Resize != nil || recipe.Mask != nil || recipe.Compose != nil {
		return nil, errors.New("独立图层裁剪参数无效")
	}
	seen := map[string]bool{}
	var pixels int64
	pieces := make([]Piece, 0, len(recipe.TrimLayers))
	for i, layer := range recipe.TrimLayers {
		if layer.ID == "" || len(layer.ID) > 128 || layer.ResourceID == "" || len(layer.ResourceID) > 80 || seen[layer.ID] {
			return nil, errors.New("裁剪图层须有明确且不重复的来源")
		}
		seen[layer.ID] = true
		planned, err := Plan(layer.Width, layer.Height, Recipe{Operation: "crop", CropPixels: &layer.Crop})
		if err != nil {
			return nil, err
		}
		pixels += int64(layer.Width) * int64(layer.Height)
		if pixels > MaxCompositionPixels {
			return nil, errors.New("图层总像素超过处理上限")
		}
		piece := planned[0]
		piece.Row = i
		pieces = append(pieces, piece)
	}
	return pieces, nil
}
