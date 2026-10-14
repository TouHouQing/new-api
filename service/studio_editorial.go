package service

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

//go:embed resources/studio_editorial.py
var studioEditorialExporter []byte

// Conformed clips preserve the renderer's retiming, framing and visual effects.
// Raw sources, chosen Take IDs and edit ranges remain in the same package.
func studioEditorialPackage(ctx context.Context, project *model.StudioProject, plan *StudioRenderPlan, result map[string]any, workdir string) ([]string, error) {
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return nil, err
	}
	durations, ok := result["clip_durations"].([]float64)
	if !ok || len(durations) != len(plan.Clips) {
		return nil, errors.New("editorial export needs matching rendered clip durations")
	}
	title := func(nodeID, mediaID string) string {
		for _, node := range studioObjects(document, "nodes") {
			data, _ := node["data"].(map[string]any)
			if node["id"] == nodeID || data["mediaId"] == mediaID {
				if name, ok := data["title"].(string); ok && name != "" {
					return name
				}
			}
		}
		return mediaID
	}
	if err := os.MkdirAll(filepath.Join(workdir, "editorial"), 0700); err != nil {
		return nil, err
	}
	entries := []string{"timeline.xml", "timeline.fcpxml", "timeline.otio", "editorial-plan.json", "relink_media.py", "EDITORIAL_README.txt"}
	editorialFPS := studioEditorialFrameRate(plan.FPS)
	clips, audio := []map[string]any{}, []map[string]any{}
	total := 0.0
	for index, clip := range plan.Clips {
		source, err := os.Open(filepath.Join(workdir, fmt.Sprintf("clip-%03d.mp4", index)))
		if err != nil {
			return nil, err
		}
		name := fmt.Sprintf("editorial/clip-%03d.mp4", index)
		output, err := os.Create(filepath.Join(workdir, filepath.FromSlash(name)))
		if err != nil {
			source.Close()
			return nil, err
		}
		_, copyErr := io.Copy(output, source)
		source.Close()
		closeErr := output.Close()
		if copyErr != nil || closeErr != nil {
			return nil, errors.New("editorial clip copy failed")
		}
		frames := int64(math.Round((total+durations[index])*float64(editorialFPS))) - int64(math.Round(total*float64(editorialFPS)))
		if frames <= 0 {
			return nil, errors.New("editorial clip is shorter than one output frame")
		}
		if editorialFPS != plan.FPS {
			conformed := fmt.Sprintf("editorial/conformed-%03d.mp4", index)
			filter := fmt.Sprintf("fps=%d,tpad=stop_mode=clone:stop_duration=%g", editorialFPS, 1.0/float64(editorialFPS))
			if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-i", name, "-vf", filter, "-frames:v", fmt.Sprint(frames), "-t", fmt.Sprint(float64(frames) / float64(editorialFPS)), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", conformed}); err != nil {
				return nil, err
			}
			if err := os.Rename(filepath.Join(workdir, filepath.FromSlash(conformed)), filepath.Join(workdir, filepath.FromSlash(name))); err != nil {
				return nil, err
			}
		}
		clips = append(clips, map[string]any{"name": title(clip.NodeID, clip.MediaID), "path": name, "frames": frames, "source": clip})
		entries = append(entries, name)
		total += durations[index]
	}
	tracks, _ := result["audio"].([]StudioRenderAudio)
	for index, track := range tracks {
		if track.Offset >= total {
			continue
		}
		media, err := GetStudioMedia(project.OwnerID, track.MediaID)
		if err != nil {
			return nil, err
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return nil, err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil || !probe.HasAudio {
			return nil, errors.New("editorial audio could not be decoded")
		}
		duration := min(probe.Duration-track.Start, total-track.Offset)
		if track.Duration != nil {
			duration = min(duration, *track.Duration)
		}
		frames := int64(math.Round(duration * float64(editorialFPS)))
		if frames <= 0 {
			continue
		}
		name := fmt.Sprintf("editorial/audio-%03d.wav", index)
		filter := fmt.Sprintf("asetpts=PTS-STARTPTS,volume=%g,apad,atrim=duration=%g", track.Volume, float64(frames)/float64(editorialFPS))
		if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-ss", fmt.Sprint(track.Start), "-i", path, "-af", filter, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", name}); err != nil {
			return nil, err
		}
		audio = append(audio, map[string]any{"name": title("", track.MediaID), "path": name, "frames": frames, "offset_frames": int64(math.Round(track.Offset * float64(editorialFPS))), "source": track})
		entries = append(entries, name)
	}
	configuration, err := common.Marshal(map[string]any{"title": project.Title, "project_id": project.ID, "revision": result["revision"], "fps": editorialFPS, "render_fps": plan.FPS, "width": plan.Width, "height": plan.Height, "clips": clips, "audio": audio})
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(workdir, "editorial-plan.json"), configuration, 0600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(workdir, "editorial_export.py"), studioEditorialExporter, 0600); err != nil {
		return nil, err
	}
	python := os.Getenv("STUDIO_EDITORIAL_PYTHON")
	if python == "" {
		python = "/opt/studio-editorial/bin/python"
	}
	command := exec.CommandContext(ctx, python, filepath.Join(workdir, "editorial_export.py"), filepath.Join(workdir, "editorial-plan.json"), workdir)
	command.Dir = workdir
	if output, err := command.CombinedOutput(); err != nil {
		common.SysError("Studio editorial export failed: " + string(output))
		return nil, errors.New("editorial exporter is unavailable or rejected the timeline; verify the configured OpenTimelineIO runtime")
	}
	if err := os.WriteFile(filepath.Join(workdir, "relink_media.py"), []byte(studioEditorialRelinker), 0600); err != nil {
		return nil, err
	}
	readme := "专业剪辑包 / Editorial package\n\n解压后运行 python relink_media.py，将工程素材路径改为当前解压目录。\nImport timeline.xml in an editor supporting Final Cut 7 XML, timeline.fcpxml in Final Cut Pro, or timeline.otio in an OpenTimelineIO-compatible editor.\n\neditorial/ contains individually editable, conformed clips and separate audio tracks. Retiming, crop, fades, per-clip captions and watermark are baked into the conformed clips; audio trim and gain are baked into separate WAV files. Global/dialogue subtitles remain in subtitles.srt and the reference video.mp4.\nOriginal immutable media and source Take/edit metadata remain in media/, project.json and editorial-plan.json. Use those originals for further changes to baked effects. Import subtitles.srt as an external caption track where supported; avoid doubling captions already visible in conformed clips.\nSoftware versions differ; the package uses interchange formats, not a proprietary native project file.\n"
	if editorialFPS != plan.FPS {
		readme += fmt.Sprintf("\n原成片保留 %d fps；专业剪辑工程与独立剪辑素材使用兼容的 %d fps。剪辑点按工程帧网格取整，原片帧率与编辑范围仍在 manifest、project.json 和 editorial-plan.json 中。\nThe film retains %d fps. Interchange timelines and conformed clips use %d fps. Cuts are rounded to the interchange frame grid; original frame rate and edit decisions remain in the package metadata.\n",plan.FPS,editorialFPS,plan.FPS,editorialFPS)
	}
	if err := os.WriteFile(filepath.Join(workdir, "EDITORIAL_README.txt"), []byte(readme), 0600); err != nil {
		return nil, err
	}
	return entries, nil
}

// Non-SMPTE film rates (including native model video at 16fps) require a
// supported interchange timebase. Prefer an exact multiple to preserve cuts.
func studioEditorialFrameRate(rate int) int {
	for _, supported := range []int{24, 25, 30, 50, 60} {
		if supported == rate {
			return rate
		}
	}
	for _, supported := range []int{24, 25, 30, 50, 60} {
		if rate > 0 && supported%rate == 0 {
			return supported
		}
	}
	return 60
}

const studioEditorialRelinker = `"""Relink only packaged timeline media; no network or project code executes."""
import json
from pathlib import Path
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
def linked(value):
    parsed = urlparse(value)
    relative = unquote(parsed.path).lstrip('/') if parsed.scheme else value
    # Exported file URLs may have the producer's directory before editorial/.
    if 'editorial/' in relative:
        relative = 'editorial/' + relative.split('editorial/', 1)[1]
    target = (root / relative).resolve()
    if root not in target.parents or not target.is_file():
        raise ValueError('Missing or outside-package editorial media: ' + relative)
    return target.as_uri()
for filename in ['timeline.xml', 'timeline.fcpxml']:
    tree = ET.parse(root / filename)
    for element in tree.iter():
        if element.tag == 'pathurl' and element.text:
            element.text = linked(element.text)
        if element.get('src'):
            element.set('src', linked(element.get('src')))
    tree.write(root / filename, encoding='utf-8', xml_declaration=True)
path = root / 'timeline.otio'
document = json.loads(path.read_text(encoding='utf-8'))
def visit(value):
    if isinstance(value, dict):
        if value.get('OTIO_SCHEMA', '').startswith('ExternalReference.'):
            value['target_url'] = linked(value['target_url'])
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)
visit(document)
path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding='utf-8')
print('Editorial media relinked to:', root)
`
