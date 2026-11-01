package app

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
	"yingce/backend/internal/production"
)

type captionRasterLayer struct {
	clipID              string
	file                string
	x, y, width, height int
	start, end          int64
	animation           string
}
type captionRasterLine struct {
	text       string
	start, end int
	width      float64
}
type captionRaster struct {
	clip                renderClip
	base                *image.NRGBA
	highlights          []captionRasterLayer
	width, height, lane int
	position            string
	margin              int
}

func captionRGBA(hex string) color.NRGBA {
	raw, _ := strconv.ParseUint(strings.TrimPrefix(hex, "#"), 16, 32)
	if len(hex) == 7 {
		return color.NRGBA{R: uint8(raw >> 16), G: uint8(raw >> 8), B: uint8(raw), A: 255}
	}
	return color.NRGBA{R: uint8(raw >> 24), G: uint8(raw >> 16), B: uint8(raw >> 8), A: uint8(raw)}
}

func captionUTF16Slice(text string, start, end int) string {
	return string(utf16.Decode(utf16.Encode([]rune(text))[start:end]))
}
func captionMeasure(face font.Face, text string) float64 {
	return float64(font.MeasureString(face, text)) / 64
}

func captionLines(text string, face font.Face, maxWidth, scale float64, highlights []production.CaptionHighlight) ([]captionRasterLine, error) {
	var lines []captionRasterLine
	current := ""
	from, offset := 0, 0
	width := func(value string, start, end int) float64 {
		w := captionMeasure(face, value)
		for _, h := range highlights {
			if h.Start < end && h.End > start {
				w += 2 * h.PaddingX * scale
			}
		}
		return w
	}
	appendLine := func() {
		lines = append(lines, captionRasterLine{text: current, start: from, end: offset, width: width(current, from, offset)})
		current = ""
		from = offset
	}
	skipLF := false
	for _, r := range text {
		if skipLF {
			skipLF = false
			if r == '\n' {
				offset++
				from = offset
				continue
			}
		}
		units := 1
		if r > 0xffff {
			units = 2
		}
		if r == '\r' {
			appendLine()
			offset++
			from = offset
			skipLF = true
			continue
		}
		if r == '\n' {
			appendLine()
			offset += units
			from = offset
			continue
		}
		if current != "" && width(current+string(r), from, offset+units) > maxWidth {
			appendLine()
		}
		current += string(r)
		offset += units
		if width(current, from, offset) > maxWidth {
			return nil, fmt.Errorf("字幕字号或重点间距过大，请缩小后导出")
		}
		if len(lines) > 2 {
			return nil, fmt.Errorf("单条字幕超过三行，请拆分字幕后导出")
		}
	}
	appendLine()
	if len(lines) > 3 {
		return nil, fmt.Errorf("单条字幕超过三行，请拆分字幕后导出")
	}
	return lines, nil
}

func paintCaptionText(canvas *image.NRGBA, face font.Face, text string, x, y float64, ink color.NRGBA) {
	// A small shadow keeps transparent legacy styles readable without changing
	// their foreground color. Text is rasterized directly, never parsed as ASS.
	d := font.Drawer{Dst: canvas, Src: image.NewUniform(color.NRGBA{A: 190}), Face: face, Dot: fixed.Point26_6{X: fixed.Int26_6(math.Round((x + 1) * 64)), Y: fixed.Int26_6(math.Round((y + 1) * 64))}}
	d.DrawString(text)
	d.Src = image.NewUniform(ink)
	d.Dot = fixed.Point26_6{X: fixed.Int26_6(math.Round(x * 64)), Y: fixed.Int26_6(math.Round(y * 64))}
	d.DrawString(text)
}

func roundedCaptionBackground(canvas *image.NRGBA, ink color.NRGBA, radius float64) {
	radius = math.Min(radius, float64(min(canvas.Rect.Dx(), canvas.Rect.Dy()))/2)
	if radius < .5 {
		draw.Draw(canvas, canvas.Bounds(), image.NewUniform(ink), image.Point{}, draw.Src)
		return
	}
	w, h := float64(canvas.Rect.Dx()), float64(canvas.Rect.Dy())
	for y := 0; y < canvas.Rect.Dy(); y++ {
		for x := 0; x < canvas.Rect.Dx(); x++ {
			px, py := float64(x)+.5, float64(y)+.5
			cx, cy := math.Max(radius, math.Min(w-radius, px)), math.Max(radius, math.Min(h-radius, py))
			distance := math.Hypot(px-cx, py-cy)
			coverage := math.Max(0, math.Min(1, radius+.5-distance))
			value := ink
			value.A = uint8(math.Round(float64(ink.A) * coverage))
			canvas.SetNRGBA(x, y, value)
		}
	}
}

func writeCaptionPNG(directory, name string, canvas *image.NRGBA) error {
	file, err := os.OpenFile(filepath.Join(directory, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	err = png.Encode(file, canvas)
	closeErr := file.Close()
	if err != nil {
		return err
	}
	return closeErr
}

func rasterizeCaption(clip renderClip, index int, face font.Face, output timelineRenderFormat, writeImage func(string, *image.NRGBA) error, budget *int64) (captionRaster, error) {
	style := clip.Presentation
	if style.Version == 0 {
		style = production.DefaultCaptionPresentation()
		if clip.Kind == "text" {
			style.Position = "center"
		}
	}
	scale := float64(min(output.Width, output.Height)) / 1080
	padding := style.Padding * scale
	edge := math.Ceil(math.Max(padding, 2*scale))
	highlightPaddingY := 0.0
	for _, h := range style.Highlights {
		edge = math.Max(edge, math.Ceil(h.PaddingY*scale+2*scale))
		highlightPaddingY = math.Max(highlightPaddingY, h.PaddingY*scale)
	}
	lines, err := captionLines(clip.Text, face, float64(output.Width)*.9-2*edge, scale, style.Highlights)
	if err != nil {
		return captionRaster{}, err
	}
	metrics := face.Metrics()
	ascent, descent := float64(metrics.Ascent)/64, float64(metrics.Descent)/64
	lineHeight := math.Max(style.FontSize*scale*1.2, ascent+descent+2*highlightPaddingY)
	maxWidth := 0.0
	for _, line := range lines {
		maxWidth = math.Max(maxWidth, line.width)
	}
	w, h := int(math.Ceil(maxWidth+2*edge)), int(math.Ceil(float64(len(lines))*lineHeight+2*edge))
	if w < 1 || h < 1 || w > output.Width || h > output.Height {
		return captionRaster{}, fmt.Errorf("字幕超出画幅，请缩小字号或拆分")
	}
	*budget += int64(w) * int64(h)
	if *budget > 48_000_000 {
		return captionRaster{}, fmt.Errorf("字幕渲染内容过多，请分段导出")
	}
	base := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(base, base.Bounds(), image.NewUniform(captionRGBA(style.BackgroundColor)), image.Point{}, draw.Src)
	result := captionRaster{clip: clip, base: base, width: w, height: h, position: style.Position, margin: int(math.Round(64 * scale))}
	if style.MarginPercent != nil {
		result.margin = int(math.Round(float64(output.Height) * (*style.MarginPercent) / 100))
	} else if clip.legacyCaptionStyle {
		if style.Position == "top" {
			result.margin = int(math.Round(float64(output.Height) * .06))
		} else if style.Position == "bottom" {
			result.margin = int(math.Round(float64(output.Height) * .08))
		}
	}
	for li, line := range lines {
		x := edge + (maxWidth-line.width)/2
		y := edge + float64(li)*lineHeight + ascent
		cursor := line.start
		for hi, highlight := range style.Highlights {
			from, to := max(highlight.Start, line.start), min(highlight.End, line.end)
			if from >= to {
				continue
			}
			prefix := captionUTF16Slice(clip.Text, cursor, from)
			paintCaptionText(base, face, prefix, x, y, captionRGBA(style.Color))
			x += captionMeasure(face, prefix)
			padX, padY := highlight.PaddingX*scale, highlight.PaddingY*scale
			selected := captionUTF16Slice(clip.Text, from, to)
			inkWidth := captionMeasure(face, selected)
			paintCaptionText(base, face, selected, x+padX, y, captionRGBA(style.Color))
			hw, hh := int(math.Ceil(inkWidth+2*padX+2)), int(math.Ceil(ascent+descent+2*padY+2))
			*budget += int64(hw) * int64(hh)
			if *budget > 48_000_000 {
				return result, fmt.Errorf("字幕渲染内容过多，请分段导出")
			}
			layer := image.NewNRGBA(image.Rect(0, 0, hw, hh))
			roundedCaptionBackground(layer, captionRGBA(highlight.BackgroundColor), highlight.Radius*scale)
			paintCaptionText(layer, face, selected, padX, padY+ascent, captionRGBA(highlight.Color))
			name := fmt.Sprintf("caption-%d-highlight-%d-line-%d.png", index, hi, li)
			if err := writeImage(name, layer); err != nil {
				return result, err
			}
			result.highlights = append(result.highlights, captionRasterLayer{file: name, x: int(math.Round(x)), y: int(math.Round(y - ascent - padY)), width: hw, height: hh, start: clip.StartMs, end: clip.StartMs + clip.DurationMs, animation: highlight.Animation})
			x += inkWidth + 2*padX
			cursor = to
		}
		paintCaptionText(base, face, captionUTF16Slice(clip.Text, cursor, line.end), x, y, captionRGBA(style.Color))
	}
	return result, nil
}

func materializeCaptionLayers(clips []renderClip, output timelineRenderFormat, directory string) ([]captionRasterLayer, error) {
	data, err := os.ReadFile(filepath.Join(directory, "timeline-font.ttf"))
	if err != nil {
		return nil, err
	}
	assetDirectory, err := os.MkdirTemp(directory, "caption-raster-")
	if err != nil {
		return nil, err
	}
	layers, err := buildCaptionLayers(clips, output, data, func(name string, canvas *image.NRGBA) error { return writeCaptionPNG(assetDirectory, name, canvas) })
	if err != nil {
		return nil, err
	}
	for i := range layers {
		layers[i].file = filepath.ToSlash(filepath.Join(filepath.Base(assetDirectory), layers[i].file))
	}
	return layers, nil
}

func buildCaptionLayers(clips []renderClip, output timelineRenderFormat, data []byte, writeImage func(string, *image.NRGBA) error) ([]captionRasterLayer, error) {
	collection, err := opentype.ParseCollection(data)
	if err != nil {
		return nil, fmt.Errorf("字幕字体无法读取: %w", err)
	}
	parsed, err := collection.Font(0)
	if err != nil {
		return nil, err
	}
	ordered := append([]renderClip(nil), clips...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].StartMs != ordered[j].StartMs {
			return ordered[i].StartMs < ordered[j].StartMs
		}
		return ordered[i].ID < ordered[j].ID
	})
	type lanes struct {
		ends    []int64
		heights []int
	}
	groups := map[string]*lanes{}
	rasters := make([]captionRaster, 0, len(clips))
	var budget int64
	for i, clip := range ordered {
		style := clip.Presentation
		if style.Version == 0 {
			style = production.DefaultCaptionPresentation()
		}
		face, err := opentype.NewFace(parsed, &opentype.FaceOptions{Size: style.FontSize * float64(min(output.Width, output.Height)) / 1080, DPI: 72, Hinting: font.HintingNone})
		if err != nil {
			return nil, err
		}
		raster, err := rasterizeCaption(clip, i, face, output, writeImage, &budget)
		face.Close()
		if err != nil {
			return nil, err
		}
		group := groups[raster.position]
		if group == nil {
			group = &lanes{}
			groups[raster.position] = group
		}
		lane := 0
		for lane < len(group.ends) && group.ends[lane] > clip.StartMs {
			lane++
		}
		if lane >= 4 {
			return nil, fmt.Errorf("同一位置同时显示的字幕超过四条，请整理字幕")
		}
		if lane == len(group.ends) {
			group.ends = append(group.ends, 0)
			group.heights = append(group.heights, 0)
		}
		group.ends[lane] = clip.StartMs + clip.DurationMs
		group.heights[lane] = max(group.heights[lane], raster.height)
		raster.lane = lane
		rasters = append(rasters, raster)
	}
	var result []captionRasterLayer
	for i, raster := range rasters {
		x := (output.Width - raster.width) / 2
		y := raster.margin
		group := groups[raster.position]
		offset := 0
		for lane := 0; lane < raster.lane; lane++ {
			offset += group.heights[lane] + 10
		}
		if raster.position == "bottom" {
			y = output.Height - raster.margin - raster.height - offset
		} else if raster.position == "center" {
			y = (output.Height-raster.height)/2 + offset
		} else {
			y += offset
		}
		if y < 0 || y+raster.height > output.Height {
			return nil, fmt.Errorf("同时显示的字幕超出画幅，请调整位置或拆分")
		}
		name := fmt.Sprintf("caption-%d-base.png", i)
		if err := writeImage(name, raster.base); err != nil {
			return nil, err
		}
		result = append(result, captionRasterLayer{clipID: raster.clip.ID, file: name, x: x, y: y, width: raster.width, height: raster.height, start: raster.clip.StartMs, end: raster.clip.StartMs + raster.clip.DurationMs})
		for _, layer := range raster.highlights {
			layer.clipID = raster.clip.ID
			layer.x += x
			layer.y += y
			result = append(result, layer)
		}
	}
	if len(result) > 512 {
		return nil, fmt.Errorf("字幕重点过多，请分段导出")
	}
	return result, nil
}

func captionLayerFilters(layers []captionRasterLayer, frameRate ...int) []string {
	fps := 30
	if len(frameRate) > 0 {
		fps = frameRate[0]
	}
	filters := make([]string, 0, len(layers)*2)
	for i, layer := range layers {
		input := fmt.Sprintf("caption%d", i)
		source := fmt.Sprintf("movie=%s,format=rgba", layer.file)
		if layer.animation == "pop" || layer.animation == "wipe" {
			source += fmt.Sprintf(",loop=loop=-1:size=1:start=0,settb=expr=1/%d,setpts=N", fps)
			progress := fmt.Sprintf("min(max((t-%s)/0.18,0),1)", renderSeconds(layer.start))
			if layer.animation == "pop" {
				source += fmt.Sprintf(",scale=w='max(1,round(iw*(0.8+0.2*%s)))':h='max(1,round(ih*(0.8+0.2*%s)))':eval=frame", progress, progress)
			} else {
				progress = strings.ReplaceAll(progress, "t-", "T-")
				source += fmt.Sprintf(",geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*lte(X,W*%s)'", progress)
			}
		}
		filters = append(filters, source+"["+input+"]")
		previous := "0:v"
		if i > 0 {
			previous = fmt.Sprintf("captionvideo%d", i-1)
		}
		x, y := strconv.Itoa(layer.x), strconv.Itoa(layer.y)
		if layer.animation == "pop" {
			x = fmt.Sprintf("%d+(%d-overlay_w)/2", layer.x, layer.width)
			y = fmt.Sprintf("%d+(%d-overlay_h)/2", layer.y, layer.height)
		}
		filters = append(filters, fmt.Sprintf("[%s][%s]overlay=x='%s':y='%s':eof_action=repeat:repeatlast=1:enable='gte(t,%s)*lt(t,%s)'[captionvideo%d]", previous, input, x, y, renderSeconds(layer.start), renderSeconds(layer.end), i))
	}
	return filters
}
