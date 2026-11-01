package app

import (
	"encoding/base64"
	"encoding/json"
	"time"
	"yingce/backend/internal/production"
)

type VideoReworkHistoryEntry struct {
	TaskID        string                        `json:"taskId"`
	Status        string                        `json:"status"`
	CreatedAt     time.Time                     `json:"createdAt"`
	SourceStartMs int64                         `json:"sourceStartMs"`
	SourceEndMs   int64                         `json:"sourceEndMs"`
	Audio         string                        `json:"audio"`
	Region        *production.VideoReworkRegion `json:"region,omitempty"`
}
type VideoReworkHistory struct {
	Entries    []VideoReworkHistoryEntry `json:"entries"`
	NextCursor string                    `json:"nextCursor,omitempty"`
}

func (s *Service) ReadVideoReworkHistory(userID, projectID, clipID, cursor string, limit int) (VideoReworkHistory, error) {
	result := VideoReworkHistory{Entries: []VideoReworkHistoryEntry{}}
	if limit < 1 || limit > 50 || len(cursor) > 1024 {
		return result, BadAuthRequest("修复历史分页参数无效")
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if _, _, err = production.ReadVideoReworkClip(timeline.Timeline, clipID); err != nil {
		return result, BadAuthRequest("请从当前剪辑选择具体视频片段，再读取它的修复历史")
	}
	scope := projectCreationHash([]byte(userID + "\x00" + projectID + "\x00" + clipID + "\x00video-rework-history-v1"))
	var before imageLayerPlanningCursor
	if cursor != "" {
		raw, err := base64.RawURLEncoding.DecodeString(cursor)
		if err != nil || json.Unmarshal(raw, &before) != nil || before.Scope != scope || before.Time.IsZero() || validateCloudAgentID(before.ID, "修复历史任务ID", 128) != nil {
			return result, BadAuthRequest("修复历史游标不属于当前片段，请重新加载")
		}
	}
	rows, err := s.repo.VideoReworkTasks(userID, projectID, clipID, before.Time, before.ID, limit+1)
	if err != nil {
		return result, err
	}
	more := len(rows) > limit
	if more {
		rows = rows[:limit]
	}
	for _, task := range rows {
		input, err := decodeVideoReworkInput(&task)
		if err != nil || input.Request.Edit.ClipID != clipID {
			continue
		}
		r := input.Request.Edit
		result.Entries = append(result.Entries, VideoReworkHistoryEntry{TaskID: task.ID, Status: string(task.Status), CreatedAt: task.CreatedAt, SourceStartMs: r.SourceStartMs, SourceEndMs: r.SourceEndMs, Audio: r.Audio, Region: r.Region})
	}
	if more && len(rows) > 0 {
		last := rows[len(rows)-1]
		raw, _ := json.Marshal(imageLayerPlanningCursor{Scope: scope, Time: last.CreatedAt, ID: last.ID})
		result.NextCursor = base64.RawURLEncoding.EncodeToString(raw)
	}
	return result, nil
}
