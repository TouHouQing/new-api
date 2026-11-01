package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func canvasCutServiceFixture(t *testing.T, driver string) (*Service, *gorm.DB, *model.Project, *model.CanvasProject, *model.Resource, ProjectTimelineView) {
	t.Helper()
	s, db := headlessMediaService(t, driver)
	resource, _ := seedImageOperationSource(t, s, db)
	project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "旧画布剪辑原生转换"})
	if err != nil {
		t.Fatal(err)
	}
	baseline, err := s.SaveProjectTimeline("image-user", project.ID, SaveProjectTimelineRequest{Timeline: json.RawMessage(`{"version":2,"tracks":[{"id":"s","kind":"subtitle"}],"clips":[{"id":"working","kind":"subtitle","nodeId":"working","trackId":"s","startMs":0,"durationMs":1000,"text":"工作剪辑原样保留"}],"durationMs":1000}`)})
	if err != nil {
		t.Fatal(err)
	}
	timeline := fmt.Sprintf(`{"version":2,"tracks":[{"id":"v","kind":"video","locked":true},{"id":"s","kind":"subtitle"}],"clips":[{"id":"fixed","nodeId":"same-node","kind":"image","trackId":"v","startMs":0,"durationMs":1000,"directMedia":{"id":"old-local-id","title":"原片","storageKey":"resource:%s"}},{"id":"repeat-a","nodeId":"same-node","kind":"image","trackId":"v","startMs":1000,"durationMs":1000},{"id":"repeat-b","nodeId":"same-node","kind":"image","trackId":"v","startMs":2000,"durationMs":1000},{"id":"caption","nodeId":"old-subtitle","kind":"subtitle","trackId":"s","startMs":200,"durationMs":600,"subtitleStyle":{"fontSize":22,"position":"top"}}],"durationMs":3000,"editorNote":"保留原始剪辑设定"}`, resource.ID)
	payload, err := json.Marshal(map[string]any{"id": "saved-canvas", "title": "原剪辑画布", "nodes": []any{map[string]any{"id": "same-node", "type": "image", "metadata": map[string]any{"storageKey": "resource:" + resource.ID}}}, "timeline": json.RawMessage(timeline)})
	if err != nil {
		t.Fatal(err)
	}
	canvas := &model.CanvasProject{ID: "saved-canvas", UserID: "image-user", ProjectID: project.ID, Revision: 1, Title: "原剪辑画布", PayloadJSON: string(payload)}
	if err := db.Create(canvas).Error; err != nil {
		t.Fatal(err)
	}
	return s, db, &project, canvas, resource, baseline
}
func canvasCutFixtureRequest(source CanvasCutSourcePage, project *model.Project, resource *model.Resource, revision int64) CanvasCutConvertRequest {
	return CanvasCutConvertRequest{RequestID: "canvas-cut-conversion-stable-0001", ExpectedProjectRevision: project.Revision, ExpectedTimelineRevision: revision, CanvasID: source.CanvasID, CanvasRevision: source.CanvasRevision, SourceSHA256: source.SourceSHA256, Title: "旧剪辑的独立原生版本", Mappings: []production.CanvasCutMapping{{ClipID: "repeat-a", ResourceID: resource.ID}, {ClipID: "repeat-b", ResourceID: resource.ID}}, Texts: []production.CanvasCutText{{ClipID: "caption", Text: "明确核对的旧台词"}}}
}

func TestProjectCutCanvasConversionPreservesSourceWorkingCutAndUnknownReply(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db, project, canvas, resource, baseline := canvasCutServiceFixture(t, driver)
			source, err := s.ReadCanvasTimelineCut("image-user", project.ID, canvas.ID, "", 0, 2)
			if err != nil || source.ClipCount != 4 || source.NeedsResourceCount != 2 || source.NeedsTextCount != 1 || len(source.Clips) != 2 || source.NextCursor == nil || *source.NextCursor != 2 || !source.Clips[0].PinnedAvailable {
				t.Fatal("saved source pagination or readiness incorrect", source, err)
			}
			more, err := s.ReadCanvasTimelineCut("image-user", project.ID, canvas.ID, source.SourceSHA256, 2, 2)
			if err != nil || more.NextCursor != nil || len(more.Clips) != 2 || !more.Clips[1].NeedsText {
				t.Fatal("second source page lost text or occurrence identity", more, err)
			}
			for _, read := range []func() error{
				func() error { _, err := s.ReadCanvasTimelineCut("other", project.ID, canvas.ID, "", 0, 20); return err },
				func() error {
					_, err := s.ReadCanvasTimelineCut("image-user", project.ID, canvas.ID, "", 2, 20)
					return err
				},
				func() error {
					_, err := s.ReadCanvasTimelineCut("image-user", project.ID, canvas.ID, "a", 0, 20)
					return err
				},
			} {
				if err := read(); err == nil {
					t.Fatal("foreign or stale source page accepted")
				}
			}
			request := canvasCutFixtureRequest(source, project, resource, baseline.Revision)
			missing := request
			missing.Mappings = nil
			if _, err := s.PreviewCanvasTimelineCut("image-user", project.ID, missing); err == nil {
				t.Fatal("current node media was guessed for repeated legacy clips")
			}
			missing = request
			missing.Texts = nil
			if _, err := s.PreviewCanvasTimelineCut("image-user", project.ID, missing); err == nil {
				t.Fatal("missing old caption was guessed")
			}
			plan, err := s.PreviewCanvasTimelineCut("image-user", project.ID, request)
			if err != nil || plan.Summary.Clips != 4 || plan.PinnedMedia != 1 || plan.ExplicitMedia != 2 || plan.SupplementedTexts != 1 {
				t.Fatal("conversion preview incorrect", plan, err)
			}
			var count int64
			if err := db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 0 {
				t.Fatal("preview wrote a creative cut", count, err)
			}
			request.PreviewToken = plan.PreviewToken
			// A layout-only canvas save advances its revision without changing
			// the confirmed saved timeline or the selected immutable files.
			var document map[string]any
			if json.Unmarshal([]byte(canvas.PayloadJSON), &document) != nil {
				t.Fatal("fixture invalid")
			}
			document["layoutNote"] = "另一个节点刚刚被拖动"
			layout, _ := json.Marshal(document)
			if err := db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Updates(map[string]any{"payload_json": string(layout), "revision": 2}).Error; err != nil {
				t.Fatal(err)
			}
			cut, err := s.ApplyCanvasTimelineCut("image-user", project.ID, request)
			if err != nil || cut.Replayed || cut.Cut.TimelineSHA256 != plan.Summary.SHA256 {
				t.Fatal("confirmed cut did not commit", err)
			}
			current, err := s.GetProjectTimeline("image-user", project.ID)
			if err != nil || current.Revision != baseline.Revision || string(current.Timeline) != string(baseline.Timeline) {
				t.Fatal("conversion overwrote working timeline", err)
			}
			storedCanvas, err := s.repo.CanvasProjectForUser("image-user", canvas.ID)
			if err != nil || storedCanvas.PayloadJSON != string(layout) {
				t.Fatal("conversion changed original canvas", err)
			}
			var metadata struct {
				Kind, RequestID  string
				OriginalTimeline json.RawMessage `json:"originalTimeline"`
				Source           struct {
					CanvasID       string `json:"canvasId"`
					CanvasRevision int64  `json:"canvasRevision"`
					SourceSHA256   string `json:"sourceSha256"`
				} `json:"source"`
			}
			if json.Unmarshal(cut.Metadata, &metadata) != nil || metadata.Kind != "canvas-timeline-cut-v1" || metadata.RequestID != request.RequestID || metadata.Source.CanvasRevision != 1 || metadata.Source.SourceSHA256 != source.SourceSHA256 {
				t.Fatal("original conversion proof lost", string(cut.Metadata))
			}
			definition, err := production.InspectCanvasTimelineCut(metadata.OriginalTimeline)
			if err != nil || definition.SourceSHA256 != source.SourceSHA256 || !definition.Clips[3].NeedsText {
				t.Fatal("supplemented text rewrote original source", err)
			}
			later, err := s.SaveProjectTimeline("image-user", project.ID, SaveProjectTimelineRequest{ExpectedRevision: baseline.Revision, Timeline: json.RawMessage(`{"version":2,"tracks":[],"clips":[],"durationMs":0}`)})
			if err != nil {
				t.Fatal(err)
			}
			document["timeline"].(map[string]any)["editorNote"] = "画布后来另行修改"
			changed, _ := json.Marshal(document)
			if err := db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Updates(map[string]any{"payload_json": string(changed), "revision": 3}).Error; err != nil {
				t.Fatal(err)
			}
			recovered, err := s.ApplyCanvasTimelineCut("image-user", project.ID, request)
			if err != nil || !recovered.Replayed || recovered.Cut.ID != cut.Cut.ID || string(recovered.Timeline) != string(cut.Timeline) || string(recovered.Metadata) != string(cut.Metadata) {
				t.Fatal("unknown reply regenerated against later source or working cut", err)
			}
			current, err = s.GetProjectTimeline("image-user", project.ID)
			if err != nil || current.Revision != later.Revision || string(current.Timeline) != string(later.Timeline) {
				t.Fatal("replayed conversion overwrote later editing", err)
			}
			changedIntent := request
			changedIntent.Title = "另一个意图"
			if _, err := s.ApplyCanvasTimelineCut("image-user", project.ID, changedIntent); err == nil {
				t.Fatal("same request ID changed its intended cut")
			}
			if _, err := s.ApplyCanvasTimelineCut("other", project.ID, request); err == nil {
				t.Fatal("foreign account recovered source metadata")
			}
			if err := db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 1 {
				t.Fatal("conversion replay created duplicate cuts", count, err)
			}
			if err := s.repo.DeleteDetachedResources([]model.Resource{*resource}, nil); err == nil {
				t.Fatal("converted or original media was eligible for garbage collection")
			}
		})
	}
}

func TestProjectCutCanvasConversionRejectsSourceChangedWhileWaitingForStorageLock(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db, project, canvas, resource, baseline := canvasCutServiceFixture(t, driver)
			source, err := s.ReadCanvasTimelineCut("image-user", project.ID, canvas.ID, "", 0, 20)
			if err != nil {
				t.Fatal(err)
			}
			request := canvasCutFixtureRequest(source, project, resource, baseline.Revision)
			plan, err := s.PreviewCanvasTimelineCut("image-user", project.ID, request)
			if err != nil {
				t.Fatal(err)
			}
			request.PreviewToken = plan.PreviewToken
			var sourceRead atomic.Bool
			ready := make(chan struct{})
			var once sync.Once
			const callback = "canvas-cut-source-read-before-storage-lock"
			if err := db.Callback().Query().After("gorm:query").Register(callback, func(tx *gorm.DB) {
				if row, ok := tx.Statement.Dest.(*model.CanvasProject); ok && row.ID == canvas.ID {
					sourceRead.Store(true)
				}
				if row, ok := tx.Statement.Dest.(*model.ProjectTimeline); ok && row.ProjectID == project.ID && sourceRead.Load() {
					once.Do(func() { close(ready) })
				}
			}); err != nil {
				t.Fatal(err)
			}
			defer db.Callback().Query().Remove(callback)
			s.storageMu.Lock()
			locked := true
			defer func() {
				if locked {
					s.storageMu.Unlock()
				}
			}()
			done := make(chan error, 1)
			go func() { _, err := s.ApplyCanvasTimelineCut("image-user", project.ID, request); done <- err }()
			select {
			case <-ready:
			case <-time.After(10 * time.Second):
				s.storageMu.Unlock()
				locked = false
				<-done
				t.Fatal("conversion did not capture its source before waiting")
			}
			var document map[string]any
			json.Unmarshal([]byte(canvas.PayloadJSON), &document)
			document["timeline"].(map[string]any)["editorNote"] = "确认后原剪辑已被另一窗口更新"
			changed, _ := json.Marshal(document)
			if err := db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Updates(map[string]any{"payload_json": string(changed), "revision": 2}).Error; err != nil {
				s.storageMu.Unlock()
				locked = false
				<-done
				t.Fatal(err)
			}
			s.storageMu.Unlock()
			locked = false
			select {
			case err = <-done:
			case <-time.After(10 * time.Second):
				t.Fatal("conversion did not finish after lock release")
			}
			var conflict *AppError
			if !errors.As(err, &conflict) || conflict.Status != 409 || conflict.Reason != "canvas_timeline_source_changed" {
				t.Fatal("changed canvas source did not reject stale conversion", err)
			}
			var count int64
			if err := db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 0 {
				t.Fatal("stale source left a partial cut", count, err)
			}
			current, err := s.GetProjectTimeline("image-user", project.ID)
			if err != nil || current.Revision != baseline.Revision || string(current.Timeline) != string(baseline.Timeline) {
				t.Fatal("rejected conversion altered working timeline", err)
			}
		})
	}
}
