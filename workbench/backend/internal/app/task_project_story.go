package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"strings"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type projectStoryTarget struct {
	Version                 int   `json:"version"`
	ExpectedProjectRevision int64 `json:"expectedProjectRevision"`
}
type ProjectStoryResult struct {
	TaskID    string   `json:"taskId"`
	ProjectID string   `json:"projectId"`
	Status    string   `json:"status"`
	Message   string   `json:"message,omitempty"`
	UnitIDs   []string `json:"unitIds"`
	Current   bool     `json:"current"`
}
type generatedProjectChapter struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

func projectStoryTargetFor(task *model.Task) (*projectStoryTarget, error) {
	var input struct {
		Metadata map[string]json.RawMessage `json:"metadata"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil {
		return nil, nil
	}
	raw, found := input.Metadata["nativeProjectStory"]
	if !found {
		return nil, nil
	}
	var target projectStoryTarget
	if task.Type != "canvas_text" || task.ProjectID == "" || json.Unmarshal(raw, &target) != nil || target.Version != 1 || target.ExpectedProjectRevision < 1 {
		return nil, BadAuthRequest("章节保存目标无效，未提交生成")
	}
	if _, draft := input.Metadata["canvasTaskDraft"]; draft {
		return nil, BadAuthRequest("章节生成不能同时指定画布节点目标")
	}
	return &target, nil
}

func isNativeProjectStoryTask(task *model.Task) bool {
	target, err := projectStoryTargetFor(task)
	return err == nil && target != nil
}

func parseGeneratedProjectChapters(task *model.Task) ([]generatedProjectChapter, error) {
	var result struct {
		Text string `json:"text"`
	}
	if json.Unmarshal([]byte(task.ResultJSON), &result) != nil || len(result.Text) > 1024*1024 {
		return nil, BadAuthRequest("章节回复无法读取，原始回复保留在任务中")
	}
	text := strings.TrimSpace(result.Text)
	start, end := strings.Index(text, "{"), strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, BadAuthRequest("模型没有返回完整章节结构，原回复保留，请校正后导入")
	}
	var value struct {
		Chapters []generatedProjectChapter `json:"chapters"`
	}
	if json.Unmarshal([]byte(text[start:end+1]), &value) != nil || len(value.Chapters) < 1 || len(value.Chapters) > 100 {
		return nil, BadAuthRequest("模型章节结构不完整，原回复保留，请校正后导入")
	}
	for index := range value.Chapters {
		chapter := &value.Chapters[index]
		chapter.Title = model.NormalizeProjectUnitTitle(chapter.Title)
		chapter.Content = strings.TrimSpace(chapter.Content)
		if !model.ValidProjectUnitTitle(chapter.Title) || chapter.Title == "" || chapter.Content == "" || utf8.RuneCountInString(chapter.Content) > 200000 || strings.ContainsRune(chapter.Content, 0) {
			return nil, BadAuthRequest("模型章节包含空白、过长或无效内容，整份原回复保留，请校正后导入")
		}
	}
	return value.Chapters, nil
}

func projectStoryUnitID(taskID string, index int) string {
	return projectCreationHash([]byte(fmt.Sprintf("native-project-story-v1\x00%s\x00%d", taskID, index)))[:32]
}

// The existing native delivery transaction handles this project target too.
// A source change is handled explicitly and never overwrites another writer.
func (s *Service) applyNativeProjectStory(repo *repository.Repository, task *model.Task, policy RuntimePolicySetting) (bool, string, error) {
	target, err := projectStoryTargetFor(task)
	if err != nil || target == nil {
		return false, "", err
	}
	if task.Status != model.TaskStatusSucceeded {
		return false, "", nil
	}
	project, err := repo.ProjectForUser(task.UserID, task.ProjectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, "目标项目已删除，原章节回复保留在任务中", nil
	}
	if err != nil {
		return false, "", err
	}
	if project.Status != model.ProjectStatusActive || project.Revision != target.ExpectedProjectRevision {
		return true, "项目已在生成期间更新，原章节回复保留，请核对后手动导入", nil
	}
	chapters, err := parseGeneratedProjectChapters(task)
	if err != nil {
		return true, err.Error(), nil
	}
	existing, err := repo.ProjectUnits(task.ProjectID)
	if err != nil {
		return false, "", err
	}
	ids := map[string]bool{}
	for _, unit := range existing {
		ids[unit.ID] = true
	}
	for index := range chapters {
		if ids[projectStoryUnitID(task.ID, index)] {
			return true, "", nil
		}
	}
	units := make([]model.ProjectUnit, 0, len(chapters))
	for index, chapter := range chapters {
		paragraphs := []string{}
		for _, line := range strings.Split(strings.ReplaceAll(chapter.Content, "\r\n", "\n"), "\n") {
			paragraphs = append(paragraphs, "<p>"+html.EscapeString(line)+"</p>")
		}
		unit, err := newProjectUnit(task.ProjectID, CreateProjectUnitRequest{Kind: "chapter", Title: chapter.Title, SourceText: strings.Join(paragraphs, "")}, len(existing)+index)
		if err != nil {
			return true, "章节标题需要校正，原回复保留在任务中", nil
		}
		unit.ID = projectStoryUnitID(task.ID, index)
		units = append(units, unit)
	}
	if err := repo.ImportProjectUnits(task.ProjectID, units); err != nil {
		return false, "", err
	}
	writer := &Service{repo: repo, dataDir: s.dataDir}
	if err := writer.validateProductionDocumentStorage(task.UserID, 0); err != nil {
		return false, "", err
	}
	return true, "", nil
}

func (s *Service) ProjectStoryResult(owner, projectID, taskID string) (ProjectStoryResult, error) {
	result := ProjectStoryResult{TaskID: taskID, ProjectID: projectID, UnitIDs: []string{}, Status: "pending"}
	if _, err := s.repo.ProjectForUser(owner, projectID); err != nil {
		return result, shotOperationError(err)
	}
	task, err := s.repo.TaskForUser(owner, taskID)
	if err != nil || task.ProjectID != projectID || !isNativeProjectStoryTask(task) {
		return result, NotFound("未找到本项目的章节生成记录")
	}
	if task.Status == model.TaskStatusFailed || task.Status == model.TaskStatusCancelled {
		result.Status = "failed"
		result.Message = cloudAgentSafeMediaTaskError(task)
		return result, nil
	}
	result.Message = task.CanvasDeliveryError
	if task.CanvasDeliveryStatus == "pending" || task.Status != model.TaskStatusSucceeded {
		return result, nil
	}
	if task.CanvasDeliveryStatus == "skipped" || result.Message != "" {
		result.Status = "needs_review"
		return result, nil
	}
	chapters, err := parseGeneratedProjectChapters(task)
	if err != nil {
		result.Status = "needs_review"
		result.Message = err.Error()
		return result, nil
	}
	result.Status = "adopted"
	result.Current = true
	for index := range chapters {
		id := projectStoryUnitID(taskID, index)
		result.UnitIDs = append(result.UnitIDs, id)
		if _, err := s.repo.ProjectUnit(projectID, id); err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return result, err
			}
			result.Current = false
		}
	}
	return result, nil
}
