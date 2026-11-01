package app

import (
	"context"
	"encoding/json"
	"errors"

	"gorm.io/gorm"
	"yingce/backend/internal/repository"
)

// An older release could acknowledge only the first image. Recover its exact
// existing target; finished groups, undo, deletion and reassignment are retained.
// This only schedules native delivery and never touches model state or billing.
func (s *Service) repairLegacyDedicatedCanvasDeliveries(ctx context.Context) error {
	for after := ""; ; {
		rows, err := s.repo.WithContext(ctx).LegacyDedicatedCanvasDeliveries(after)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for _, candidate := range rows {
			after = candidate.ID
			if !isDedicatedLayerTask(&candidate) {
				continue
			}
			err := s.repo.WithContext(ctx).Transaction(func(repo *repository.Repository) error {
				if err := repo.LockCanvasTaskMutation(candidate.ID); err != nil {
					return err
				}
				task, err := repo.TaskForUser(candidate.UserID, candidate.ID)
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return nil
				}
				if err != nil {
					return err
				}
				if !isDedicatedLayerTask(task) || (task.CanvasDeliveryStatus != "" && task.CanvasDeliveryStatus != "applied") {
					return nil
				}
				project, err := repo.CanvasProjectForUser(task.UserID, task.ProjectID)
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return nil
				}
				if err != nil {
					return err
				}
				var input struct {
					Metadata struct {
						NodeID string `json:"nodeId"`
					} `json:"metadata"`
				}
				if json.Unmarshal([]byte(task.InputJSON), &input) != nil || validateCloudAgentID(input.Metadata.NodeID, "拆层目标", 80) != nil {
					return nil
				}
				doc, err := creationDocument(project.PayloadJSON)
				if err != nil {
					return err
				}
				for _, node := range creationMaps(doc["nodes"]) {
					meta, _ := node["metadata"].(map[string]any)
					if node["id"] == input.Metadata.NodeID && node["type"] == "image" && meta["taskId"] == task.ID && meta["imageLayerGroup"] == nil && meta["nativeLayerDecomposition"] == nil {
						return repo.RequeueDedicatedCanvasDelivery(task)
					}
				}
				return nil
			})
			if err != nil {
				return err
			}
		}
	}
}
