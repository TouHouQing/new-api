package service

import (
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"unicode/utf8"
)

type StudioMotionGraphic struct {
	ID           string  `json:"id"`
	Kind         string  `json:"kind,omitempty"`
	Icon         string  `json:"icon,omitempty"`
	Shape        string  `json:"shape,omitempty"`
	ImageMediaID string  `json:"imageMediaId,omitempty"`
	Text         string  `json:"text"`
	Start        float64 `json:"start"`
	End          float64 `json:"end"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	FontSize     int     `json:"font_size"`
	Color        string  `json:"color"`
	Animation    string  `json:"animation"`
	BPM          int     `json:"bpm"`
}

var studioGraphicColor = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func validateStudioMotionGraphics(items []StudioMotionGraphic) error {
	if len(items) > 50 {
		return errors.New("too many motion graphics")
	}
	seen := map[string]bool{}
	for _, item := range items {
		if !StudioIDPattern.MatchString(item.ID) || seen[item.ID] || len(item.Text) == 0 || utf8.RuneCountInString(item.Text) > 2000 || item.Start < 0 || item.End <= item.Start || item.End > 3600 || item.X < 0 || item.X > 1 || item.Y < 0 || item.Y > 1 || item.FontSize < 12 || item.FontSize > 300 || !studioGraphicColor.MatchString(item.Color) || !slices.Contains([]string{"fade", "slide", "pulse", "bounce", "rotate", "morph"}, item.Animation) || item.BPM < 30 || item.BPM > 240 {
			return errors.New("invalid motion graphic configuration")
		}
		if !slices.Contains([]string{"", "text", "icon", "shape", "image"}, item.Kind) || item.Kind == "icon" && !slices.Contains([]string{"spark", "play", "heart", "check", "arrow"}, item.Icon) || item.Kind == "shape" && !slices.Contains([]string{"square", "circle"}, item.Shape) || item.Kind == "image" && !StudioIDPattern.MatchString(item.ImageMediaID) {
			return errors.New("select a valid graphic type, icon, shape or stored image")
		}
		if item.Animation == "morph" && item.Kind != "shape" {
			return errors.New("morph animation requires a shape")
		}
		for _, value := range []float64{item.Start, item.End, item.X, item.Y} {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return errors.New("invalid motion graphic timing or position")
			}
		}
		seen[item.ID] = true
	}
	return nil
}

// Titles are rendered within the conformed clips, so the film, independent
// clip exports and professional editing package share the same visible result.
func studioMotionGraphicFilters(items []StudioMotionGraphic, offset, duration float64, workdir string) (string, error) {
	filters := ""
	for index, item := range items {
		if item.Kind != "" && item.Kind != "text" || item.Animation == "rotate" || item.Animation == "morph" {
			continue
		}
		if item.End <= offset || item.Start >= offset+duration {
			continue
		}
		filename := fmt.Sprintf("graphic-%03d.txt", index)
		if err := os.WriteFile(filepath.Join(workdir, filename), []byte(item.Text), 0600); err != nil {
			return "", err
		}
		time := fmt.Sprintf("(t+%g-%g)", offset, item.Start)
		x, y := fmt.Sprintf("(w-text_w)*%g", item.X), fmt.Sprintf("(h-text_h)*%g", item.Y)
		alpha := fmt.Sprintf("min(1,min(%s/0.4,(%g-t-%g)/0.4))", time, item.End, offset)
		switch item.Animation {
		case "slide":
			x += fmt.Sprintf("-w*(1-min(1,max(0,%s/0.6)))", time)
		case "pulse":
			alpha = fmt.Sprintf("0.6+0.4*sin(2*PI*%d/60*%s)", item.BPM, time)
		case "bounce":
			y += fmt.Sprintf("-h*0.08*abs(sin(2*PI*%d/60*%s))", item.BPM, time)
		}
		filters += fmt.Sprintf(",drawtext=fontfile=font.ttf:textfile=%s:expansion=none:fontsize=%d:fontcolor=%s:x='%s':y='%s':alpha='%s':enable='between(t,%g,%g)'", filename, item.FontSize, item.Color, x, y, alpha, max(0, item.Start-offset), min(duration, item.End-offset))
	}
	return filters, nil
}
