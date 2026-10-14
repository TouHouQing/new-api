package service

import (
	"context"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	cdpruntime "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

//go:embed resources/studio_previs_worker.js
var studioPrevisWorker []byte

type StudioPrevisBrowser struct {
	ctx        context.Context
	close      func()
	maxSeconds float64
}

func StudioPrevisBrowserPath() string {
	if configured := os.Getenv("STUDIO_CHROME_PATH"); configured != "" {
		return configured
	}
	for _, candidate := range []string{"chromium", "chromium-browser", "google-chrome", `C:\Program Files\Google\Chrome\Application\chrome.exe`, `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path
		}
	}
	return ""
}

func OpenStudioPrevisBrowser(parent context.Context, ownerID int, document map[string]any, dimensions ...*StudioToolOptions) (*StudioPrevisBrowser, error) {
	width, height := 640, 360
	if len(dimensions) > 0 && dimensions[0] != nil {
		if dimensions[0].Width != 0 {
			width = dimensions[0].Width
		}
		if dimensions[0].Height != 0 {
			height = dimensions[0].Height
		}
	}
	if width < 64 || width > 4096 || height < 64 || height > 4096 || width%2 != 0 || height%2 != 0 {
		return nil, errors.New("choose even stage dimensions from 64 to 4096")
	}
	binary := StudioPrevisBrowserPath()
	if binary == "" {
		return nil, errors.New("install the local 3D rendering browser before exporting the stage")
	}
	production, _ := document["production"].(map[string]any)
	scene, _ := production["previs"].(map[string]any)
	advanced, _ := scene["advanced"].(map[string]any)
	models := studioObjects(advanced, "models")
	if len(models) > 12 {
		return nil, errors.New("too many stage models")
	}
	encoded := map[string]string{}
	total := 0
	for _, model := range models {
		id, _ := model["modelMediaId"].(string)
		if encoded[id] != "" {
			continue
		}
		media, err := GetStudioMedia(ownerID, id)
		if err != nil || media.MimeType != "model/gltf-binary" {
			return nil, errors.New("stored stage model is unavailable")
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return nil, err
		}
		if media.Size > 64<<20 || media.Size < 12 {
			return nil, errors.New("resize the stage models to at most sixty-four MiB in total")
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		total += len(data)
		if total > 64<<20 || len(data) < 12 || string(data[:4]) != "glTF" {
			return nil, errors.New("stage model is invalid or exceeds the rendering limit")
		}
		encoded[id] = base64.StdEncoding.EncodeToString(data)
	}
	return openStudioRenderingBrowser(parent, map[string]any{"scene": scene, "models": encoded, "width": width, "height": height}, false)
}

// The isolated browser receives only validated project data and a bundled
// renderer. Neither user HTML nor network scripts execute in this runtime.
func openStudioRenderingBrowser(parent context.Context, values map[string]any, graphics bool) (*StudioPrevisBrowser, error) {
	binary := StudioPrevisBrowserPath()
	if binary == "" {
		return nil, errors.New("the local rendering browser is unavailable")
	}
	input, err := common.Marshal(values)
	if err != nil {
		return nil, err
	}
	temporary, err := os.MkdirTemp("", "studio-3d-render-")
	if err != nil {
		return nil, err
	}
	remove := func() { _ = os.RemoveAll(temporary) }
	if err := os.WriteFile(filepath.Join(temporary, "worker.js"), studioPrevisWorker, 0600); err != nil {
		remove()
		return nil, err
	}
	// Encode '<' so a creative title cannot close the controlled script element.
	data := strings.ReplaceAll(string(input), "<", `\u003c`)
	variable := "studioPrevisInput"
	if graphics {
		variable = "studioGraphicsInput"
	}
	html := `<html><head><meta charset="utf-8"><style>html,body{margin:0}canvas{display:block}</style></head><body><script>window.` + variable + `=` + data + `;</script><script type="module" src="worker.js"></script></body></html>`
	pagePath := filepath.Join(temporary, "stage.html")
	if err := os.WriteFile(pagePath, []byte(html), 0600); err != nil {
		remove()
		return nil, err
	}
	options := append(chromedp.DefaultExecAllocatorOptions[:], chromedp.ExecPath(binary), chromedp.Flag("allow-file-access-from-files", true), chromedp.Flag("use-angle", "swiftshader"), chromedp.Flag("enable-unsafe-swiftshader", true), chromedp.WindowSize(640, 360))
	if runtime.GOOS == "linux" && os.Geteuid() == 0 {
		options = append(options, chromedp.NoSandbox)
	}
	allocator, closeAllocator := chromedp.NewExecAllocator(parent, options...)
	ctx, closeBrowser := chromedp.NewContext(allocator)
	close := func() { closeBrowser(); closeAllocator(); remove() }
	path := filepath.ToSlash(pagePath)
	if filepath.VolumeName(pagePath) != "" {
		path = "/" + path
	}
	pageURL := (&url.URL{Scheme: "file", Path: path}).String()
	if err := chromedp.Run(ctx, chromedp.Navigate(pageURL)); err != nil {
		close()
		return nil, errors.New("could not start the local 3D renderer")
	}
	deadline := time.NewTimer(60 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		var state struct {
			Ready bool   `json:"ready"`
			Error string `json:"error"`
		}
		if err := chromedp.Run(ctx, chromedp.Evaluate(`({ready:window.studioPrevisReady===true,error:window.studioPrevisError||''})`, &state)); err != nil {
			close()
			return nil, err
		}
		if state.Error != "" {
			close()
			return nil, fmt.Errorf("3D stage could not load: %.500s", state.Error)
		}
		if state.Ready {
			maximum := 30.0
			if graphics {
				maximum = 3600
			}
			return &StudioPrevisBrowser{ctx: ctx, close: close, maxSeconds: maximum}, nil
		}
		select {
		case <-ctx.Done():
			close()
			return nil, ctx.Err()
		case <-deadline.C:
			close()
			return nil, errors.New("3D assets did not finish loading")
		case <-ticker.C:
		}
	}
}

func (browser *StudioPrevisBrowser) Frame(seconds float64, mode string) ([]byte, error) {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 || seconds > browser.maxSeconds {
		return nil, errors.New("invalid 3D playhead time")
	}
	if mode != "color" && mode != "whitebox" && mode != "depth" {
		return nil, errors.New("unsupported 3D frame mode")
	}
	var encoded string
	query := fmt.Sprintf("window.studioPrevisCapture(%g,'%s')", seconds, mode)
	if err := chromedp.Run(browser.ctx, chromedp.Evaluate(query, &encoded, func(parameters *cdpruntime.EvaluateParams) *cdpruntime.EvaluateParams {
		return parameters.WithAwaitPromise(true)
	})); err != nil {
		return nil, err
	}
	value, ok := strings.CutPrefix(encoded, "data:image/png;base64,")
	if !ok {
		return nil, errors.New("3D renderer returned no frame")
	}
	return base64.StdEncoding.DecodeString(value)
}
