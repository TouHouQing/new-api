package app

import (
	"encoding/json"
	"strings"
	"testing"
	"yingce/backend/internal/model"
)

func TestTimelineOutputFormatAndCaptionWidth(t *testing.T) {
	for _, c := range []struct {
		ratio         string
		width, height int
	}{
		{"", 1920, 1080}, {"16:9", 1920, 1080}, {"9:16", 1080, 1920}, {"1:1", 1080, 1080}, {"4:3", 1440, 1080}, {"3:4", 1080, 1440},
	} {
		output, err := timelineOutputFormat(c.ratio)
		if err != nil || output.Width != c.width || output.Height != c.height || output.FPS != 30 {
			t.Fatalf("ratio=%s output=%+v err=%v", c.ratio, output, err)
		}
	}
	if _, err := timelineOutputFormat("12:7"); err == nil {
		t.Fatal("unsupported output ratio silently changed")
	}
	text := strings.Repeat("一", 30)
	portrait, lines, err := wrapRenderCaption(text, renderCaptionLineUnits(1080))
	if err != nil || lines != 2 || strings.ReplaceAll(portrait, "\n", "") != text {
		t.Fatalf("portrait wrapping: %q lines=%d err=%v", portrait, lines, err)
	}
	if _, _, err := wrapRenderCaption(strings.Repeat("一", 70), renderCaptionLineUnits(1080)); err == nil {
		t.Fatal("portrait caption overflow accepted")
	}
}

func TestTimelineRenderFreezesProjectOutputBeforeSettingsChange(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	project := model.Project{ID: "portrait-output", UserID: "usr-render-test", Name: "Portrait", Status: model.ProjectStatusActive, AspectRatio: "9:16"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "portrait-source", UserID: project.UserID, Kind: "video", MimeType: "video/mp4", Status: model.ResourceStatusReady}).Error; err != nil {
		t.Fatal(err)
	}
	task, err := svc.CreateTimelineRenderTask(project.UserID, TimelineRenderCreateRequest{ProjectID: project.ID, Timeline: renderTestProject("resource:portrait-source")})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&project).Update("aspect_ratio", "16:9").Error; err != nil {
		t.Fatal(err)
	}
	stored, err := svc.repo.TaskForUser(project.UserID, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	var input timelineRenderInput
	if err := json.Unmarshal([]byte(stored.InputJSON), &input); err != nil {
		t.Fatal(err)
	}
	if input.AspectRatio != "9:16" {
		t.Fatalf("queued output changed: %q", input.AspectRatio)
	}
	format, err := timelineOutputFormat(input.AspectRatio)
	if err != nil {
		t.Fatal(err)
	}
	plan := buildRenderPlan(input.Timeline)
	plan.Output = format
	args := strings.Join(buildRenderFFmpegArgs(plan, "portrait.mp4"), " ")
	if !strings.Contains(args, "scale=1080:1920") || strings.Contains(args, "scale=1920:1080") {
		t.Fatalf("portrait output not used in encoder: %s", args)
	}
}
