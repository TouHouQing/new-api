package app

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

type ProjectCutRenderRequest struct {
	RequestID      string `json:"requestId"`
	TimelineSHA256 string `json:"timelineSha256"`
}

type timelineCutRenderContext struct {
	TaskID, CutID, CutSHA256, RequestSHA256 string
	Output                                  timelineRenderFormat
}

type ProjectCutRenderPage struct {
	Tasks      []model.Task `json:"tasks"`
	NextCursor string       `json:"nextCursor,omitempty"`
}

func (s *Service) ListProjectCutRenders(userID, projectID, cutID, cursor string, limit int) (ProjectCutRenderPage, error) {
	result := ProjectCutRenderPage{Tasks: []model.Task{}}
	if limit < 1 || limit > 20 || len(cursor) > 80 {
		return result, BadAuthRequest("导出记录分页无效")
	}
	cut, err := s.GetProjectCut(userID, projectID, cutID)
	if err != nil {
		return result, err
	}
	before := time.Time{}
	if cursor != "" {
		row, err := s.repo.TaskForUser(userID, cursor)
		var input timelineRenderInput
		if err != nil || row.ProjectID != projectID || row.Type != model.TaskTypeTimelineRender || json.Unmarshal([]byte(row.InputJSON), &input) != nil || input.CutID != cutID || input.CutSHA256 != cut.Cut.TimelineSHA256 {
			return result, BadAuthRequest("导出分页不属于此固定版本")
		}
		before = row.CreatedAt
	}
	rows, err := s.repo.ProjectCutRenderTaskPage(userID, projectID, cutID, before, cursor, limit)
	if err != nil {
		return result, err
	}
	if len(rows) > limit {
		rows = rows[:limit]
		result.NextCursor = rows[len(rows)-1].ID
	}
	for _, row := range rows {
		var input timelineRenderInput
		if row.Provider != "local" || row.Model != "ffmpeg" || json.Unmarshal([]byte(row.InputJSON), &input) != nil || input.CutID != cutID || input.CutSHA256 != cut.Cut.TimelineSHA256 {
			return ProjectCutRenderPage{}, NewAppError(500, "导出记录与固定版本不匹配，请保留原任务后检查")
		}
		published := taskForOutput(row)
		published.InputJSON = ""
		result.Tasks = append(result.Tasks, *published)
	}
	return result, nil
}

func (s *Service) ReadProjectCutRender(userID, projectID, cutID, requestID string) (*model.Task, error) {
	if !validCutRequestID(requestID) {
		return nil, BadAuthRequest("导出编号无效")
	}
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return nil, NotFound("项目不存在或无权查看")
	}
	taskID := mediaAnalysisID("cut-render-v1", userID, projectID, requestID)
	task, err := s.repo.TaskForUser(userID, taskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, NotFound("此导出编号尚无已保存任务，请保留原编号核对")
	}
	if err != nil {
		return nil, err
	}
	var input timelineRenderInput
	if task.ProjectID != projectID || task.Type != model.TaskTypeTimelineRender || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.CutID != cutID {
		return nil, NotFound("导出任务不属于此剪辑版本")
	}
	return taskForOutput(*task), nil
}

func (s *Service) existingProjectCutRender(userID, projectID string, intent timelineCutRenderContext) (*model.Task, error) {
	task, err := s.repo.TaskForUser(userID, intent.TaskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var input timelineRenderInput
	if task.ProjectID != projectID || task.Type != model.TaskTypeTimelineRender || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.RequestSHA256 != intent.RequestSHA256 || input.CutID != intent.CutID || input.CutSHA256 != intent.CutSHA256 {
		return nil, cutConflict("此导出编号已经用于其他内容，请核对原导出任务")
	}
	return taskForOutput(*task), nil
}

// A fixed cut is rendered on the server without loading it over the working
// edit. Its output profile and exact source identities are frozen in the task.
func (s *Service) CreateProjectCutRender(userID, projectID, cutID string, request ProjectCutRenderRequest) (*model.Task, error) {
	if !validCutRequestID(request.RequestID) || len(request.TimelineSHA256) != 64 {
		return nil, BadAuthRequest("请提供导出编号和固定剪辑摘要")
	}
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return nil, NotFound("项目不存在或无权查看")
	}
	intent := timelineCutRenderContext{TaskID: mediaAnalysisID("cut-render-v1", userID, projectID, request.RequestID), CutID: cutID, CutSHA256: request.TimelineSHA256, RequestSHA256: cutSignature(struct {
		Project, Cut string
		Request      ProjectCutRenderRequest
	}{projectID, cutID, request})}
	if previous, err := s.existingProjectCutRender(userID, projectID, intent); err != nil || previous != nil {
		return previous, err
	}
	cut, err := s.GetProjectCut(userID, projectID, cutID)
	if err != nil {
		return nil, err
	}
	if cut.Cut.Archived || cut.Cut.TimelineSHA256 != request.TimelineSHA256 {
		return nil, cutConflict("剪辑版本已归档或摘要不匹配，请重新读取后导出")
	}
	if len(cut.DeliveryBlockers) > 0 {
		return nil, cutDeliveryPending()
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return nil, err
	}
	ratio := cut.Cut.AspectRatio
	if ratio == "" {
		ratio = project.AspectRatio
	}
	intent.Output, err = timelineOutputFormat(ratio)
	if err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if len(cut.Metadata) > 0 {
		var metadata struct {
			RenderOutput  *timelineRenderFormat `json:"renderOutput"`
			PreservedOnly []string              `json:"preservedOnly"`
		}
		if json.Unmarshal(cut.Metadata, &metadata) != nil {
			return nil, NewAppError(500, "剪辑版本的导出设置无法读取")
		}
		if len(metadata.PreservedOnly) > 0 {
			return nil, BadAuthRequest("此旧版仍有未转换的高级设置，请先核对转换报告并完成编辑，再保存为新版本导出")
		}
		if metadata.RenderOutput != nil {
			intent.Output = *metadata.RenderOutput
		}
	}
	if err := validateTimelineOutput(intent.Output); err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if stored, err := production.TimelineDocumentOutput(cut.Timeline); err != nil {
		return nil, BadAuthRequest("固定剪辑的画面设置无效")
	} else if stored != nil {
		intent.Output = *stored
	}
	var timeline renderProject
	if err := json.Unmarshal(cut.Timeline, &timeline); err != nil {
		return nil, NewAppError(500, "固定剪辑无法读取")
	}
	return s.CreateTimelineRenderTask(userID, TimelineRenderCreateRequest{ProjectID: projectID, Timeline: timeline, AspectRatio: ratio, cutRender: &intent})
}
