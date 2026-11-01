package imageops

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"math"
	"testing"
)

func testPicture(t *testing.T, width, height int) (*image.NRGBA, []byte) {
	t.Helper()
	picture := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			picture.SetNRGBA(x, y, color.NRGBA{uint8(x*7 + y*3), uint8(y*19 + x), uint8(x*13 + y*11), uint8((x*5 + y*17) % 256)})
		}
	}
	var data bytes.Buffer
	if err := png.Encode(&data, picture); err != nil {
		t.Fatal(err)
	}
	return picture, data.Bytes()
}

func TestImageOperationNonuniformSplitPreservesAllPixelsIncludingAlpha(t *testing.T) {
	picture, raw := testPicture(t, 601, 377)
	source, err := Inspect(raw)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(context.Background(), raw, source)
	if err != nil {
		t.Fatal(err)
	}
	recipe := Recipe{Operation: "split", Split: &Split{Rows: 2, Columns: 3, HorizontalLines: []float64{0.37}, VerticalLines: []float64{0.23, 0.71}}}
	pieces, err := Plan(source.Width, source.Height, recipe)
	if err != nil {
		t.Fatal(err)
	}
	covered := make([]bool, 601*377)
	for _, piece := range pieces {
		data, err := RenderPNG(context.Background(), decoded, piece, "nearest")
		if err != nil {
			t.Fatal(err)
		}
		result, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		for y := 0; y < piece.Height; y++ {
			for x := 0; x < piece.Width; x++ {
				sx, sy := piece.X+x, piece.Y+y
				index := sy*601 + sx
				if covered[index] {
					t.Fatal("overlapping source pixels")
				}
				covered[index] = true
				actual := color.NRGBAModel.Convert(result.At(x, y)).(color.NRGBA)
				if actual != picture.NRGBAAt(sx, sy) {
					t.Fatalf("pixel changed at %d,%d: %v != %v", sx, sy, actual, picture.NRGBAAt(sx, sy))
				}
			}
		}
	}
	for _, found := range covered {
		if !found {
			t.Fatal("missing source pixels")
		}
	}
}

func withPNGMetadata(raw []byte, kind string, body []byte) []byte {
	chunk := make([]byte, 12+len(body))
	binary.BigEndian.PutUint32(chunk[:4], uint32(len(body)))
	copy(chunk[4:8], kind)
	copy(chunk[8:], body)
	binary.BigEndian.PutUint32(chunk[len(chunk)-4:], crc32.ChecksumIEEE(chunk[4:len(chunk)-4]))
	result := append([]byte{}, raw[:33]...)
	result = append(result, chunk...)
	return append(result, raw[33:]...)
}

func TestImageOperationEXIFOrientationAndMalformedMetadata(t *testing.T) {
	picture := image.NewNRGBA(image.Rect(0, 0, 3, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 3; x++ {
			picture.SetNRGBA(x, y, color.NRGBA{uint8(y*3 + x + 1), 0, 0, 255})
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, picture); err != nil {
		t.Fatal(err)
	}
	wants := [][]uint8{{1, 2, 3, 4, 5, 6}, {3, 2, 1, 6, 5, 4}, {6, 5, 4, 3, 2, 1}, {4, 5, 6, 1, 2, 3}, {1, 4, 2, 5, 3, 6}, {4, 1, 5, 2, 6, 3}, {6, 3, 5, 2, 4, 1}, {3, 6, 2, 5, 1, 4}}
	for orientation := 1; orientation <= 8; orientation++ {
		tiff := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, byte(orientation), 0, 0, 0, 0, 0, 0, 0}
		raw := withPNGMetadata(buffer.Bytes(), "eXIf", tiff)
		source, err := Inspect(raw)
		if err != nil {
			t.Fatal(err)
		}
		if source.Orientation != orientation {
			t.Fatal("orientation lost")
		}
		actual, err := Decode(context.Background(), raw, source)
		if err != nil {
			t.Fatal(err)
		}
		index := 0
		for y := 0; y < source.Height; y++ {
			for x := 0; x < source.Width; x++ {
				if color.NRGBAModel.Convert(actual.At(x, y)).(color.NRGBA).R != wants[orientation-1][index] {
					t.Fatalf("orientation %d incorrect", orientation)
				}
				index++
			}
		}
	}
	for _, data := range [][]byte{nil, []byte("Exif\x00\x00"), []byte{'I', 'I', 42, 0, 255, 255, 255, 255}} {
		if tiffOrientation(data) != 1 {
			t.Fatal("unsafe malformed orientation")
		}
	}
}

func TestImageOperationRejectsAmbiguousInputsAndChangedSource(t *testing.T) {
	_, raw := testPicture(t, 9, 7)
	source, err := Inspect(raw)
	if err != nil {
		t.Fatal(err)
	}
	changed := source
	changed.SHA256 = "changed"
	if _, err := Decode(context.Background(), raw, changed); err == nil {
		t.Fatal("changed source accepted")
	}
	if _, err := Inspect(withPNGMetadata(raw, "acTL", []byte{0, 0, 0, 2, 0, 0, 0, 0})); err == nil {
		t.Fatal("animation silently flattened")
	}
	for _, recipe := range []Recipe{
		{Operation: "unknown"},
		{Operation: "split", Split: &Split{Rows: 1, Columns: 1}},
		{Operation: "split", Split: &Split{Rows: 8, Columns: 1}},
		{Operation: "split", Split: &Split{Rows: 1, Columns: 3, VerticalLines: []float64{0.5, 0.5}}},
		{Operation: "split", Split: &Split{Rows: 1, Columns: 2, VerticalLines: []float64{math.NaN()}}},
		{Operation: "crop", Crop: &Crop{X: 0.9, Width: 0.2, Height: 1}},
		{Operation: "resize", Resize: &Resize{TargetLongEdge: 4097, Algorithm: "high"}},
		{Operation: "resize", Resize: &Resize{TargetLongEdge: 5, Algorithm: "ai"}},
		{Operation: "crop", Crop: &Crop{Width: 1, Height: 1}, Split: &Split{Rows: 1, Columns: 2}},
	} {
		if _, err := Plan(9, 7, recipe); err == nil {
			t.Fatalf("invalid recipe accepted: %+v", recipe)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Decode(ctx, raw, source); err == nil {
		t.Fatal("cancelled decode continued")
	}
}

func TestImageOperationCropAndInterpolationUseOriginalPixels(t *testing.T) {
	picture, _ := testPicture(t, 31, 23)
	pieces, err := Plan(31, 23, Recipe{Operation: "crop", Crop: &Crop{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.4}})
	if err != nil || pieces[0].X != 3 || pieces[0].Y != 4 || pieces[0].Width != 10 || pieces[0].Height != 10 {
		t.Fatalf("crop=%v %v", pieces, err)
	}
	for _, algorithm := range []string{"nearest", "bilinear", "high"} {
		pieces, err := Plan(31, 23, Recipe{Operation: "resize", Resize: &Resize{TargetLongEdge: 62, Algorithm: algorithm}})
		if err != nil {
			t.Fatal(err)
		}
		data, err := RenderPNG(context.Background(), picture, pieces[0], algorithm)
		if err != nil {
			t.Fatal(err)
		}
		result, err := png.Decode(bytes.NewReader(data))
		if err != nil || result.Bounds().Dx() != 62 || result.Bounds().Dy() != 46 {
			t.Fatalf("resize %s failed", algorithm)
		}
	}
}
