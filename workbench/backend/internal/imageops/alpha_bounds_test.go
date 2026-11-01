package imageops

import (
	"context"
	"image"
	"image/color"
	"testing"
)

func TestAlphaBoundsRetainsOneIn65535AndExactPixelCrop(t *testing.T) {
	picture := image.NewNRGBA64(image.Rect(10, 20, 41, 43))
	picture.SetNRGBA64(11, 22, color.NRGBA64{R: 60000, G: 20000, B: 10000, A: 1})
	picture.SetNRGBA64(35, 39, color.NRGBA64{R: 50000, A: 65535})
	bounds, empty, err := AlphaBounds(context.Background(), picture)
	if err != nil || empty || bounds != (PixelCrop{X: 1, Y: 2, Width: 25, Height: 18}) {
		t.Fatal("low-alpha edge or original coordinate lost", bounds, empty, err)
	}
	pieces, err := Plan(31, 23, Recipe{Operation: "crop", CropPixels: &bounds})
	if err != nil || len(pieces) != 1 || pieces[0].X != 1 || pieces[0].Y != 2 || pieces[0].Width != 25 || pieces[0].Height != 18 {
		t.Fatal("exact region lost", pieces, err)
	}
	for _, recipe := range []Recipe{{Operation: "crop", CropPixels: &bounds, Crop: &Crop{}}, {Operation: "mask", CropPixels: &bounds}, {Operation: "crop", CropPixels: &PixelCrop{X: 30, Y: 0, Width: 2, Height: 1}}, {Operation: "crop", CropPixels: &PixelCrop{X: 0, Y: 0, Width: int(^uint(0) >> 1), Height: 1}}} {
		if _, err := Plan(31, 23, recipe); err == nil {
			t.Fatal("invalid or mixed pixel region accepted")
		}
	}
}
func TestAlphaBoundsEmptyOpaqueAndCancellation(t *testing.T) {
	picture := image.NewNRGBA64(image.Rect(0, 0, 31, 23))
	if _, empty, err := AlphaBounds(context.Background(), picture); err != nil || !empty {
		t.Fatal("empty frame not identified", err)
	}
	for y := 0; y < 23; y++ {
		for x := 0; x < 31; x++ {
			picture.SetNRGBA64(x, y, color.NRGBA64{A: 65535})
		}
	}
	bounds, empty, err := AlphaBounds(context.Background(), picture)
	if err != nil || empty || bounds != (PixelCrop{Width: 31, Height: 23}) {
		t.Fatal("opaque frame was cropped", bounds, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := AlphaBounds(ctx, picture); err != context.Canceled {
		t.Fatal("cancellation ignored", err)
	}
}
