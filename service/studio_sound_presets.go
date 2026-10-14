package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/fnv"
	"math"
	"math/rand"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

var studioSoundPresets = map[string]bool{"rain": true, "wind": true, "footsteps": true, "whoosh": true, "impact": true, "notification": true}

func validateStudioSoundPreset(document map[string]any, operation *StudioMediaOperation) error {
	if operation == nil || !studioSoundPresets[operation.Prompt] || !StudioIDPattern.MatchString(operation.NodeID) || math.IsNaN(operation.Seconds) || math.IsInf(operation.Seconds, 0) || operation.Seconds < .2 || operation.Seconds > 30 {
		return errors.New("select a sound preset, an audio target and a duration between 0.2 and 30 seconds")
	}
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != operation.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		takes, _ := data["takes"].([]any)
		if data["kind"] != "audio" || data["locked"] == true || len(takes) >= 100 {
			return errors.New("select an editable audio target")
		}
		return nil
	}
	return errors.New("sound preset target is unavailable")
}

// These are synthesized sound presets, separate from model-generated soundscapes.
func synthesizeStudioSound(preset string, seconds float64, identity string) []byte {
	const rate = 48000
	frames := int(math.Round(seconds * rate))
	var output bytes.Buffer
	output.WriteString("RIFF")
	binary.Write(&output, binary.LittleEndian, uint32(36+frames*4))
	output.WriteString("WAVEfmt ")
	binary.Write(&output, binary.LittleEndian, uint32(16))
	binary.Write(&output, binary.LittleEndian, uint16(1))
	binary.Write(&output, binary.LittleEndian, uint16(2))
	binary.Write(&output, binary.LittleEndian, uint32(rate))
	binary.Write(&output, binary.LittleEndian, uint32(rate*4))
	binary.Write(&output, binary.LittleEndian, uint16(4))
	binary.Write(&output, binary.LittleEndian, uint16(16))
	output.WriteString("data")
	binary.Write(&output, binary.LittleEndian, uint32(frames*4))
	seed := fnv.New64a()
	seed.Write([]byte(identity))
	random := rand.New(rand.NewSource(int64(seed.Sum64())))
	filtered := 0.0
	for index := range frames {
		t := float64(index) / rate
		noise := random.Float64()*2 - 1
		filtered = filtered*.97 + noise*.03
		value := 0.0
		switch preset {
		case "rain":
			value = noise*.12 + filtered*.4
		case "wind":
			value = filtered * .8 * (.5 + .5*math.Sin(2*math.Pi*.3*t))
		case "footsteps":
			phase := math.Mod(t, .48)
			value = (math.Sin(2*math.Pi*130*phase)*.45 + noise*.2) * math.Exp(-phase*35)
		case "whoosh":
			envelope := math.Sin(math.Pi * t / seconds)
			value = (noise*.2 + filtered*.8) * envelope * envelope
		case "impact":
			value = (math.Sin(2*math.Pi*70*t)*.6 + noise*.2) * math.Exp(-t*8)
		case "notification":
			phase := math.Mod(t, 1.2)
			value = (math.Sin(2*math.Pi*660*phase) + .3*math.Sin(2*math.Pi*990*phase)) * .2 * math.Exp(-phase*6)
		}
		fade := math.Min(1, math.Min(t/.02, (seconds-t)/.04))
		value = math.Max(-.95, math.Min(.95, value*math.Max(0, fade)))
		sample := int16(math.Round(value * 32767))
		binary.Write(&output, binary.LittleEndian, sample)
		binary.Write(&output, binary.LittleEndian, sample)
	}
	return output.Bytes()
}

func runStudioSoundPreset(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) error {
	if err := validateStudioSoundPreset(plan.Document, plan.Operation); err != nil {
		return err
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Take == nil {
		if err := ctx.Err(); err != nil {
			return err
		}
		id := "sound-" + job.ID
		media, err := SaveStudioMedia(project.OwnerID, id, "audio/wav", bytes.NewReader(synthesizeStudioSound(plan.Operation.Prompt, plan.Operation.Seconds, job.ID)))
		if err != nil {
			return err
		}
		if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
			return err
		}
		snapshot, _ := common.Marshal(map[string]any{"method": "synthesized_sound_preset", "preset": plan.Operation.Prompt, "seconds": plan.Operation.Seconds})
		progress.Take = map[string]any{"id": id, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "prompt": plan.Operation.Prompt, "status": "completed", "sourceMode": "upload", "mediaId": media.MediaID, "requestSnapshot": string(snapshot)}
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
