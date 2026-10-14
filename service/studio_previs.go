package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioPrevis struct {
	Duration float64                                             `json:"duration"`
	Camera   struct{ Yaw, EndYaw, Pitch, Distance, FOV float64 } `json:"camera"`
	Actors   []struct {
		ID, AssetID, Title, Pose, Color string
		X, Z, EndX, EndZ, Yaw           float64
	} `json:"actors"`
	Props []struct {
		ID, Title, Color           string
		X, Z, Width, Height, Depth float64
	} `json:"props"`
	Advanced *struct {
		Models []struct {
			ID           string `json:"id"`
			ModelMediaID string `json:"modelMediaId"`
		} `json:"models"`
		Tracks []struct {
			TargetID string                                 `json:"targetId"`
			Keys     []struct{ Time, X, Y, Z, Yaw float64 } `json:"keys"`
		} `json:"tracks"`
		FollowID string `json:"followId"`
		LookAtID string `json:"lookAtId"`
	} `json:"advanced"`
}

func StudioPrevisDocument(document map[string]any) (*StudioPrevis, error) {
	production, _ := document["production"].(map[string]any)
	raw, ok := production["previs"].(map[string]any)
	if !ok {
		return nil, errors.New("3D stage is unavailable")
	}
	encoded, err := common.Marshal(production["previs"])
	if err != nil {
		return nil, err
	}
	scene := StudioPrevis{Duration: 5}
	scene.Camera.Yaw, scene.Camera.EndYaw, scene.Camera.Pitch, scene.Camera.Distance, scene.Camera.FOV = 20, 20, 20, 10, 50
	if err := common.Unmarshal(encoded, &scene); err != nil {
		return nil, err
	}
	within := func(value, low, high float64) bool {
		return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= low && value <= high
	}
	if !within(scene.Duration, 1, 30) || !within(scene.Camera.Yaw, -180, 180) || !within(scene.Camera.EndYaw, -180, 180) || !within(scene.Camera.Pitch, 5, 80) || !within(scene.Camera.Distance, 3, 30) || !within(scene.Camera.FOV, 20, 100) || len(scene.Actors) > 12 || len(scene.Props) > 20 {
		return nil, errors.New("invalid 3D stage or camera")
	}
	ids := map[string]bool{"__camera__": true}
	for index, actor := range scene.Actors {
		if index < len(studioObjects(raw, "actors")) {
			if _, exists := studioObjects(raw, "actors")[index]["pose"]; !exists {
				actor.Pose, scene.Actors[index].Pose = "stand", "stand"
			}
		}
		if ids[actor.ID] {
			return nil, errors.New("3D stage IDs must be unique and cannot use the reserved camera ID")
		}
		ids[actor.ID] = true
		if !StudioIDPattern.MatchString(actor.ID) || !within(actor.X, -10, 10) || !within(actor.Z, -10, 10) || !within(actor.EndX, -10, 10) || !within(actor.EndZ, -10, 10) || !within(actor.Yaw, -180, 180) {
			return nil, errors.New("invalid 3D actor placement")
		}
		switch actor.Pose {
		case "stand", "walk", "wave", "point", "sit":
		default:
			return nil, errors.New("invalid actor pose")
		}
	}
	for _, prop := range scene.Props {
		if ids[prop.ID] {
			return nil, errors.New("3D stage IDs must be unique and cannot use the reserved camera ID")
		}
		ids[prop.ID] = true
		if !StudioIDPattern.MatchString(prop.ID) || !within(prop.X, -10, 10) || !within(prop.Z, -10, 10) || !within(prop.Width, .1, 5) || !within(prop.Height, .1, 5) || !within(prop.Depth, .1, 5) {
			return nil, errors.New("invalid 3D prop placement")
		}
	}
	if advanced := scene.Advanced; advanced != nil {
		if len(advanced.Models) > 12 || len(advanced.Tracks) > 45 {
			return nil, errors.New("3D stage exceeds the model or track limit")
		}
		for _, item := range advanced.Models {
			if !StudioIDPattern.MatchString(item.ID) || !StudioIDPattern.MatchString(item.ModelMediaID) || ids[item.ID] {
				return nil, errors.New("stage models require unique IDs and a stored model")
			}
			ids[item.ID] = true
		}
		for _, target := range []string{advanced.FollowID, advanced.LookAtID} {
			if target != "" && (!ids[target] || target == "__camera__") {
				return nil, errors.New("camera follow and look-at targets must exist in the stage")
			}
		}
		tracks := map[string]bool{}
		for _, track := range advanced.Tracks {
			if !ids[track.TargetID] || tracks[track.TargetID] || len(track.Keys) > 100 {
				return nil, errors.New("stage tracks require an existing, unique target")
			}
			tracks[track.TargetID] = true
			times := map[float64]bool{}
			for _, key := range track.Keys {
				if !within(key.Time, 0, scene.Duration) || !within(key.X, -100, 100) || !within(key.Y, -100, 100) || !within(key.Z, -100, 100) || !within(key.Yaw, -180, 180) || times[key.Time] {
					return nil, errors.New("stage keyframes require unique times within the scene and valid positions")
				}
				times[key.Time] = true
			}
		}
	}
	return &scene, nil
}

type studioPoint3 [3]float64

// Render a camera-projected blocking stage without models, credentials or GPU
// dependencies. Frames and animatics can be used as normal generation inputs.
func RenderStudioPrevisFrame(scene *StudioPrevis, seconds float64) *image.RGBA {
	const width, height = 640, 360
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{color.RGBA{20, 25, 31, 255}}, image.Point{}, draw.Src)
	progress := max(0, min(1, seconds/scene.Duration))
	yaw := (scene.Camera.Yaw + (scene.Camera.EndYaw-scene.Camera.Yaw)*progress) * math.Pi / 180
	pitch := scene.Camera.Pitch * math.Pi / 180
	project := func(point studioPoint3) (int, int, bool) {
		x, y, z := point[0], point[1]-1, point[2]
		right, forward := x*math.Cos(yaw)-z*math.Sin(yaw), x*math.Sin(yaw)+z*math.Cos(yaw)
		vertical := y*math.Cos(pitch) - forward*math.Sin(pitch)
		depth := scene.Camera.Distance - (y*math.Sin(pitch) + forward*math.Cos(pitch))
		if depth <= .2 {
			return 0, 0, false
		}
		scale := height / (2 * math.Tan(scene.Camera.FOV*math.Pi/360)) / depth
		return int(max(-width*2, min(width*3, width/2+right*scale))), int(max(-height*2, min(height*3, height/2-vertical*scale))), true
	}
	line := func(a, b studioPoint3, shade color.RGBA, stroke int) {
		x1, y1, ok1 := project(a)
		x2, y2, ok2 := project(b)
		if !ok1 || !ok2 {
			return
		}
		dx, dy := math.Abs(float64(x2-x1)), math.Abs(float64(y2-y1))
		steps := max(1, int(max(dx, dy)))
		for i := range steps + 1 {
			x := x1 + (x2-x1)*i/steps
			y := y1 + (y2-y1)*i/steps
			for ox := -stroke; ox <= stroke; ox++ {
				for oy := -stroke; oy <= stroke; oy++ {
					if ox*ox+oy*oy <= stroke*stroke+1 {
						canvas.SetRGBA(x+ox, y+oy, shade)
					}
				}
			}
		}
	}
	for i := -10; i <= 10; i++ {
		line(studioPoint3{float64(i), 0, -10}, studioPoint3{float64(i), 0, 10}, color.RGBA{46, 59, 72, 255}, 0)
		line(studioPoint3{-10, 0, float64(i)}, studioPoint3{10, 0, float64(i)}, color.RGBA{46, 59, 72, 255}, 0)
	}
	shade := func(raw string) color.RGBA {
		value, err := strconv.ParseUint(raw[1:], 16, 32)
		if err != nil {
			return color.RGBA{138, 180, 248, 255}
		}
		return color.RGBA{uint8(value >> 16), uint8(value >> 8), uint8(value), 255}
	}
	for _, prop := range scene.Props {
		corners := []studioPoint3{}
		for _, y := range []float64{0, prop.Height} {
			for _, z := range []float64{-1, 1} {
				for _, x := range []float64{-1, 1} {
					corners = append(corners, studioPoint3{prop.X + x*prop.Width/2, y, prop.Z + z*prop.Depth/2})
				}
			}
		}
		c := color.RGBA{230, 173, 114, 255}
		if len(prop.Color) == 7 {
			c = shade(prop.Color)
		}
		for _, edge := range [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {4, 5}, {4, 6}, {5, 7}, {6, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}} {
			line(corners[edge[0]], corners[edge[1]], c, 1)
		}
	}
	for _, actor := range scene.Actors {
		x, z := actor.X+(actor.EndX-actor.X)*progress, actor.Z+(actor.EndZ-actor.Z)*progress
		turn := actor.Yaw * math.Pi / 180
		transform := func(p studioPoint3) studioPoint3 {
			return studioPoint3{x + p[0]*math.Cos(turn) + p[2]*math.Sin(turn), p[1], z - p[0]*math.Sin(turn) + p[2]*math.Cos(turn)}
		}
		body, swing := 0.0, 0.0
		if actor.Pose == "sit" {
			body = .5
		}
		if actor.Pose == "walk" {
			swing = math.Sin(seconds*8) * .35
		}
		points := []studioPoint3{{0, 1.7 - body, 0}, {0, 1.4 - body, 0}, {0, .85 - body, 0}, {-.3, 1.4 - body, 0}, {.3, 1.4 - body, 0}, {-.4, .85 - body, swing}, {.4, .85 - body, -swing}, {-.15, 0, -swing}, {.15, 0, swing}}
		if actor.Pose == "wave" {
			points[6] = studioPoint3{.5 + math.Sin(seconds*8)*.12, 1.9, 0}
		}
		if actor.Pose == "point" {
			points[6] = studioPoint3{.9, 1.35, 0}
		}
		if actor.Pose == "sit" {
			points[7], points[8] = studioPoint3{-.15, .15, .5}, studioPoint3{.15, .15, .5}
		}
		c := color.RGBA{138, 180, 248, 255}
		if len(actor.Color) == 7 {
			c = shade(actor.Color)
		}
		for _, edge := range [][2]int{{0, 1}, {1, 2}, {3, 4}, {3, 5}, {4, 6}, {2, 7}, {2, 8}} {
			line(transform(points[edge[0]]), transform(points[edge[1]]), c, 3)
		}
		hx, hy, visible := project(transform(points[0]))
		if visible {
			for ox := -8; ox <= 8; ox++ {
				for oy := -8; oy <= 8; oy++ {
					if ox*ox+oy*oy <= 64 {
						canvas.SetRGBA(hx+ox, hy+oy, c)
					}
				}
			}
		}
	}
	return canvas
}

func RunStudioPrevis(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) error {
	if plan.Operation == nil {
		return errors.New("previsualization configuration is missing")
	}
	scene, err := StudioPrevisDocument(plan.Document)
	if err != nil {
		return err
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Take == nil {
		browser, err := OpenStudioPrevisBrowser(ctx, project.OwnerID, plan.Document, plan.Operation.Options)
		if err != nil {
			return err
		}
		defer browser.close()
		var content bytes.Buffer
		mimeType := "image/png"
		if plan.Operation.Action == "previs_animation" {
			temporary, err := os.MkdirTemp("", "studio-previs-")
			if err != nil {
				return err
			}
			defer os.RemoveAll(temporary)
			frames := int(math.Ceil(scene.Duration * 12))
			for i := range frames {
				if err := ctx.Err(); err != nil {
					return err
				}
				data, err := browser.Frame(float64(i)/12, "color")
				if err != nil {
					return err
				}
				if err := os.WriteFile(filepath.Join(temporary, fmt.Sprintf("%04d.png", i)), data, 0600); err != nil {
					return err
				}

				if i%12 == 0 {
					if err := studioSaveProgress(job, progress, i*80/frames); err != nil {
						return err
					}
				}
			}
			output := filepath.Join(temporary, "animatic.mp4")
			if err := runStudioFFmpeg(ctx, temporary, []string{"-nostdin", "-y", "-v", "error", "-framerate", "12", "-i", filepath.Join(temporary, "%04d.png"), "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output}); err != nil {
				return err
			}
			data, err := os.ReadFile(output)
			if err != nil {
				return err
			}
			content.Write(data)
			mimeType = "video/mp4"
		} else {
			mode := "color"
			if plan.Operation.Action == "previs_depth" {
				mode = "depth"
			}
			if plan.Operation.Action == "previs_whitebox" {
				mode = "whitebox"
			}
			data, err := browser.Frame(plan.Operation.Seconds, mode)
			if err != nil {
				return err
			}
			content.Write(data)
		}
		id := "previs-" + job.ID
		media, err := SaveStudioMedia(project.OwnerID, id, mimeType, &content)
		if err != nil {
			return err
		}
		if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
			return err
		}
		progress.Take = map[string]any{"id": id, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "prompt": "3D blocking reference", "status": "completed", "mediaId": media.MediaID}
		progress.Phase = "collected"
		if err := studioSaveProgress(job, progress, 90); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := publishStudioWorkflowTake(job, plan.Operation.NodeID, progress.Take); err != nil {
		return err
	}
	progress.Phase = "completed"
	return studioSaveProgress(job, progress, 100)
}
