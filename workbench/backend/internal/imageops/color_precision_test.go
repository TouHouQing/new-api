package imageops

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"testing"
)

func fixtureProfile(t *testing.T, gray bool) []byte {
	t.Helper()
	name := "testdata/srgb.icc"
	if gray {
		name = "testdata/gray-gamma22.icc"
	}
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateICC(data, gray); err != nil {
		t.Fatal(err)
	}
	return data
}

func pngWithProfile(t *testing.T, picture image.Image, gray bool) []byte {
	t.Helper()
	metadata, err := profileMetadata(fixtureProfile(t, gray), gray)
	if err != nil {
		t.Fatal(err)
	}
	var buffer bytes.Buffer
	if err := encodePrecisionPNG(context.Background(), &buffer, picture, gray); err != nil {
		t.Fatal(err)
	}
	data, err := appendColorMetadata(buffer.Bytes(), metadata)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func readICC(t *testing.T, data []byte) []byte {
	t.Helper()
	metadata, err := pngColorMetadata(data)
	if err != nil {
		t.Fatal(err)
	}
	for _, chunk := range metadata.chunks {
		if chunk.kind != "iCCP" {
			continue
		}
		index := bytes.IndexByte(chunk.body, 0)
		reader, err := zlib.NewReader(bytes.NewReader(chunk.body[index+2:]))
		if err != nil {
			t.Fatal(err)
		}
		profile, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			t.Fatal(err)
		}
		return profile
	}
	t.Fatal("ICC profile was discarded")
	return nil
}

func renderFixture(t *testing.T, raw []byte, recipe Recipe) ([]byte, Source) {
	t.Helper()
	source, err := Inspect(raw)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(context.Background(), raw, source)
	if err != nil {
		t.Fatal(err)
	}
	pieces, err := Plan(source.Width, source.Height, recipe)
	if err != nil {
		t.Fatal(err)
	}
	algorithm := "nearest"
	if recipe.Resize != nil {
		algorithm = recipe.Resize.Algorithm
	}
	data, err := RenderPNG(context.Background(), decoded, pieces[0], algorithm)
	if err != nil {
		t.Fatal(err)
	}
	return data, source
}

func TestImageOperation16BitAllOrientationsPreserveUnassociatedPixelsAndICC(t *testing.T) {
	picture := image.NewNRGBA64(image.Rect(0, 0, 11, 7))
	alpha := []uint16{0, 1, 2, 17, 255, 256, 32767, 65535}
	for y := 0; y < 7; y++ {
		for x := 0; x < 11; x++ {
			picture.SetNRGBA64(x, y, color.NRGBA64{uint16(13 + x*1111 + y), uint16(257 + y*333 + x), uint16(65431 - x*53 - y*117), alpha[(x+y)%len(alpha)]})
		}
	}
	raw := pngWithProfile(t, picture, false)
	for orientation := 1; orientation <= 8; orientation++ {
		tiff := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, byte(orientation), 0, 0, 0, 0, 0, 0, 0}
		sourceRaw := withPNGMetadata(raw, "eXIf", tiff)
		source, err := Inspect(sourceRaw)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := Decode(context.Background(), sourceRaw, source)
		if err != nil {
			t.Fatal(err)
		}
		pieces, err := Plan(source.Width, source.Height, Recipe{Operation: "split", Split: &Split{Rows: 2, Columns: 3}})
		if err != nil {
			t.Fatal(err)
		}
		for _, piece := range pieces {
			data, err := RenderPNG(context.Background(), decoded, piece, "nearest")
			if err != nil {
				t.Fatal(err)
			}
			if data[24] != 16 || !bytes.Equal(readICC(t, data), fixtureProfile(t, false)) || bytes.Contains(data, []byte("eXIf")) {
				t.Fatal("precision, profile or orientation normalization failed")
			}
			output, err := png.Decode(bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			for y := 0; y < piece.Height; y++ {
				for x := 0; x < piece.Width; x++ {
					px, py := x+piece.X, y+piece.Y
					sx, sy := px, py
					switch orientation {
					case 2:
						sx = 10 - px
					case 3:
						sx, sy = 10-px, 6-py
					case 4:
						sy = 6 - py
					case 5:
						sx, sy = py, px
					case 6:
						sx, sy = py, 6-px
					case 7:
						sx, sy = 10-py, 6-px
					case 8:
						sx, sy = 10-py, px
					}
					got := color.NRGBA64Model.Convert(output.At(x, y)).(color.NRGBA64)
					if got != picture.NRGBA64At(sx, sy) {
						t.Fatalf("orientation=%d pixel=%d,%d: %v != %v", orientation, px, py, got, picture.NRGBA64At(sx, sy))
					}
				}
			}
		}
	}
}

func TestImageOperation16BitNearestAndInterpolationRetainDepth(t *testing.T) {
	picture := image.NewNRGBA64(image.Rect(0, 0, 9, 7))
	for y := 0; y < 7; y++ {
		for x := 0; x < 9; x++ {
			picture.SetNRGBA64(x, y, color.NRGBA64{uint16(x*4021 + 17), uint16(y*5555 + 3), uint16(19571 + x*997), uint16(x + y)})
		}
	}
	raw := pngWithProfile(t, picture, false)
	for _, size := range []int{4, 27} {
		for _, algorithm := range []string{"nearest", "bilinear", "high"} {
			data, _ := renderFixture(t, raw, Recipe{Operation: "resize", Resize: &Resize{TargetLongEdge: size, Algorithm: algorithm}})
			if data[24] != 16 || !bytes.Equal(readICC(t, data), fixtureProfile(t, false)) {
				t.Fatalf("%s lost 16-bit/profile", algorithm)
			}
			output, err := png.Decode(bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			if algorithm == "nearest" {
				for y := 0; y < output.Bounds().Dy(); y++ {
					for x := 0; x < output.Bounds().Dx(); x++ {
						sx, sy := (2*x+1)*9/(2*output.Bounds().Dx()), (2*y+1)*7/(2*output.Bounds().Dy())
						got := color.NRGBA64Model.Convert(output.At(x, y)).(color.NRGBA64)
						if got != picture.NRGBA64At(sx, sy) {
							t.Fatal("nearest changed unassociated 16-bit sample")
						}
					}
				}
			}
		}
	}
}

func TestImageOperationGrayAlphaKeepsGrayICCAnd16BitSamples(t *testing.T) {
	for _, depth := range []int{8, 16} {
		var picture drawImageForTest
		if depth == 16 {
			picture = image.NewNRGBA64(image.Rect(0, 0, 9, 7))
		} else {
			picture = image.NewNRGBA(image.Rect(0, 0, 9, 7))
		}
		for y := 0; y < 7; y++ {
			for x := 0; x < 9; x++ {
				value := uint16(17 + x*3613 + y*113)
				picture.Set(x, y, color.NRGBA64{value, value, value, uint16(1 + x*17 + y*259)})
			}
		}
		raw := pngWithProfile(t, picture, true)
		data, _ := renderFixture(t, raw, Recipe{Operation: "crop", Crop: &Crop{X: 0.25, Y: 0.25, Width: 0.5, Height: 0.5}})
		if int(data[24]) != depth || data[25] != 4 || !bytes.Equal(readICC(t, data), fixtureProfile(t, true)) {
			t.Fatal("gray+alpha must retain matching grayscale profile and samples")
		}
		result, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		for y := 0; y < result.Bounds().Dy(); y++ {
			for x := 0; x < result.Bounds().Dx(); x++ {
				got := unassociated64(result.At(x, y))
				want := unassociated64(picture.At(x+2, y+1))
				if got != want {
					t.Fatalf("gray crop changed sample: %v != %v", got, want)
				}
			}
		}
	}
}

type drawImageForTest interface {
	image.Image
	Set(int, int, color.Color)
}

func TestImageOperationPreservesPNGColorDescriptionsAndRejectsInvalidProfiles(t *testing.T) {
	picture, raw := testPicture(t, 9, 7)
	for _, chunk := range []pngColorChunk{{"gAMA", []byte{0, 0, 177, 143}}, {"cHRM", make([]byte, 32)}, {"sRGB", []byte{0}}, {"cICP", []byte{1, 13, 0, 1}}, {"mDCV", make([]byte, 24)}, {"cLLI", make([]byte, 8)}} {
		original := withPNGMetadata(raw, chunk.kind, chunk.body)
		output, _ := renderFixture(t, original, Recipe{Operation: "crop", Crop: &Crop{Width: 1, Height: 1}})
		metadata, err := pngColorMetadata(output)
		if err != nil || len(metadata.chunks) != 1 || metadata.chunks[0].kind != chunk.kind || !bytes.Equal(metadata.chunks[0].body, chunk.body) {
			t.Fatalf("color description %s changed: %v", chunk.kind, err)
		}
	}
	profiled := pngWithProfile(t, picture, false)
	grayProfile, err := profileMetadata(fixtureProfile(t, true), true)
	if err != nil {
		t.Fatal(err)
	}
	badCRC := bytes.Clone(profiled)
	badCRC[45] ^= 1
	invalids := [][]byte{
		badCRC,
		withPNGMetadata(raw, "iCCP", []byte("broken")),
		withPNGMetadata(raw, "iCCP", grayProfile.chunks[0].body),
		withPNGMetadata(profiled, "sRGB", []byte{0}),
		withPNGMetadata(withPNGMetadata(raw, "gAMA", []byte{0, 0, 177, 143}), "gAMA", []byte{0, 0, 177, 143}),
		withPNGMetadata(raw, "sRGB", []byte{4}),
		withPNGMetadata(raw, "gAMA", []byte{0, 0, 0, 0}),
	}
	var bomb bytes.Buffer
	writer := zlib.NewWriter(&bomb)
	writer.Write(make([]byte, maxColorProfileBytes+1))
	writer.Close()
	invalids = append(invalids, withPNGMetadata(raw, "iCCP", append([]byte("large\x00\x00"), bomb.Bytes()...)))
	for index, data := range invalids {
		if _, err := Inspect(data); err == nil {
			t.Fatalf("unsafe or ambiguous color metadata %d accepted", index)
		}
	}
}

func TestImageOperationJPEGFragmentedICCToPNG(t *testing.T) {
	picture, _ := testPicture(t, 9, 7)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, picture, nil); err != nil {
		t.Fatal(err)
	}
	profile := fixtureProfile(t, false)
	var data bytes.Buffer
	data.Write(encoded.Bytes()[:2])
	// APP2 fragments may arrive in a different order; sequence numbers govern.
	for _, sequence := range []int{2, 1} {
		part := profile[(sequence-1)*(len(profile)/2) : sequence*(len(profile)/2)]
		body := append([]byte("ICC_PROFILE\x00"), byte(sequence), 2)
		body = append(body, part...)
		data.Write([]byte{0xff, 0xe2, byte((len(body) + 2) >> 8), byte(len(body) + 2)})
		data.Write(body)
	}
	data.Write(encoded.Bytes()[2:])
	output, _ := renderFixture(t, data.Bytes(), Recipe{Operation: "crop", Crop: &Crop{Width: 1, Height: 1}})
	if !bytes.Equal(readICC(t, output), profile) {
		t.Fatal("JPEG ICC did not survive PNG derivation")
	}
	incomplete := data.Bytes()
	firstLength := int(binary.BigEndian.Uint16(incomplete[4:6])) + 2
	incomplete = append(append([]byte{}, incomplete[:2]...), incomplete[2+firstLength:]...)
	if _, err := Inspect(incomplete); err == nil {
		t.Fatal("incomplete JPEG profile accepted")
	}
}

func TestImageOperationWebPICCToPNGAndContainerBoundary(t *testing.T) {
	raw, err := os.ReadFile("testdata/profiled.webp")
	if err != nil {
		t.Fatal(err)
	}
	output, _ := renderFixture(t, raw, Recipe{Operation: "crop", Crop: &Crop{Width: 1, Height: 1}})
	if !bytes.Equal(readICC(t, output), fixtureProfile(t, false)) {
		t.Fatal("WebP ICC lost")
	}
	trailing := append(bytes.Clone(raw), []byte("trailing ICCP")...)
	if _, err := Inspect(trailing); err == nil {
		t.Fatal("trailing data outside RIFF accepted as metadata")
	}
	missingFlag := bytes.Clone(raw)
	missingFlag[20] &^= 0x20
	if _, err := Inspect(missingFlag); err == nil {
		t.Fatal("WebP ICC without declared profile accepted")
	}
}

func TestImageOperationOpaqueGray16RetainsSamplesAndGrayProfile(t *testing.T) {
	picture := image.NewGray16(image.Rect(0, 0, 9, 7))
	for y := 0; y < 7; y++ {
		for x := 0; x < 9; x++ {
			picture.SetGray16(x, y, color.Gray16{Y: uint16(17 + x*777 + y*113)})
		}
	}
	raw := pngWithProfile(t, picture, true)
	data, _ := renderFixture(t, raw, Recipe{Operation: "crop", Crop: &Crop{Width: 1, Height: 1}})
	if data[24] != 16 || data[25] != 0 || !bytes.Equal(readICC(t, data), fixtureProfile(t, true)) {
		t.Fatal("opaque grayscale precision/profile changed")
	}
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 7; y++ {
		for x := 0; x < 9; x++ {
			if decoded.At(x, y) != picture.At(x, y) {
				t.Fatal("opaque 16-bit gray sample changed")
			}
		}
	}
}

func TestImageOperationWorkingSetIsBoundedForLargestHighPrecisionRecipe(t *testing.T) {
	pieces, err := Plan(4096, 4096, Recipe{Operation: "resize", Resize: &Resize{TargetLongEdge: 4096, Algorithm: "high"}})
	if err != nil {
		t.Fatal(err)
	}
	weight := WorkingSetBytes(Source{Width: 4096, Height: 4096}, pieces, "high")
	if weight < 1<<30 || weight > 1536<<20 {
		t.Fatalf("unexpected worst-case memory accounting: %d", weight)
	}
}
