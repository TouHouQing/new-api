package imageops

import "testing"

func TestNormalizationPreservesExactFrameAndOnePercentBoundary(t *testing.T) {
	for _, algorithm := range []string{"bilinear", "high"} {
		pieces, err := Plan(1001, 1000, Recipe{Operation: "normalize", Normalize: &Normalize{Width: 997, Height: 997, Algorithm: algorithm}})
		if err != nil || len(pieces) != 1 || pieces[0] != (Piece{Width: 1001, Height: 1000, OutputWidth: 997, OutputHeight: 997}) {
			t.Fatal("provider rounding was not mapped to exact original frame", pieces, err)
		}
		if _, err := planNormalization(101, 100, Normalize{Width: 100, Height: 100, Algorithm: algorithm}); err != nil {
			t.Fatal("exact one-percent boundary rejected", err)
		}
		if _, err := planNormalization(102, 100, Normalize{Width: 100, Height: 100, Algorithm: algorithm}); err == nil {
			t.Fatal("arbitrary stretching silently accepted")
		}
	}
	if _, err := Plan(100, 100, Recipe{Operation: "crop", CropPixels: &PixelCrop{Width: 100, Height: 100}, Normalize: &Normalize{Width: 100, Height: 100, Algorithm: "high"}}); err == nil {
		t.Fatal("unrelated normalization mixed into crop")
	}
	if _, err := planNormalization(100, 100, Normalize{Width: 100, Height: 100, Algorithm: "invented"}); err == nil {
		t.Fatal("unknown interpolation accepted")
	}
}
