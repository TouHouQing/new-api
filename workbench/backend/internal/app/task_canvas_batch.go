package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type CreateCanvasTaskBatchRequest struct {
	Root           *CanvasTaskDraft    `json:"root,omitempty"`
	RetiredNodeIDs []string            `json:"retiredNodeIds,omitempty"`
	Tasks          []CreateTaskRequest `json:"tasks"`
}

func (s *Service) CreateCanvasTaskBatch(userID string, request CreateCanvasTaskBatchRequest) ([]model.Task, error) {
	if s.IsDraining() {
		return nil, &AppError{Status: 503, Code: 503, Message: "服务正在维护，暂不接受新的生成批次", Retryable: true}
	}
	if len(request.Tasks) < 2 || len(request.Tasks) > 15 || len(request.RetiredNodeIDs) > 15 {
		return nil, BadAuthRequest("生成批次须包含2到15个任务")
	}
	raw, err := json.Marshal(request)
	if err != nil || len(raw) > 4*1024*1024 {
		return nil, BadAuthRequest("生成批次内容过大或无效")
	}
	var req CreateCanvasTaskBatchRequest
	if err = json.Unmarshal(raw, &req); err != nil {
		return nil, BadAuthRequest("生成批次内容无效")
	}
	digest := projectCreationHash(raw)
	canvasID := req.Tasks[0].ProjectID
	mode := req.Tasks[0].Type
	if canvasID == "" || (mode != "canvas_image" && mode != "canvas_text") {
		return nil, BadAuthRequest("当前批次支持同一画布的图片或文本生成")
	}
	drafts := make([]*canvasTaskDraft, len(req.Tasks))
	intents := make([]*publicTaskIntent, len(req.Tasks))
	seenNodes, seenIntents := map[string]bool{}, map[string]bool{}
	for index := range req.Tasks {
		item := &req.Tasks[index]
		item.TraceID, item.RequestID = request.Tasks[index].TraceID, request.Tasks[index].RequestID
		if item.ProjectID != canvasID || item.Type != mode {
			return nil, BadAuthRequest("批次任务须属于同一画布与生成类型")
		}
		metadata, _ := item.Input["metadata"].(map[string]any)
		if metadata == nil {
			return nil, BadAuthRequest("批次缺少原生节点草稿")
		}
		if _, exists := metadata["canvasBatchIntentSha256"]; exists {
			return nil, BadAuthRequest("批次确认摘要由服务端生成")
		}
		metadata["canvasBatchIntentSha256"] = digest
		encoded, _ := json.Marshal(item.Input)
		drafts[index], err = canvasTaskDraftFor(model.Task{ProjectID: canvasID, Type: item.Type, InputJSON: string(encoded)})
		if err != nil {
			return nil, err
		}
		if drafts[index] == nil {
			return nil, BadAuthRequest("每个批次任务须包含原生节点草稿")
		}
		nodeID := stringValue(drafts[index].Node["id"])
		if seenNodes[nodeID] {
			return nil, BadAuthRequest("批次目标节点不能重复")
		}
		seenNodes[nodeID] = true
		intents[index], err = publicTaskIntentForRequest(userID, *item)
		if err != nil {
			return nil, err
		}
		if intents[index] == nil || seenIntents[intents[index].ID] {
			return nil, BadAuthRequest("批次中的生成操作编号缺失或重复")
		}
		seenIntents[intents[index].ID] = true
	}
	replay := func(service *Service) ([]model.Task, bool, error) {
		tasks := make([]model.Task, 0, len(intents))
		for _, intent := range intents {
			task, err := service.replayPublicTaskIntent(userID, intent)
			if err == nil {
				tasks = append(tasks, *task)
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, false, err
			}
		}
		if len(tasks) == len(intents) {
			return tasks, true, nil
		}
		if len(tasks) > 0 {
			return nil, false, creationConflict("原批次任务记录不完整，请保留现有记录并核对待生成部分")
		}
		return nil, false, nil
	}
	if tasks, found, err := replay(s); found || err != nil {
		return tasks, err
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	var result []model.Task
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		if err := repo.LockCanvasMutation(userID, canvasID); err != nil {
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir, disablePiRuntime: true}
		if existing, found, err := replay(writer); found || err != nil {
			result = existing
			return err
		}
		if err := seedCanvasTaskBatch(repo, userID, canvasID, req, drafts, policy); err != nil {
			return err
		}
		for index, item := range req.Tasks {
			task, err := writer.CreateTask(userID, item)
			if err != nil {
				return fmt.Errorf("第%d项未提交，整批未执行：%w", index+1, err)
			}
			result = append(result, *task)
		}
		return nil
	})
	if err != nil {
		if existing, found, replayErr := replay(s); found || replayErr != nil {
			return existing, replayErr
		}
		return nil, err
	}
	s.wakeTaskDispatcher()
	return result, nil
}
