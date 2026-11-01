package app

import (
	"encoding/base64"
	"encoding/json"
	"time"

	"yingce/backend/internal/imageops"
)

type imageLayerPlanningHistoryEntry struct {
	TaskID    string    `json:"taskId"`
	Status    string    `json:"status"`
	Model     string    `json:"model"`
	CreatedAt time.Time `json:"createdAt"`
	Legacy    bool      `json:"legacy"`
	Planning  any       `json:"planning,omitempty"`
}

type imageLayerPlanningHistory struct {
	Source     imageops.Source                  `json:"source"`
	Entries    []imageLayerPlanningHistoryEntry `json:"entries"`
	NextCursor string                           `json:"nextCursor,omitempty"`
}

type imageLayerPlanningCursor struct {
	Scope string    `json:"scope"`
	Time  time.Time `json:"time"`
	ID    string    `json:"id"`
}

func (s *Service) ReadImageLayerPlanningHistory(userID, canvasID, sourceNodeID, resourceID, cursor string, limit int) (imageLayerPlanningHistory, error) {
	result := imageLayerPlanningHistory{Entries: []imageLayerPlanningHistoryEntry{}}
	if limit < 1 || limit > 50 || len(cursor) > 1024 {
		return result, BadAuthRequest("识图规划历史分页无效")
	}
	source, err := s.nativeImageEditSource(userID, canvasID, sourceNodeID, resourceID)
	if err != nil {
		return result, err
	}
	result.Source = source
	scope := projectCreationHash([]byte(userID + "\x00" + canvasID + "\x00" + sourceNodeID + "\x00" + resourceID))
	var before imageLayerPlanningCursor
	if cursor != "" {
		raw, err := base64.RawURLEncoding.DecodeString(cursor)
		if err != nil || json.Unmarshal(raw, &before) != nil || before.Scope != scope || before.Time.IsZero() || validateCloudAgentID(before.ID, "规划历史任务ID", 128) != nil {
			return result, BadAuthRequest("识图规划游标与当前原图不匹配")
		}
	}
	rows, err := s.repo.ImageLayerPlanningTasks(userID, canvasID, sourceNodeID, before.Time, before.ID, limit+1)
	if err != nil {
		return result, err
	}
	more := len(rows) > limit
	if more {
		rows = rows[:limit]
	}
	for _, task := range rows {
		var input struct {
			Metadata map[string]any `json:"metadata"`
		}
		if json.Unmarshal([]byte(task.InputJSON), &input) != nil {
			continue
		}
		if stringValue(input.Metadata["sourceNodeId"]) != sourceNodeID || stringValue(input.Metadata["sourceStorageKey"]) != "resource:"+resourceID {
			continue
		}
		entry := imageLayerPlanningHistoryEntry{TaskID: task.ID, Status: string(task.Status), Model: task.Model, CreatedAt: task.CreatedAt, Legacy: true}
		if input.Metadata["nativeLayerPlanning"] != nil {
			plan, err := decodeNativeLayerPlanning(input.Metadata["nativeLayerPlanning"])
			if err != nil || plan.Source != source || plan.ResourceID != resourceID {
				continue
			}
			entry.Legacy = false
			var output map[string]any
			if json.Unmarshal([]byte(task.ResultJSON), &output) == nil {
				entry.Planning = output["imageLayerPlanning"]
			}
		}
		result.Entries = append(result.Entries, entry)
	}
	if more && len(rows) > 0 {
		last := rows[len(rows)-1]
		raw, _ := json.Marshal(imageLayerPlanningCursor{Scope: scope, Time: last.CreatedAt, ID: last.ID})
		result.NextCursor = base64.RawURLEncoding.EncodeToString(raw)
	}
	return result, nil
}
