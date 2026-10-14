package service

import (
	"archive/zip"
	"bytes"
	"context"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/chromedp/chromedp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioActualStandaloneGraphicsPNGVideoHTMLAndTimeline(t *testing.T) {
	if !StudioRenderAvailable() || StudioPrevisBrowserPath() == "" {
		t.Skip("requires actual FFmpeg and a rendering browser")
	}
	studioProductionFixture(t)
	work := t.TempDir()
	imageData := image.NewRGBA(image.Rect(0, 0, 32, 32))
	draw.Draw(imageData, imageData.Bounds(), &image.Uniform{color.RGBA{20, 240, 40, 255}}, image.Point{}, draw.Src)
	var imageBytes bytes.Buffer
	require.NoError(t, png.Encode(&imageBytes, imageData))
	_, err := SaveStudioMedia(1, "graphic-image", "image/png", &imageBytes)
	require.NoError(t, err)
	items := []StudioMotionGraphic{
		{ID: "shape", Kind: "shape", Shape: "square", Text: "Shape", Start: 0, End: 2, X: .5, Y: .5, FontSize: 100, Color: "#ff0000", Animation: "morph", BPM: 120},
		{ID: "icon", Kind: "icon", Icon: "spark", Text: "Icon", Start: 0, End: 2, X: .2, Y: .5, FontSize: 100, Color: "#ffff00", Animation: "rotate", BPM: 120},
		{ID: "image", Kind: "image", ImageMediaID: "graphic-image", Text: "Image", Start: 0, End: 2, X: .8, Y: .5, FontSize: 100, Color: "#ffffff", Animation: "fade", BPM: 120},
	}
	document := map[string]any{"id": "graphics-project", "title": "Graphics", "nodes": []any{map[string]any{"id": "frame", "data": map[string]any{"kind": "image"}}, map[string]any{"id": "animation", "data": map[string]any{"kind": "video"}}, map[string]any{"id": "source", "data": map[string]any{"kind": "image", "mediaId": "graphic-image"}}}, "edges": []any{}, "production": map[string]any{"motionGraphics": items}}
	for _, node := range studioObjects(document, "nodes") {
		node["data"].(map[string]any)["prompt"] = ""
	}
	studioCompleteTestDocument(t, document)
	encoded, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "graphics-project", "Graphics", 0, string(encoded))
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("motion graphics must not call a model")
		return StudioRelayResponse{}, nil
	}
	for _, operation := range []StudioMediaOperation{{NodeID: "frame", Action: "graphics_frame", Seconds: .5}, {NodeID: "animation", Action: "graphics_animation", Seconds: 1}} {
		operation.Options = &StudioToolOptions{Width: 640, Height: 360}
		current, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, true)
		require.NoError(t, err)
		job, err := QueueStudioWorkflow(1, project.ID, operation.Action, "graphics", current.Revision, 0, nil, nil, &operation)
		require.NoError(t, err)
		RunStudioWorkflowsOnce(t.Context(), "graphics-renderer")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)

		require.Equal(t, "succeeded", job.Status, job.Error)
		var progress StudioWorkflowProgress
		require.NoError(t, common.Unmarshal([]byte(job.Result), &progress))
		media, err := GetStudioMedia(1, progress.Take["mediaId"].(string))
		require.NoError(t, err)
		path, err := StudioMediaPath(media)
		require.NoError(t, err)
		if operation.Action == "graphics_frame" {
			data, err := os.ReadFile(path)
			require.NoError(t, err)
			frame, err := png.Decode(bytes.NewReader(data))
			require.NoError(t, err)
			_, _, _, alpha := frame.At(0, 0).RGBA()
			assert.Zero(t, alpha, "PNG keeps its transparent background")
			red, green, _, alpha := frame.At(512, 180).RGBA()
			assert.Greater(t, green, red*2)
			assert.Greater(t, alpha, uint32(0))
			if directory := os.Getenv("STUDIO_TEST_GRAPHICS_PROOF"); directory != "" {
				require.NoError(t, os.MkdirAll(directory, 0700))
				require.NoError(t, os.WriteFile(filepath.Join(directory, "actual-graphics.png"), data, 0600))
			}
		} else {
			probe, err := ProbeStudioMedia(t.Context(), path)
			require.NoError(t, err)
			assert.Equal(t, 640, probe.Width)
			assert.InDelta(t, 1, probe.Duration, .04)
			auxiliary := progress.Take["auxiliary"].([]any)[0].(map[string]any)
			archive, err := GetStudioMedia(1, auxiliary["mediaId"].(string))
			require.NoError(t, err)
			archivePath, err := StudioMediaPath(archive)
			require.NoError(t, err)
			data, err := os.ReadFile(archivePath)
			require.NoError(t, err)
			reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
			require.NoError(t, err)
			for _, entry := range reader.File {
				if entry.Name != "animation.html" {
					continue
				}
				stream, err := entry.Open()
				require.NoError(t, err)
				html, err := io.ReadAll(stream)
				stream.Close()
				require.NoError(t, err)
				assert.Contains(t, string(html), "data:image/png;base64,")
				assert.NotContains(t, string(html), "src=\"renderer.js\"")
				pagePath := filepath.Join(work, "animation.html")
				require.NoError(t, os.WriteFile(pagePath, html, 0600))
				options := append(chromedp.DefaultExecAllocatorOptions[:], chromedp.ExecPath(StudioPrevisBrowserPath()))
				allocator, closeAllocator := chromedp.NewExecAllocator(t.Context(), options...)
				browser, closeBrowser := chromedp.NewContext(allocator)
				var ready bool
				err = chromedp.Run(browser, chromedp.Navigate("file:///"+filepath.ToSlash(pagePath)), chromedp.Poll(`window.studioPrevisReady===true`, &ready), chromedp.Evaluate(`window.studioPrevisError||''`, new(string)))
				closeBrowser()
				closeAllocator()
				require.NoError(t, err)
				assert.True(t, ready, "editable HTML runs offline without external files or services")
			}
			// The exported animation remains a normal video Take. A render with
			// the same graphic layers exercises the actual timeline compositor.
			current, _, err = model.StudioProjectAccess(model.DB, 1, project.ID, true)
			require.NoError(t, err)
			plan := &StudioRenderPlan{Width: 640, Height: 360, FPS: 30, Clips: []StudioRenderClip{{NodeID: "animation", MediaID: media.MediaID, TakeID: progress.Take["id"].(string), Speed: 1, Volume: 1}}, MotionGraphics: items}
			render, err := QueueStudioWorkflow(1, project.ID, "graphics-film", "render", current.Revision, 0, nil, plan)
			require.NoError(t, err)
			RunStudioWorkflowsOnce(t.Context(), "graphics-compositor")
			require.NoError(t, model.DB.First(render, "id = ?", render.ID).Error)
			require.Equal(t, "succeeded", render.Status, render.Error)
			var result struct {
				MediaID string `json:"media_id"`
			}
			require.NoError(t, common.Unmarshal([]byte(render.Result), &result))
			film, err := GetStudioMedia(1, result.MediaID)
			require.NoError(t, err)
			filmPath, err := StudioMediaPath(film)
			require.NoError(t, err)
			pixels, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-ss", "0.5", "-i", filmPath, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1").Output()
			require.NoError(t, err)
			position := (180*640 + 512) * 3
			require.Len(t, pixels, 640*360*3)
			assert.Greater(t, int(pixels[position+1]), int(pixels[position])*2)
		}
	}
}
