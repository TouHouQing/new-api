package app

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"strings"
	"time"
)

type CloudAgentHistoryRequest struct {
	CanvasID, Cursor string
	Limit            int
}
type CloudAgentHistoryItem struct {
	ID        string    `json:"id"`
	CanvasID  string    `json:"canvasId"`
	ParentID  string    `json:"parentId,omitempty"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type CloudAgentHistoryPage struct {
	Items      []CloudAgentHistoryItem `json:"items"`
	NextCursor string                  `json:"nextCursor,omitempty"`
	HasMore    bool                    `json:"hasMore"`
}
type cloudAgentLegacyHistoryCursor struct {
	Version   int       `json:"v"`
	CanvasID  string    `json:"c"`
	CreatedAt time.Time `json:"t"`
	ID        string    `json:"i"`
}
type CloudAgentRunRestore struct {
	Run    *CloudAgentRun `json:"run"`
	Prompt string         `json:"prompt"`
}

func (s *Service) CloudAgentHistory(userID string, req CloudAgentHistoryRequest) (CloudAgentHistoryPage, error) {
	page := CloudAgentHistoryPage{Items: []CloudAgentHistoryItem{}}
	if strings.TrimSpace(userID) == "" {
		return page, Unauthorized("请先登录")
	}
	if validateCloudAgentID(req.CanvasID, "画布ID", 80) != nil || req.Limit < 1 || req.Limit > 50 || len(req.Cursor) > 1024 {
		return page, BadAuthRequest("历史记录分页参数无效")
	}
	if _, err := s.repo.CanvasProjectForUser(userID, req.CanvasID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return page, NotFound("画布不存在或无权访问")
		}
		return page, err
	}
	var before *time.Time
	beforeID := ""
	if req.Cursor != "" {
		var cursor cloudAgentLegacyHistoryCursor
		raw, err := base64.RawURLEncoding.DecodeString(req.Cursor)
		if err != nil || json.Unmarshal(raw, &cursor) != nil || cursor.Version != 1 || cursor.CanvasID != req.CanvasID || cursor.CreatedAt.IsZero() || validateCloudAgentID(cursor.ID, "历史记录ID", 80) != nil {
			return page, BadAuthRequest("历史记录游标无效，请重新读取")
		}
		before, beforeID = &cursor.CreatedAt, cursor.ID
	}
	rows, err := s.repo.CloudAgentHistoryPage(userID, req.CanvasID, before, beforeID, req.Limit+1)
	if err != nil {
		return page, err
	}
	page.HasMore = len(rows) > req.Limit
	if page.HasMore {
		rows = rows[:req.Limit]
	}
	for _, row := range rows {
		page.Items = append(page.Items, CloudAgentHistoryItem{ID: row.ID, CanvasID: row.CanvasID, ParentID: row.ParentID, Title: row.Title, Status: row.Status, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt})
	}
	if page.HasMore {
		last := rows[len(rows)-1]
		raw, _ := json.Marshal(cloudAgentLegacyHistoryCursor{Version: 1, CanvasID: req.CanvasID, CreatedAt: last.CreatedAt, ID: last.ID})
		page.NextCursor = base64.RawURLEncoding.EncodeToString(raw)
	}
	return page, nil
}

func (s *Service) RestoreCloudAgentRun(userID, id string) (*CloudAgentRunRestore, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, Unauthorized("请先登录")
	}
	run, err := s.CloudAgentRun(userID, id)
	if err != nil {
		return nil, err
	}
	task, err := s.repo.TaskForUser(userID, id)
	if err != nil {
		return nil, err
	}
	return &CloudAgentRunRestore{Run: run, Prompt: task.Prompt}, nil
}
