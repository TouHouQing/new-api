package service

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func studioCompileTranscriptCaptions(actorID int, project *model.StudioProject, document map[string]any, clips []map[string]any, durations map[string]float64, request StudioEditRequest) (map[string]any, []StudioSourceRange, error) {
	if !request.ReviewConfirmed || !StudioIDPattern.MatchString(request.TranscriptID) {
		return nil, nil, errors.New("review a transcript before replacing this clip's subtitles")
	}
	record, result, err := ReadStudioAnalysisResult(actorID, request.TranscriptID)
	if err != nil {
		return nil, nil, err
	}
	if record.ProjectID != project.ID {
		return nil, nil, model.ErrStudioAccess
	}
	program, total := 0.0, 0.0
	var selected map[string]any
	for _, clip := range clips {
		if clip["id"] == request.ClipID {
			selected = clip
			program = total
		}
		total += (studioDocumentNumber(clip["trimEnd"], durations[fmt.Sprint(clip["id"])]) - studioDocumentNumber(clip["trimStart"], 0)) / studioDocumentNumber(clip["speed"], 1)
	}
	if selected == nil {
		return nil, nil, errors.New("choose the exact clip to caption")
	}
	media, _, err := studioClipSource(project.OwnerID, document, selected)
	if err != nil {
		return nil, nil, err
	}
	if media.MediaID != result["source_media_id"] || media.Digest != result["source_digest"] {
		return nil, nil, errors.New("transcript source differs from the exact clip")
	}
	start, end, speed := studioDocumentNumber(selected["trimStart"], 0), studioDocumentNumber(selected["trimEnd"], durations[request.ClipID]), studioDocumentNumber(selected["speed"], 1)
	clipEnd := program + (end-start)/speed
	type cue struct {
		Start, End float64
		Text       string
	}
	cues := []cue{}
	if raw, _ := document["captionsText"].(string); strings.TrimSpace(raw) != "" {
		for block := range strings.SplitSeq(strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n")), "\n\n") {
			lines := strings.Split(strings.TrimSpace(block), "\n")
			index := 0
			if len(lines) > 0 {
				if _, err := strconv.Atoi(lines[0]); err == nil {
					index = 1
				}
			}
			if index >= len(lines) {
				return nil, nil, errors.New("existing subtitles need valid SRT timestamps")
			}
			match := studioSubtitleTiming.FindStringSubmatch(lines[index])
			a, b, err := studioSubtitleSeconds(match)
			if err != nil {
				return nil, nil, err
			}
			offset := studioDocumentNumber(document["captionOffsetSeconds"], 0)
			a, b = a+offset, b+offset
			text := strings.Join(lines[index+1:], "\n")
			if a < program {
				cues = append(cues, cue{a, min(b, program), text})
			}
			if b > clipEnd {
				cues = append(cues, cue{max(a, clipEnd), b, text})
			}
		}
	}
	raw, _ := common.Marshal(result["analysis"])
	var transcript StudioTranscript
	if common.Unmarshal(raw, &transcript) != nil || transcript.Kind != "transcript" {
		return nil, nil, errors.New("choose a transcript analysis")
	}
	for _, span := range transcript.Segments {
		a, b := max(start, span.Start), min(end, span.End)
		if b > a && strings.TrimSpace(span.Text) != "" {
			cues = append(cues, cue{program + (a-start)/speed, program + (b-start)/speed, span.Text})
		}
	}
	sort.SliceStable(cues, func(i, j int) bool { return cues[i].Start < cues[j].Start })
	var captions strings.Builder
	for index, item := range cues {
		fmt.Fprintf(&captions, "%d\n%s --> %s\n%s\n\n", index+1, studioSubtitleTime(item.Start), studioSubtitleTime(item.End), item.Text)
	}
	if captions.Len() > 100000 {
		return nil, nil, errors.New("captions exceed the project limit")
	}
	document["captionsText"], document["captionOffsetSeconds"] = captions.String(), 0.0
	selected["caption"] = ""
	production, _ := studioTimelineDocument(document)
	production["timeline"], production["timelineEdited"], production["documentVersion"] = clips, true, StudioDocumentVersion
	return document, []StudioSourceRange{{0, total}}, nil
}
