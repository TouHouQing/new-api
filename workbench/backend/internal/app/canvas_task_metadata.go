package app

import (
	"time"
	"yingce/backend/internal/model"
)

func applyNativeCanvasTaskMetadata(metadata map[string]any, task *model.Task) {
	metadata["taskId"], metadata["taskType"], metadata["taskStatus"] = task.ID, task.Type, string(task.Status)
	metadata["taskProgress"], metadata["taskStage"] = task.Progress, task.Stage
	if task.MediaStage != "" {
		metadata["taskMediaStage"] = task.MediaStage
	} else {
		delete(metadata, "taskMediaStage")
	}
	if task.ClientOperationID != "" {
		metadata["taskClientOperationId"] = task.ClientOperationID
	} else {
		delete(metadata, "taskClientOperationId")
	}
	for key, value := range map[string]*time.Time{"taskStartedAt": task.StartedAt, "taskCompletedAt": task.CompletedAt} {
		if value == nil {
			delete(metadata, key)
		} else {
			metadata[key] = value.UTC().Format(time.RFC3339Nano)
		}
	}
	for key, value := range map[string]time.Time{"taskCreatedAt": task.CreatedAt, "taskUpdatedAt": task.UpdatedAt} {
		if value.IsZero() {
			delete(metadata, key)
		} else {
			metadata[key] = value.UTC().Format(time.RFC3339Nano)
		}
	}
}

func commitNativeCanvasProducedModel(metadata map[string]any, task *model.Task) {
	produced := stringValue(metadata["producedModelCandidate"])
	if produced == "" {
		produced = task.LogicalModelID
		if produced == "" {
			produced = task.Model
		}
	}
	delete(metadata, "producedModelCandidate")
	delete(metadata, "producedModel")
	if produced != "" {
		metadata["producedModel"] = produced
	}
}
