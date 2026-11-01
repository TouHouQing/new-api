package app

import (
	"strings"
	"time"
	_ "time/tzdata"

	"yingce/backend/internal/repository"
)

type TaskHistoryRequest struct {
	Page      int
	PageSize  int
	ProjectID string
	Query     string
	Kind      string
	Model     string
	Status    string
	TimeZone  string
}

type TaskHistoryCanvas struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	ProjectID string `json:"projectId,omitempty"`
}

type TaskHistoryPage struct {
	Tasks    []TaskSummary               `json:"tasks"`
	Page     int                         `json:"page"`
	PageSize int                         `json:"pageSize"`
	Total    int64                       `json:"total"`
	Stats    repository.TaskHistoryStats `json:"stats"`
	Canvases []TaskHistoryCanvas         `json:"canvases"`
	Models   []string                    `json:"models"`
}

func (s *Service) TaskHistory(userID string, req TaskHistoryRequest) (TaskHistoryPage, error) {
	result := TaskHistoryPage{Page: req.Page, PageSize: req.PageSize, Tasks: []TaskSummary{}, Canvases: []TaskHistoryCanvas{}, Models: []string{}}
	req.Query, req.ProjectID = strings.TrimSpace(req.Query), strings.TrimSpace(req.ProjectID)
	if strings.TrimSpace(userID) == "" || req.Page < 1 || req.Page > 1_000_000 || req.PageSize < 1 || req.PageSize > 100 || len(req.ProjectID) > 80 || len(req.Query) > 1024 || len(req.Model) > 512 || len(req.TimeZone) > 80 || strings.ContainsAny(req.TimeZone, "\x00\r\n") {
		return result, BadAuthRequest("创作历史分页或搜索参数无效")
	}
	if req.Kind != "" && req.Kind != "text" && req.Kind != "image" && req.Kind != "video" && req.Kind != "audio" || req.Status != "" && req.Status != "active" && req.Status != "succeeded" && req.Status != "failed" && req.Status != "recorded" {
		return result, BadAuthRequest("创作历史类型或状态筛选无效")
	}
	if req.TimeZone == "" {
		req.TimeZone = "UTC"
	}
	if req.TimeZone == "Local" {
		return result, BadAuthRequest("请提供明确的地区时区")
	}
	zone, err := time.LoadLocation(req.TimeZone)
	if err != nil {
		return result, BadAuthRequest("创作历史时区无效")
	}
	now := time.Now().In(zone)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, zone)
	filter := repository.TaskHistoryFilter{ProjectID: req.ProjectID, Query: req.Query, Kind: req.Kind, Model: req.Model, Status: req.Status}
	rows, total, stats, err := s.repo.TaskHistory(userID, filter, req.Page, req.PageSize, start.UTC(), start.AddDate(0, 0, 1).UTC())
	if err != nil {
		return result, err
	}
	result.Tasks, err = s.taskSummariesForUser(userID, rows)
	if err != nil {
		return result, err
	}
	canvases, models, err := s.repo.TaskHistoryFacets(userID)
	if err != nil {
		return result, err
	}
	for _, canvas := range canvases {
		result.Canvases = append(result.Canvases, TaskHistoryCanvas{ID: canvas.ID, Title: canvas.Title, ProjectID: canvas.ProjectID})
	}
	if models != nil {
		result.Models = models
	}
	result.Total, result.Stats = total, stats
	return result, nil
}
