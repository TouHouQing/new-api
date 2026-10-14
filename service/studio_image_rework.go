package service

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"os"

	"github.com/QuantumNous/new-api/common"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

type studioImageRegion struct {
	SourceMediaID       string `json:"sourceMediaId"`
	X, Y, Width, Height int
}

func readStudioImageRegion(ownerID int, data map[string]any) (*studioImageRegion, image.Image, error) {
	raw, err := common.Marshal(data["reworkRegion"])
	if err != nil {
		return nil, nil, err
	}
	var region studioImageRegion
	if err := common.Unmarshal(raw, &region); err != nil {
		return nil, nil, err
	}
	if !StudioIDPattern.MatchString(region.SourceMediaID) || region.X < 0 || region.Y < 0 || region.Width < 2 || region.Height < 2 || region.Width > 4096 || region.Height > 4096 {
		return nil, nil, errors.New("invalid rework region")
	}
	media, err := GetStudioMedia(ownerID, region.SourceMediaID)
	if err != nil {
		return nil, nil, err
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return nil, nil, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()
	config, _, err := image.DecodeConfig(file)
	if err != nil || config.Width > 8192 || config.Height > 8192 || config.Width*config.Height > 32000000 {
		return nil, nil, errors.New("source image dimensions exceed region editing limits")
	}
	if _, err := file.Seek(0, 0); err != nil {
		return nil, nil, err
	}
	source, _, err := image.Decode(file)
	if err != nil {
		return nil, nil, err
	}
	rectangle := image.Rect(region.X, region.Y, region.X+region.Width, region.Y+region.Height)
	if !rectangle.In(source.Bounds()) {
		return nil, nil, errors.New("rework region lies outside the source image")
	}
	return &region, source, nil
}

func studioImageRegionReference(ownerID int, document, data map[string]any) (string, error) {
	region, source, err := readStudioImageRegion(ownerID, data)
	if err != nil {
		return "", err
	}
	if !StudioMediaReferences(document)[region.SourceMediaID] {
		return "", errors.New("region source must belong to the project")
	}
	cropped := image.NewRGBA(image.Rect(0, 0, region.Width, region.Height))
	draw.Draw(cropped, cropped.Bounds(), source, image.Pt(region.X, region.Y), draw.Src)
	var output bytes.Buffer
	if err := png.Encode(&output, cropped); err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(output.Bytes()), nil
}

func studioComposeImageRegion(ownerID int, data map[string]any, generated []byte) ([]byte, string, error) {
	region, source, err := readStudioImageRegion(ownerID, data)
	if err != nil {
		return nil, "", err
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(generated))
	if err != nil || config.Width > 8192 || config.Height > 8192 || config.Width*config.Height > 32000000 {
		return nil, "", errors.New("generated patch image is invalid")
	}
	patch, _, err := image.Decode(bytes.NewReader(generated))
	if err != nil {
		return nil, "", err
	}
	var destination draw.Image = image.NewRGBA(source.Bounds())
	highPrecision := false
	switch source.(type) {
	case *image.RGBA64:
		destination, highPrecision = image.NewRGBA64(source.Bounds()), true
	case *image.NRGBA64, *image.Gray16, *image.Alpha16:
		destination, highPrecision = image.NewNRGBA64(source.Bounds()), true
	}
	draw.Draw(destination, source.Bounds(), source, source.Bounds().Min, draw.Src)
	var scaled draw.Image = image.NewRGBA(image.Rect(0, 0, region.Width, region.Height))
	if highPrecision {
		scaled = image.NewNRGBA64(scaled.Bounds())
	}
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), patch, patch.Bounds(), draw.Src, nil)
	// Feather inward only. Keeping the outermost selected pixel unchanged
	// removes the paste seam without modifying anything outside the selection.
	feather := min(32, min(region.Width, region.Height)/10)
	if min(region.Width, region.Height) < 16 {
		feather = 0 // Tiny selections need their edited pixels intact.
	}
	for y := 0; y < region.Height; y++ {
		for x := 0; x < region.Width; x++ {
			weight := 1.0
			if feather > 0 {
				distance := feather
				if region.X > source.Bounds().Min.X {
					distance = min(distance, x)
				}
				if region.Y > source.Bounds().Min.Y {
					distance = min(distance, y)
				}
				if region.X+region.Width < source.Bounds().Max.X {
					distance = min(distance, region.Width-1-x)
				}
				if region.Y+region.Height < source.Bounds().Max.Y {
					distance = min(distance, region.Height-1-y)
				}
				t := float64(distance) / float64(feather)
				weight = t * t * (3 - 2*t)
			}
			if highPrecision {
				original := color.NRGBA64Model.Convert(source.At(region.X+x, region.Y+y)).(color.NRGBA64)
				generated := color.NRGBA64Model.Convert(scaled.At(x, y)).(color.NRGBA64)
				alpha := weight * float64(generated.A) / 65535
				if alpha == 0 {
					continue
				}
				blend := func(a, b uint16) uint16 { return uint16(float64(a)*(1-alpha) + float64(b)*alpha + 0.5) }
				destination.Set(region.X+x, region.Y+y, color.NRGBA64{R: blend(original.R, generated.R), G: blend(original.G, generated.G), B: blend(original.B, generated.B), A: original.A})
				continue
			}
			original := color.NRGBAModel.Convert(source.At(region.X+x, region.Y+y)).(color.NRGBA)
			generated := color.NRGBAModel.Convert(scaled.At(x, y)).(color.NRGBA)
			alpha := weight * float64(generated.A) / 255
			if alpha == 0 {
				continue
			}
			blend := func(a, b uint8) uint8 { return uint8(float64(a)*(1-alpha) + float64(b)*alpha + 0.5) }
			destination.Set(region.X+x, region.Y+y, color.NRGBA{R: blend(original.R, generated.R), G: blend(original.G, generated.G), B: blend(original.B, generated.B), A: original.A})
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, destination); err != nil {
		return nil, "", err
	}
	return output.Bytes(), "image/png", nil
}
