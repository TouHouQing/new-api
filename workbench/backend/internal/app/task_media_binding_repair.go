package app

import (
	"encoding/json"
	"strings"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// Explicit recovery of an already saved output only fills missing fixed-version
// bindings. It never calls the provider, re-downloads media or replays delivery.
func (s *Service) repairSucceededTaskMediaBindings(task *model.Task) (*model.Task, error) {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		current, err := repo.TaskForUser(task.UserID, task.ID)
		if err != nil {
			return err
		}
		if current.Status != model.TaskStatusSucceeded || current.MediaRecoveryJSON == "" {
			return repository.ErrTaskStateConflict
		}
		if current.ProjectID != "" && hasCanvasTaskDraft(*current) {
			if err := repo.LockCanvasTaskMutation(current.ID); err != nil {
				return err
			}
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(current); err != nil {
			return err
		}
		checkpoint, err := writer.decodeMediaCheckpoint(current)
		if err != nil {
			return err
		}
		var result map[string]any
		if err := json.Unmarshal([]byte(current.ResultJSON), &result); err != nil {
			return err
		}
		outputs := taskMediaBindingOutputs(result, checkpoint.Mode)
		if len(outputs) != len(checkpoint.Items) {
			return BadAuthRequest("已保存的作品与原检查点数量不一致")
		}
		edit, signature, err := nativeImageEditForTask(current)
		if err != nil {
			return err
		}
		for index, item := range checkpoint.Items {
			if item.ResourceID == "" || stringValue(outputs[index]["storageKey"]) != "resource:"+item.ResourceID || edit != nil && item.NativeImageEditSHA256 != signature {
				return BadAuthRequest("已保存的作品不匹配原资源或处理回执")
			}
		}
		oldResult := current.ResultJSON
		if err := writer.registerRecoveredMediaAssets(*current); err != nil {
			return err
		}
		if err := writer.bindTaskMediaAssetVersions(current); err != nil {
			return err
		}
		usage, err := repo.UserStorageUsage(current.UserID)
		if err != nil {
			return err
		}
		if err := validateTaskDataGrowthQuotaWithPolicy(usage, int64(len(current.ResultJSON)-len(oldResult)), policy.Resource); err != nil {
			return err
		}
		if err := repo.SaveSucceededTaskMediaBindings(current, oldResult); err != nil {
			return err
		}
		if current.ProjectID != "" && hasCanvasTaskDraft(*current) {
			if err := pinRecoveredCanvasMediaVersions(repo, current, policy); err != nil {
				return err
			}
		}
		*task = *current
		return nil
	})
	if err != nil {
		return nil, err
	}
	return taskForOutput(*task), nil
}

func pinRecoveredCanvasMediaVersions(repo *repository.Repository, task *model.Task, policy RuntimePolicySetting) error {
	canvas, err := repo.CanvasProjectForUser(task.UserID, task.ProjectID)
	if err != nil {
		return err
	}
	doc, err := creationDocument(canvas.PayloadJSON)
	if err != nil {
		return err
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(task.ResultJSON), &result); err != nil {
		return err
	}
	outputs := taskMediaBindingOutputs(result, capabilityFromTaskType(task.Type))
	changed := false
	for _, node := range creationMaps(doc["nodes"]) {
		meta, _ := node["metadata"].(map[string]any)
		if stringValue(meta["taskId"]) != task.ID || strings.TrimSpace(stringValue(meta["assetVersionId"])) != "" {
			continue
		}
		for _, output := range outputs {
			if stringValue(output["assetVersionId"]) != "" && stringValue(meta["storageKey"]) == stringValue(output["storageKey"]) && stringValue(meta["assetId"]) == stringValue(output["assetId"]) {
				meta["assetVersionId"] = output["assetVersionId"]
				changed = true
			}
		}
	}
	if changed {
		return saveCloudAgentDocument(repo, canvas, doc, policy)
	}
	return nil
}
