package app

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

type TaskPageRequest struct {
	Limit      int
	ProjectID  string
	Type       string
	ActiveOnly bool
	Cursor     string
}
type TaskSummaryPage struct {
	Tasks      []TaskSummary `json:"tasks"`
	NextCursor string        `json:"nextCursor,omitempty"`
}
type taskPageCursor struct {
	Version    int        `json:"v"`
	CreatedAt  *time.Time `json:"at"`
	ID         string     `json:"id"`
	ProjectID  string     `json:"p,omitempty"`
	Type       string     `json:"t,omitempty"`
	ActiveOnly bool       `json:"a,omitempty"`
}

func (s *Service) TaskPage(userID string, input TaskPageRequest) (TaskSummaryPage, error) {
	input.ProjectID, input.Type = strings.TrimSpace(input.ProjectID), strings.TrimSpace(input.Type)
	if input.Limit < 1 || input.Limit > 100 || len(input.ProjectID) > 80 || len(input.Type) > 64 || len(input.Cursor) > 1024 {
		return TaskSummaryPage{}, BadAuthRequest("任务分页参数无效")
	}
	before := taskPageCursor{}
	if input.Cursor != "" {
		raw, err := base64.RawURLEncoding.DecodeString(input.Cursor)
		if err != nil || json.Unmarshal(raw, &before) != nil || before.Version != 1 || before.ID == "" || len(before.ID) > 80 || before.CreatedAt == nil || before.ProjectID != input.ProjectID || before.Type != input.Type || before.ActiveOnly != input.ActiveOnly {
			return TaskSummaryPage{}, BadAuthRequest("任务游标无效或不属于当前筛选，请重新加载")
		}
	}
	beforeTime := time.Time{}
	if before.CreatedAt != nil {
		beforeTime = *before.CreatedAt
	}
	tasks, err := s.repo.TaskPageAfter(userID, input.ProjectID, input.Type, input.ActiveOnly, beforeTime, before.ID, input.Limit)
	if err != nil {
		return TaskSummaryPage{}, err
	}
	page := TaskSummaryPage{}
	if len(tasks) > input.Limit {
		tasks = tasks[:input.Limit]
		last := tasks[len(tasks)-1]
		raw, _ := json.Marshal(taskPageCursor{Version: 1, CreatedAt: &last.CreatedAt, ID: last.ID, ProjectID: input.ProjectID, Type: input.Type, ActiveOnly: input.ActiveOnly})
		page.NextCursor = base64.RawURLEncoding.EncodeToString(raw)
	}
	page.Tasks, err = s.taskSummariesForUser(userID, tasks)
	return page, err
}
