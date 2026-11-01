package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type cloudAgentImageOperationArgs struct {
	SourceNodeID string          `json:"sourceNodeId"`
	Recipe       imageops.Recipe `json:"recipe"`
}

func cloudAgentImageOperationSchema() map[string]any {
	object := func(properties map[string]any, required ...string) map[string]any {
		return map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
	}
	fraction := func() map[string]any { return map[string]any{"type": "number", "minimum": 0, "maximum": 1} }
	lines := map[string]any{"type": "array", "maxItems": 11, "items": fraction(), "description": "可选，升序0到1分割线，数量等于行/列数减一"}
	count := map[string]any{"type": "integer", "minimum": 1, "maximum": 12}
	return map[string]any{
		"sourceNodeId": map[string]any{"type": "string", "description": "当前画布上已保存图片节点ID"},
		"recipe": object(map[string]any{
			"operation": map[string]any{"type": "string", "enum": []string{"split", "crop", "resize", "mask"}, "description": "只传同名配方，其余省略；遮罩坐标为原图像素"},
			"split":     object(map[string]any{"rows": count, "columns": count, "horizontalLines": lines, "verticalLines": lines}, "rows", "columns"),
			"crop":      object(map[string]any{"x": fraction(), "y": fraction(), "width": fraction(), "height": fraction()}, "x", "y", "width", "height"),
			"resize":    object(map[string]any{"targetLongEdge": map[string]any{"type": "integer", "minimum": 1, "maximum": 4096}, "algorithm": map[string]any{"type": "string", "enum": []string{"nearest", "bilinear", "high"}}}, "targetLongEdge", "algorithm"),
			"mask": object(map[string]any{
				"width":  map[string]any{"type": "integer", "minimum": 1, "maximum": 16777216},
				"height": map[string]any{"type": "integer", "minimum": 1, "maximum": 16777216},
				"mode":   map[string]any{"type": "string", "enum": []string{"keep", "remove"}},
				"strokes": map[string]any{"type": "array", "minItems": 1, "maxItems": 256, "items": object(map[string]any{
					"diameter": map[string]any{"type": "number", "minimum": 1, "maximum": 4096},
					"erase":    map[string]any{"type": "boolean"},
					"points":   map[string]any{"type": "array", "minItems": 1, "maxItems": 8192, "items": map[string]any{"type": "array", "minItems": 2, "maxItems": 2, "items": map[string]any{"type": "number", "minimum": -4096, "maximum": 16781312}}},
				}, "diameter", "erase", "points")},
			}, "width", "height", "mode", "strokes"),
		}, "operation"),
	}
}

func decodeCloudAgentImageOperation(call cloudAgentCall) (cloudAgentImageOperationArgs, error) {
	var args cloudAgentImageOperationArgs
	decoder := json.NewDecoder(bytes.NewBufferString(call.Function.Arguments))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&args)
	var extra any
	if err != nil || decoder.Decode(&extra) != io.EOF || validateCloudAgentID(args.SourceNodeID, "源图片节点ID", 128) != nil {
		return args, BadAuthRequest("请提供源图片节点和单一处理配方，不能指定其他画布或资源")
	}
	switch args.Recipe.Operation {
	case "split", "crop", "resize", "mask":
	default:
		return args, BadAuthRequest("此图片处理工具支持切分、裁剪、插值缩放和遮罩；图层组合请使用图层工作流，不能混入其他配方")
	}
	return args, nil
}

func cloudAgentImageOperationRequestID(runID string, args cloudAgentImageOperationArgs) string {
	return "agent-image:" + imageOperationID(runID, creationHash(args))
}

func cloudAgentImageOperationSource(repo *repository.Repository, userID, canvasID, nodeID, expectedKey string) (string, string, error) {
	project, err := repo.CanvasProjectForUser(userID, canvasID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", "", NotFound("原画布已删除")
	}
	if err != nil {
		return "", "", err
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		return "", "", err
	}
	for _, node := range creationMaps(doc["nodes"]) {
		if node["id"] != nodeID {
			continue
		}
		metadata, _ := node["metadata"].(map[string]any)
		if metadata["imageLayerGroup"] != nil {
			guard := &Service{repo: repo}
			if err := guard.requireReadyImageLayerGroup(userID, canvasID, nodeID); err != nil {
				return "", "", err
			}
		}
		key := stringValue(metadata["storageKey"])
		if node["type"] != "image" || !strings.HasPrefix(key, "resource:") || (expectedKey != "" && key != expectedKey) {
			break
		}
		resource, err := repo.ResourceForUser(userID, strings.TrimPrefix(key, "resource:"))
		if err != nil || resource.Status != model.ResourceStatusReady || resource.Kind != "image" {
			return "", "", BadAuthRequest("源图片未就绪或不可访问")
		}
		return key, stringValue(node["title"]), nil
	}
	return "", "", &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "源图片已替换、删除或尚未保存，请重新读取后确认"}
}

func validateCloudAgentImageOperationApproval(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	if state.Approval == nil || state.Approval.ImageOperation == nil || state.Approval.Prepared != nil {
		return errors.New("Agent image approval has no immutable recipe")
	}
	args, err := decodeCloudAgentImageOperation(call)
	if err != nil {
		return err
	}
	input := state.Approval.ImageOperation
	task := imageOperationTask(run.UserID, *input)
	if _, err := decodeImageOperationInput(&task); err != nil {
		return err
	}
	if input.Request.ProjectID != state.Request.CanvasID || input.Request.SourceNodeID != args.SourceNodeID || input.Request.RequestID != cloudAgentImageOperationRequestID(run.ID, args) || creationHash(input.Request.Recipe) != creationHash(args.Recipe) || len(input.Source.SHA256) != 64 {
		return errors.New("Agent image approval does not match its call or source")
	}
	return nil
}

func (s *Service) cloudAgentImageOperationError(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall, phase string, submitted bool, err error) error {
	return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		if state.Approval != nil {
			if err := repo.ReleaseCloudAgentResourceLeases(run.UserID, state.Approval.ID); err != nil {
				return err
			}
		}
		cloudAgentRecordToolResult(current, state, call, map[string]any{"phase": phase, "taskSubmitted": submitted, "usesModel": false}, err)
		state.MediaTaskID = ""
		return cloudAgentSave(current, state)
	})
}

func (s *Service) advanceCloudAgentImageOperation(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	if !cloudAgentToolAllowed(state.Request, "image_process") {
		return s.cloudAgentImageOperationError(run, state, call, "admission", false, Forbidden("当前权限不允许处理图片"))
	}
	if state.MediaTaskID != "" {
		return s.completeCloudAgentImageOperation(run, state, call)
	}
	if state.Approval == nil {
		return s.requestCloudAgentImageOperationApproval(run, state, call)
	}
	if state.Approval.Decision != "approve" {
		return nil
	}
	if err := validateCloudAgentImageOperationApproval(run, state, call); err != nil {
		return s.cloudAgentImageOperationError(run, state, call, "admission", false, BadAuthRequest("审批中的图片配方无效，请重新确认"))
	}
	return s.enqueueCloudAgentImageOperation(run, state, call)
}

func (s *Service) requestCloudAgentImageOperationApproval(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	args, err := decodeCloudAgentImageOperation(call)
	if err != nil {
		return s.cloudAgentImageOperationError(run, state, call, "admission", false, err)
	}
	key, _, err := cloudAgentImageOperationSource(s.repo, run.UserID, state.Request.CanvasID, args.SourceNodeID, "")
	if err != nil {
		return s.cloudAgentImageOperationError(run, state, call, "admission", false, err)
	}
	input, err := s.prepareImageOperationInput(run.UserID, ImageOperationCreateRequest{RequestID: cloudAgentImageOperationRequestID(run.ID, args), ProjectID: state.Request.CanvasID, SourceNodeID: args.SourceNodeID, ResourceID: strings.TrimPrefix(key, "resource:"), Recipe: args.Recipe})
	if err != nil {
		return s.cloudAgentImageOperationError(run, state, call, "admission", false, err)
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		_, sourceTitle, err := cloudAgentImageOperationSource(repo, run.UserID, state.Request.CanvasID, args.SourceNodeID, key)
		if err != nil {
			cloudAgentRecordToolResult(current, state, call, nil, err)
			return cloudAgentSave(current, state)
		}
		title := imageOperationTitle(args.Recipe.Operation)
		details := []string{fmt.Sprintf("原图 %d × %d 像素，生成 %d 个PNG结果", input.Source.Width, input.Source.Height, len(input.Pieces)), "保留原图；结果保存为新素材并添加到原画布；不调用模型"}
		if args.Recipe.Operation == "crop" {
			piece := input.Pieces[0]
			details = append(details, fmt.Sprintf("裁剪区域：(%d, %d)，%d × %d 像素", piece.X, piece.Y, piece.Width, piece.Height))
		} else if args.Recipe.Operation == "resize" {
			piece := input.Pieces[0]
			algorithm := map[string]string{"nearest": "最近邻", "bilinear": "双线性", "high": "高质量"}[args.Recipe.Resize.Algorithm]
			details = append(details, fmt.Sprintf("%s插值：%d × %d 像素；不补画细节", algorithm, piece.OutputWidth, piece.OutputHeight))
		} else if args.Recipe.Operation == "mask" {
			mode := "保留选区"
			if args.Recipe.Mask.Mode == "remove" {
				mode = "移除选区"
			}
			details = append(details, fmt.Sprintf("原像素遮罩：%d × %d，%s，%d 条笔画；保留原图和16位透明度", args.Recipe.Mask.Width, args.Recipe.Mask.Height, mode, len(args.Recipe.Mask.Strokes)))
		} else {
			split := args.Recipe.Split
			layout := fmt.Sprintf("%d 行 × %d 列，按原图像素均分", split.Rows, split.Columns)
			if len(split.HorizontalLines) > 0 || len(split.VerticalLines) > 0 {
				layout = fmt.Sprintf("%d 行 × %d 列；自定义横线 %v，竖线 %v", split.Rows, split.Columns, split.HorizontalLines, split.VerticalLines)
			}
			details = append(details, layout)
		}
		preview := cloudAgentApprovalPreview{Kind: "image_operation", Title: title, Description: "确认本地图片处理，生成费用为0；文件及画布仍受账号配额限制。", Items: []cloudAgentApprovalPreviewItem{{Operation: args.Recipe.Operation, NodeID: args.SourceNodeID, NodeTitle: sourceTitle, NodeType: "image", NodeTypeLabel: "图片", Summary: title, Details: details}}}
		state.Approval = &cloudAgentApproval{ID: fmt.Sprintf("%s-%d-%d", run.ID, state.Step, state.CallIndex), Call: call, CallHash: cloudAgentApprovalCallHash(call), Preview: preview, ImageOperation: &input}
		if err := repo.UpsertCloudAgentResourceLeases(run.UserID, run.ID, state.Approval.ID, []string{input.Request.ResourceID}, time.Now().UTC().Add(2*time.Hour)); err != nil {
			return err
		}
		current.Status = "waiting_approval"
		state.event(run.ID, "approval_requested", map[string]any{"approvalId": state.Approval.ID, "toolName": call.Function.Name, "arguments": json.RawMessage(call.Function.Arguments), "preview": preview, "text": preview.Description})
		return cloudAgentSave(current, state)
	})
}

func (s *Service) enqueueCloudAgentImageOperation(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	if s.IsDraining() {
		return s.cloudAgentImageOperationError(run, state, call, "admission", false, BadAuthRequest("服务维护中，请稍后重新确认"))
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	input := *state.Approval.ImageOperation
	task := imageOperationTask(run.UserID, input)
	task.AgentRunID, task.ApprovalID = run.ID, state.Approval.ID
	s.storageMu.Lock()
	err = s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		if _, _, err := cloudAgentImageOperationSource(repo, run.UserID, state.Request.CanvasID, input.Request.SourceNodeID, input.SourceStorageKey); err != nil {
			if releaseErr := repo.ReleaseCloudAgentResourceLeases(run.UserID, state.Approval.ID); releaseErr != nil {
				return releaseErr
			}
			cloudAgentRecordToolResult(current, state, call, nil, err)
			return cloudAgentSave(current, state)
		}
		existing, err := repo.TaskForUser(run.UserID, task.ID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writer := &Service{repo: repo, pendingStorage: s.pendingStorage}
			if err := writer.requireStoredFileCapacityWhileLocked(run.UserID, task.Type, policy); err != nil {
				return err
			}
			if err := createTaskWithStorageQuotaRepository(repo, &task, nil, policy); err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			frozen, err := decodeImageOperationInput(existing)
			if err != nil || existing.AgentRunID != run.ID || frozen.RequestSHA256 != input.RequestSHA256 || frozen.Source.SHA256 != input.Source.SHA256 {
				return creationConflict("图片处理任务与审批来源不一致")
			}
			task = *existing
		}
		if !cloudAgentContainsString(state.TaskIDs, task.ID) {
			state.TaskIDs = append(state.TaskIDs, task.ID)
		}
		state.MediaTaskID = task.ID
		if err := repo.TransferCloudAgentResourceLeases(run.UserID, state.Approval.ID, "task:"+task.ID, task.ID, time.Now().UTC().Add(24*time.Hour)); err != nil {
			return err
		}
		state.event(run.ID, "generation_task_created", map[string]any{"toolName": call.Function.Name, "taskId": task.ID, "nodeId": input.Request.SourceNodeID, "canvasId": task.ProjectID, "mode": "image", "usesModel": false, "text": "本地图片处理已提交，不调用模型、不扣生成费"})
		return cloudAgentSave(current, state)
	})
	s.storageMu.Unlock()
	var appErr *AppError
	if errors.As(err, &appErr) || errors.Is(err, repository.ErrActiveTaskLimit) {
		latest, readErr := s.repo.CloudAgent(run.UserID, run.ID)
		if readErr != nil || latest.Revision != run.Revision {
			return err
		}
		fresh, decodeErr := cloudAgentDecode(latest)
		if decodeErr != nil {
			return decodeErr
		}
		return s.cloudAgentImageOperationError(latest, &fresh, call, "admission", false, err)
	}
	return err
}

func (s *Service) completeCloudAgentImageOperation(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	task, err := s.repo.TaskForUser(run.UserID, state.MediaTaskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.cloudAgentImageOperationError(run, state, call, "completion", true, NotFound("图片处理任务不存在，未修改画布"))
	}
	if err != nil {
		return err
	}
	if task.AgentRunID != run.ID || task.Type != model.TaskTypeImageOperation || task.ProjectID != state.Request.CanvasID {
		return s.cloudAgentImageOperationError(run, state, call, "completion", true, Forbidden("图片处理任务归属不一致，未修改画布"))
	}
	if task.Status == model.TaskStatusQueued || task.Status == model.TaskStatusRunning {
		return nil
	}
	if task.Status != model.TaskStatusSucceeded {
		return s.cloudAgentImageOperationError(run, state, call, "completion", true, BadAuthRequest("图片处理未成功，请在任务中心查看详情；没有自动重试或修改原图"))
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		before, err := repo.CanvasProjectForUser(run.UserID, task.ProjectID)
		var applied ImageOperationApplyResult
		if err == nil {
			writer := &Service{repo: repo, dataDir: s.dataDir}
			applied, err = writer.ApplyImageOperationTask(run.UserID, task.ID, ImageOperationApplyRequest{RequestID: "agent-apply:" + imageOperationID(run.ID, task.ID)})
		}
		if err != nil {
			var appErr *AppError
			if !errors.As(err, &appErr) && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			cloudAgentRecordToolResult(current, state, call, map[string]any{"phase": "completion", "taskSubmitted": true, "taskId": task.ID, "status": task.Status, "writeback": "not_applied", "summary": "结果已保存到素材库，原画布未能采用", "usesModel": false}, err)
			state.MediaTaskID = ""
			return cloudAgentSave(current, state)
		}
		after, readErr := repo.CanvasProjectForUser(run.UserID, task.ProjectID)
		if readErr != nil {
			return readErr
		}
		doc, readErr := creationDocument(after.PayloadJSON)
		if readErr != nil {
			return readErr
		}
		present := map[string]bool{}
		for _, node := range creationMaps(doc["nodes"]) {
			metadata, _ := node["metadata"].(map[string]any)
			if node["type"] == "image" && metadata["imageOperationTaskId"] == task.ID {
				present[stringValue(node["id"])] = true
			}
		}
		for _, id := range append(append([]string{}, applied.AddedNodeIDs...), applied.ExistingNodeIDs...) {
			if !present[id] {
				cloudAgentRecordToolResult(current, state, call, map[string]any{"phase": "completion", "taskSubmitted": true, "taskId": task.ID, "status": task.Status, "writeback": "changed_after_apply", "usesModel": false}, BadAuthRequest("此前采用的结果已被修改或撤销，保留当前画布；图片仍在素材库"))
				state.MediaTaskID = ""
				return cloudAgentSave(current, state)
			}
		}
		if before.PayloadJSON != after.PayloadJSON {
			previous, err := creationDocument(before.PayloadJSON)
			if err != nil {
				return err
			}
			if err := cloudAgentCanvasEventRecorder(run.ID, state)(repo, cloudAgentMutationInput{UserID: run.UserID, CanvasID: task.ProjectID, StepID: call.ID, BeforeJSON: before.PayloadJSON, BeforeSnapshotHash: cloudAgentCanvasHash(previous), AfterSnapshotHash: cloudAgentCanvasHash(doc), Operation: "image_process_complete"}); err != nil {
				return err
			}
		}
		cloudAgentInvalidateReadCache(state)
		cloudAgentRecordToolResult(current, state, call, map[string]any{"phase": "completion", "taskSubmitted": true, "taskId": task.ID, "status": task.Status, "canvasId": applied.CanvasID, "addedNodeIds": applied.AddedNodeIDs, "existingNodeIds": applied.ExistingNodeIDs, "revision": applied.Revision, "usesModel": false, "summary": "图片处理结果已保存并采用到原画布，原图保留"}, nil)
		state.MediaTaskID = ""
		return cloudAgentSave(current, state)
	})
}
