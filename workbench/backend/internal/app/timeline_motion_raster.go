// SPDX-License-Identifier: AGPL-3.0-or-later
// Icon geometry and animation formulas adapted from New API's studio motion
// runtime, Copyright (C) 2023-2026 QuantumNous.
package app

import (
	"fmt"
	"image"
	"image/draw"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
	"golang.org/x/image/vector"
	"yingce/backend/internal/production"
)

type motionRasterLayer struct {
	file          string
	width, height int
	clip          renderClip
}

func readMotionFont(family string) ([]byte, error) {
	if family != "serif" {
		return readRenderFont()
	}
	paths := []string{strings.TrimSpace(os.Getenv("CANVAS_GRAPHICS_SERIF_FONT")), "/usr/share/fonts/noto/NotoSerifCJK-Regular.ttc", "/usr/share/fonts/noto-cjk/NotoSerifCJK-Regular.ttc", "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"}
	if runtime.GOOS == "windows" {
		paths = append(paths, filepath.Join(os.Getenv("WINDIR"), "Fonts", "simsun.ttc"))
	}
	for _, name := range paths {
		if name != "" {
			if data, err := os.ReadFile(name); err == nil && len(data) > 0 {
				return data, nil
			}
		}
	}
	return nil, fmt.Errorf("缺少衬线字体，请配置 CANVAS_GRAPHICS_SERIF_FONT，或选择黑体")
}

func motionIcon(graphic production.MotionGraphic) *image.NRGBA {
	size := graphic.Size
	picture := image.NewNRGBA(image.Rect(0, 0, size, size))
	r := vector.NewRasterizer(size, size)
	scale := float32(size) / 24
	move := func(x, y float32) { r.MoveTo(x*scale, y*scale) }
	line := func(x, y float32) { r.LineTo(x*scale, y*scale) }
	curve := func(x1, y1, x2, y2, x3, y3 float32) {
		r.CubeTo(x1*scale, y1*scale, x2*scale, y2*scale, x3*scale, y3*scale)
	}
	switch graphic.Icon {
	case "play":
		move(5, 2)
		line(22, 12)
		line(5, 22)
	case "heart":
		move(12, 22)
		curve(-10, 8, 1, -5, 12, 5)
		curve(23, -5, 34, 8, 12, 22)
	case "check":
		move(1, 12)
		line(9, 20)
		line(23, 3)
		line(20, 1)
		line(9, 15)
		line(4, 9)
	case "arrow":
		move(1, 9)
		line(15, 9)
		line(10, 4)
		line(13, 1)
		line(24, 12)
		line(13, 23)
		line(10, 20)
		line(15, 15)
		line(1, 15)
	default:
		move(12, 1)
		line(15, 9)
		line(23, 12)
		line(15, 15)
		line(12, 23)
		line(9, 15)
		line(1, 12)
		line(9, 9)
	}
	r.ClosePath()
	r.Draw(picture, picture.Bounds(), image.NewUniform(captionRGBA(graphic.Color)), image.Point{})
	return picture
}

func motionRaster(clip renderClip, readFont func(string) ([]byte, error), readImage func(string) (image.Image, error)) (*image.NRGBA, error) {
	g := clip.Graphic
	if g == nil {
		return nil, fmt.Errorf("叠层缺少完整设置")
	}
	if err := production.ValidateMotionGraphic(*g); err != nil {
		return nil, err
	}
	if g.Kind == "icon" {
		return motionIcon(*g), nil
	}
	if g.Kind == "shape" {
		picture := image.NewNRGBA(image.Rect(0, 0, g.Size, g.Size))
		radius := 0.0
		if g.Shape == "circle" && g.Animation != "morph" {
			radius = float64(g.Size) / 2
		}
		roundedCaptionBackground(picture, captionRGBA(g.Color), radius)
		return picture, nil
	}
	if g.Kind == "image" {
		source, err := readImage(g.ResourceID)
		if err != nil {
			return nil, err
		}
		if source == nil || source.Bounds().Empty() {
			return nil, fmt.Errorf("图片叠层无法读取")
		}
		picture := image.NewNRGBA(image.Rect(0, 0, g.Size, g.Size))
		scale := math.Min(float64(g.Size)/float64(source.Bounds().Dx()), float64(g.Size)/float64(source.Bounds().Dy()))
		w, h := max(1, int(math.Round(float64(source.Bounds().Dx())*scale))), max(1, int(math.Round(float64(source.Bounds().Dy())*scale)))
		box := image.Rect((g.Size-w)/2, (g.Size-h)/2, (g.Size-w)/2+w, (g.Size-h)/2+h)
		xdraw.CatmullRom.Scale(picture, box, source, source.Bounds(), draw.Src, nil)
		return picture, nil
	}
	data, err := readFont(g.FontFamily)
	if err != nil {
		return nil, err
	}
	collection, err := opentype.ParseCollection(data)
	if err != nil {
		return nil, fmt.Errorf("标题字体无法读取")
	}
	parsed, err := collection.Font(0)
	if err != nil {
		return nil, err
	}
	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{Size: float64(g.Size), DPI: 72, Hinting: font.HintingNone})
	if err != nil {
		return nil, err
	}
	defer face.Close()
	lines := strings.Split(clip.Text, "\n")
	metrics := face.Metrics()
	ascent, descent := float64(metrics.Ascent)/64, float64(metrics.Descent)/64
	lineHeight := math.Max(float64(g.Size)*1.2, ascent+descent)
	width := 0.0
	for _, text := range lines {
		width = math.Max(width, captionMeasure(face, text))
	}
	w, h := max(1, int(math.Ceil(width))+4), max(1, int(math.Ceil(float64(len(lines))*lineHeight))+4)
	if w > 16384 || h > 16384 || int64(w)*int64(h) > 16_000_000 {
		return nil, fmt.Errorf("标题像素面积过大，请换行或缩小字号，原文仍保留")
	}
	picture := image.NewNRGBA(image.Rect(0, 0, w, h))
	drawer := font.Drawer{Dst: picture, Src: image.NewUniform(captionRGBA(g.Color)), Face: face}
	for i, text := range lines {
		x := (float64(w) - captionMeasure(face, text)) / 2
		y := 2 + float64(i)*lineHeight + (lineHeight-ascent-descent)/2 + ascent
		drawer.Dot = fixed.Point26_6{X: fixed.Int26_6(math.Round(x * 64)), Y: fixed.Int26_6(math.Round(y * 64))}
		drawer.DrawString(text)
	}
	return picture, nil
}

func buildMotionLayers(clips []renderClip, readFont func(string) ([]byte, error), readImage func(string) (image.Image, error), writeImage func(string, *image.NRGBA) error) ([]motionRasterLayer, error) {
	if len(clips) > 128 {
		return nil, fmt.Errorf("单次叠层最多128个，请分段制作")
	}
	layers := make([]motionRasterLayer, 0, len(clips))
	fonts := map[string][]byte{}
	cachedFont := func(name string) ([]byte, error) {
		if data, ok := fonts[name]; ok {
			return data, nil
		}
		data, err := readFont(name)
		if err == nil {
			fonts[name] = data
		}
		return data, err
	}
	var pixels int64
	for index, clip := range clips {
		picture, err := motionRaster(clip, cachedFont, readImage)
		if err != nil {
			return nil, fmt.Errorf("叠层%d：%w", index+1, err)
		}
		pixels += int64(picture.Bounds().Dx()) * int64(picture.Bounds().Dy())
		if pixels > 48_000_000 {
			return nil, fmt.Errorf("叠层渲染面积过大，请分段导出")
		}
		name := fmt.Sprintf("graphic-%d.png", index)
		if err := writeImage(name, picture); err != nil {
			return nil, err
		}
		layers = append(layers, motionRasterLayer{file: name, width: picture.Bounds().Dx(), height: picture.Bounds().Dy(), clip: clip})
	}
	return layers, nil
}

func motionLayerFilters(layers []motionRasterLayer, output timelineRenderFormat, previous string) []string {
	filters := []string{}
	for index, layer := range layers {
		g := layer.clip.Graphic
		time := fmt.Sprintf("(t-%s+%s)", renderSeconds(layer.clip.StartMs), renderSeconds(layer.clip.SourceStartMs+g.PhaseOffsetMs))
		pixelTime := strings.ReplaceAll(time, "t-", "T-")
		beat := fmt.Sprintf("(2*PI*%d/60*%s)", g.BPM, pixelTime)
		alpha := fmt.Sprintf("max(0,min(1,min(%s/0.4,(%s-%s)/0.4)))", pixelTime, renderSeconds(g.PhaseDurationMs), pixelTime)
		if g.Animation == "none" {
			alpha = "1"
		}
		if g.Animation == "pulse" {
			alpha = "(0.6+0.4*sin(" + beat + "))"
		}
		if g.Animation == "morph" {
			r := fmt.Sprintf("(%d/4*(1+sin(%s)))", g.Size, beat)
			coverage := fmt.Sprintf("if(lt(%s,0.5),1,clip(%s+0.5-hypot(X+0.5-clip(X+0.5,%s,W-%s),Y+0.5-clip(Y+0.5,%s,H-%s)),0,1))", r, r, r, r, r, r)
			alpha = "(" + alpha + ")*(" + coverage + ")"
		}
		source := fmt.Sprintf("movie=%s,loop=loop=-1:size=1:start=0,settb=expr=1/%d,setpts=N,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(%s)'", layer.file, output.FPS, alpha)
		if g.Animation == "pulse" {
			scale := fmt.Sprintf("(0.85+0.15*sin(2*PI*%d/60*%s))", g.BPM, time)
			source += fmt.Sprintf(",scale=w='max(1,round(iw*%s))':h='max(1,round(ih*%s))':eval=frame", scale, scale)
		}
		if g.Animation == "rotate" {
			source += fmt.Sprintf(",rotate=a='%s*%d*PI/30':ow='ceil(hypot(iw,ih))':oh='ceil(hypot(iw,ih))':c=black@0", time, g.BPM)
		}
		input := fmt.Sprintf("motion%d", index)
		filters = append(filters, source+"["+input+"]")
		x := fmt.Sprintf("%.10f-overlay_w/2", g.X*float64(output.Width))
		y := fmt.Sprintf("%.10f-overlay_h/2", g.Y*float64(output.Height))
		if g.Animation == "slide" {
			x += fmt.Sprintf("-%d*(1-min(1,%s/0.6))", output.Width, time)
		}
		if g.Animation == "bounce" {
			y += fmt.Sprintf("-%d*0.08*abs(sin(2*PI*%d/60*%s))", output.Height, g.BPM, time)
		}
		next := fmt.Sprintf("motionvideo%d", index)
		filters = append(filters, fmt.Sprintf("[%s][%s]overlay=x='%s':y='%s':format=auto:eof_action=repeat:repeatlast=1:enable='gte(t,%s)*lt(t,%s)'[%s]", previous, input, x, y, renderSeconds(layer.clip.StartMs), renderSeconds(layer.clip.StartMs+layer.clip.DurationMs), next))
		previous = next
	}
	return filters
}
