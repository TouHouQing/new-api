package service

import (
	"archive/zip"
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

//go:embed resources/studio_agpl_license.txt
var studioGraphicsLicense []byte

func openStudioGraphicsBrowser(ctx context.Context, ownerID int, document map[string]any, items []StudioMotionGraphic, width, height int) (*StudioPrevisBrowser, map[string]any, error) {
	if err := validateStudioMotionGraphics(items); err != nil {
		return nil, nil, err
	}
	images := map[string]string{}
	references := StudioMediaReferences(document)
	total := int64(0)
	for _, item := range items {
		if item.Kind != "image" || images[item.ImageMediaID] != "" {
			continue
		}
		if !references[item.ImageMediaID] {
			return nil, nil, errors.New("graphic image is outside the project")
		}
		media, err := GetStudioMedia(ownerID, item.ImageMediaID)
		if err != nil || !strings.HasPrefix(media.MimeType, "image/") || media.MimeType == "image/svg+xml" || media.Size > 16<<20 {
			return nil, nil, errors.New("graphic image must be a stored raster image within sixteen MiB")
		}
		total += media.Size
		if total > 32<<20 {
			return nil, nil, errors.New("graphic references exceed thirty-two MiB")
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return nil, nil, err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, err
		}
		images[item.ImageMediaID] = "data:" + media.MimeType + ";base64," + base64.StdEncoding.EncodeToString(data)
	}
	values := map[string]any{"items": items, "width": width, "height": height, "images": images}
	browser, err := openStudioRenderingBrowser(ctx, values, true)
	return browser, values, err
}

func ValidateStudioGraphicsOperation(document map[string]any, operation *StudioMediaOperation) error {
	if operation == nil || !StudioIDPattern.MatchString(operation.NodeID) || operation.Action != "graphics_frame" && operation.Action != "graphics_animation" || math.IsNaN(operation.Seconds) || math.IsInf(operation.Seconds, 0) || operation.Seconds < 0 || operation.Seconds > 30 || operation.Action == "graphics_animation" && operation.Seconds < .1 {
		return errors.New("choose a graphic frame or animation within thirty seconds")
	}
	production, _ := document["production"].(map[string]any)
	if operation.Options != nil {
		for _, dimension := range []int{operation.Options.Width, operation.Options.Height} {
			if dimension != 0 && (dimension < 64 || dimension > 4096 || dimension%2 != 0) {
				return errors.New("choose even graphic dimensions from 64 to 4096")
			}
		}
	}
	encoded, _ := common.Marshal(production["motionGraphics"])
	var items []StudioMotionGraphic
	if common.Unmarshal(encoded, &items) != nil || len(items) == 0 {
		return errors.New("add a graphic before exporting")
	}
	if err := validateStudioMotionGraphics(items); err != nil {
		return err
	}
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != operation.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		kind := "image"
		if operation.Action == "graphics_animation" {
			kind = "video"
		}
		if data["kind"] != kind || data["locked"] == true || data["purpose"] == "assembly" || len(studioObjects(data, "takes")) >= 100 {
			return errors.New("choose an unlocked compatible graphic output node")
		}
		return nil
	}
	return errors.New("graphic output node is unavailable")
}

func RunStudioGraphics(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) error {
	if err := ValidateStudioGraphicsOperation(plan.Document, plan.Operation); err != nil {
		return err
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Take == nil {
		production, _ := plan.Document["production"].(map[string]any)
		encoded, _ := common.Marshal(production["motionGraphics"])
		var items []StudioMotionGraphic
		if err := common.Unmarshal(encoded, &items); err != nil {
			return err
		}
		width, height := 1280, 720
		if options := plan.Operation.Options; options != nil {
			if options.Width != 0 {
				width = options.Width
			}
			if options.Height != 0 {
				height = options.Height
			}
		}
		if width < 64 || height < 64 || width > 4096 || height > 4096 || width%2 != 0 || height%2 != 0 {
			return errors.New("graphic output dimensions must be even and between sixty-four and four thousand ninety-six")
		}
		browser, values, err := openStudioGraphicsBrowser(ctx, project.OwnerID, plan.Document, items, width, height)
		if err != nil {
			return err
		}
		defer browser.close()
		work, err := os.MkdirTemp("", "studio-graphics-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(work)
		animation := plan.Operation.Action == "graphics_animation"
		frames, fps := 1, 30
		if animation {
			frames = int(math.Round(plan.Operation.Seconds * float64(fps)))
		}
		for index := range frames {
			seconds := plan.Operation.Seconds
			if animation {
				seconds = float64(index) / float64(fps)
			}
			data, err := browser.Frame(seconds, "color")
			if err != nil {
				return err
			}
			if err := os.WriteFile(filepath.Join(work, fmt.Sprintf("%06d.png", index)), data, 0600); err != nil {
				return err
			}
			if index%fps == 0 {
				if err := studioSaveProgress(job, progress, index*80/frames); err != nil {
					return err
				}
			}
		}
		path, mimeType := filepath.Join(work, "000000.png"), "image/png"
		if animation {
			path, mimeType = filepath.Join(work, "animation.mp4"), "video/mp4"
			if err := runStudioFFmpeg(ctx, work, []string{"-nostdin", "-y", "-v", "error", "-framerate", fmt.Sprint(fps), "-i", "%06d.png", "-frames:v", fmt.Sprint(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "animation.mp4"}); err != nil {
				return err
			}
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		media, err := SaveStudioMedia(project.OwnerID, "graphics-"+job.ID, mimeType, file)
		file.Close()
		if err != nil {
			return err
		}
		if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
			return err
		}
		var archive bytes.Buffer
		writer := zip.NewWriter(&archive)
		values["duration"] = plan.Operation.Seconds
		configuration, err := common.Marshal(values)
		if err != nil {
			return err
		}
		data := strings.ReplaceAll(string(configuration), "<", `\u003c`)
		html := `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'self'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'"><title>Editable motion graphics</title><style>body{margin:0;background:#14191f;display:grid;place-items:center;height:100vh}canvas{max-width:100%;height:auto}</style></head><body><script>window.studioGraphicsInput=` + data + `;</script><script>` + strings.ReplaceAll(string(studioPrevisWorker), "</script", "<\\/script") + `</script><script>let started=performance.now();function tick(){if(window.studioPrevisReady){let duration=window.studioGraphicsInput.duration||2;window.studioPrevisCapture(((performance.now()-started)/1000)%duration,'color').then(()=>requestAnimationFrame(tick)).catch(()=>{});}else requestAnimationFrame(tick);}tick();</script></body></html>`
		for name, content := range map[string][]byte{"animation.html": []byte(html), "renderer.js": studioPrevisWorker, "LICENSE.txt": studioGraphicsLicense, "graphics.json": configuration, "README.txt": []byte("Open animation.html directly in a browser; media and renderer are embedded and use no network. Edit graphics.json and the matching embedded studioGraphicsInput in animation.html to revise the animation. Renderer source: new-api/web/src/features/studio/studio-motion-runtime.ts. Copyright (C) 2023-2026 QuantumNous; GNU AGPL v3 or later. License: https://www.gnu.org/licenses/agpl-3.0.txt\n")} {
			entry, err := writer.Create(name)
			if err != nil {
				return err
			}
			if _, err := entry.Write(content); err != nil {
				return err
			}
		}
		if err := writer.Close(); err != nil {
			return err
		}
		packageMedia, err := SaveStudioMedia(project.OwnerID, "graphics-package-"+job.ID, "application/zip", &archive)
		if err != nil {
			return err
		}
		if err := LinkStudioProjectMedia(project.ID, packageMedia.MediaID); err != nil {
			return err
		}
		progress.Take = map[string]any{"id": "graphics-" + job.ID, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "prompt": "Motion graphics", "status": "completed", "sourceMode": "upload", "mediaId": media.MediaID, "auxiliary": []any{map[string]any{"role": "editable_html", "mediaId": packageMedia.MediaID, "mimeType": "application/zip"}}}
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
