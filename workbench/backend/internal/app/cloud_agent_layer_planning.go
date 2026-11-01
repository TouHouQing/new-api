package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type cloudAgentLayerPlanningArgs struct {
	SourceNodeID string  `json:"sourceNodeId"`
	Instructions string  `json:"instructions"`
	Purpose      string  `json:"purpose"`
	Input        string  `json:"input"`
	MaxCredits   float64 `json:"maxCredits"`
}

type cloudAgentLayerPlanningApproval struct {
	Source       nativeLayerPlanning `json:"source"`
	ResolvedHash string              `json:"resolvedHash"`
	QuoteHash    string              `json:"quoteHash"`
	ExpiresAt    time.Time           `json:"expiresAt"`
}

func decodeCloudAgentLayerPlanning(call cloudAgentCall) (cloudAgentLayerPlanningArgs, error) {
	var args cloudAgentLayerPlanningArgs
	if err := decodeCloudAgentJSONObject(call.Function.Arguments, &args); err != nil {
		return args, cloudAgentJSONArgumentError(err)
	}
	if args.Input == "" {
		args.Input = "preview"
	}
	if validateCloudAgentID(args.SourceNodeID, "原图节点ID", 128) != nil || strings.TrimSpace(args.Instructions) == "" || len([]rune(args.Instructions)) > 6000 || (args.Purpose != "materials" && args.Purpose != "recompose") || (args.Input != "preview" && args.Input != "original") || math.IsNaN(args.MaxCredits) || math.IsInf(args.MaxCredits, 0) || args.MaxCredits < 0 || args.MaxCredits > 1000000 {
		return args, BadAuthRequest("请提供原图、拆层目的、识图要求和独立积分上限")
	}
	return args, nil
}

func (s *Service) prepareCloudAgentLayerPlanning(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) (*model.Task, *creationTaskPreparation, *nativeLayerPlanning, error) {
	args, err := decodeCloudAgentLayerPlanning(call)
	if err != nil {
		return nil, nil, nil, err
	}
	if !cloudAgentToolAllowed(state.Request, "image_layer_plan") || state.Request.PermissionMode == "read_only" {
		return nil, nil, nil, Forbidden("当前权限不能运行识图规划")
	}
	if err := validateCloudAgentMediaBudget(cloudAgentMediaArgs{Mode: "image"}, state); err != nil {
		return nil, nil, nil, err
	}
	key, _, err := cloudAgentImageOperationSource(s.repo, run.UserID, state.Request.CanvasID, args.SourceNodeID, "")
	if err != nil {
		return nil, nil, nil, err
	}
	resourceID := strings.TrimPrefix(key, "resource:")
	source, err := s.nativeImageEditSource(run.UserID, state.Request.CanvasID, args.SourceNodeID, resourceID)
	if err != nil {
		return nil, nil, nil, err
	}
	orders, err := s.repo.BillingOrdersByTaskIDs(run.UserID, state.TaskIDs)
	if err != nil {
		return nil, nil, nil, err
	}
	remaining := int64(math.Floor(state.Request.Budget.MaxCredits * float64(CreditScale)))
	for _, order := range orders {
		remaining -= order.AmountMicrocredits
	}
	if remaining < 0 {
		return nil, nil, nil, BadAuthRequest("本轮Agent预算已用尽")
	}
	preparation := &creationTaskPreparation{}
	input := map[string]any{"mode": "text", "prompt": args.Instructions, "config": map[string]any{"channelId": state.Request.ChannelID, "model": firstNonEmpty(state.Request.ChannelModelKey, state.Request.Model)}, "metadata": map[string]any{"nodeId": args.SourceNodeID, "nativeLayerPlanning": map[string]any{"version": 1, "sourceNodeId": args.SourceNodeID, "resourceId": resourceID, "expectedSourceSha256": source.SHA256, "instructions": args.Instructions, "purpose": args.Purpose, "input": args.Input, "maxCredits": args.MaxCredits}}}
	req := CreateTaskRequest{ProjectID: state.Request.CanvasID, Type: "canvas_text", Operation: "text", Prompt: args.Instructions, Model: firstNonEmpty(state.Request.ChannelModelKey, state.Request.Model), LogicalModelID: state.Request.LogicalModelID, Input: input, creationPrepare: preparation, admission: &taskAdmission{ID: cloudAgentID(run.UserID, run.ID+":layer-plan:"+call.ID), MaxCharge: remaining, AgentRunID: run.ID}}
	task, err := s.CreateTask(run.UserID, req)
	if err != nil {
		return nil, nil, nil, err
	}
	var stored struct {
		Metadata map[string]any `json:"metadata"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &stored) != nil {
		return nil, nil, nil, errors.New("识图任务准备态无效")
	}
	plan, err := decodeNativeLayerPlanning(stored.Metadata["nativeLayerPlanning"])
	return task, preparation, plan, err
}

func validateCloudAgentLayerPlanningApproval(state *cloudAgentRuntime, call cloudAgentCall) error {
	approval := state.Approval
	if approval == nil || approval.LayerPlanning == nil || approval.Call.Function.Name != "image_layer_plan" || !cloudAgentToolCallsEquivalent(approval.Call, call) || approval.CallHash != cloudAgentApprovalCallHash(call) || approval.Prepared != nil || approval.ImageOperation != nil {
		return errors.New("识图审批与当前操作不一致")
	}
	prepared := approval.LayerPlanning
	if prepared.Source.Source.SHA256 != prepared.Source.ExpectedSourceSHA256 || !cloudAgentSHA256(prepared.ResolvedHash) || !cloudAgentSHA256(prepared.QuoteHash) || prepared.ExpiresAt.IsZero() {
		return errors.New("识图审批缺少原图或报价快照")
	}
	return nil
}

func (s *Service) cloudAgentLayerPlanningError(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall, submitted bool, err error) error {
	return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		if state.Approval != nil {
			if releaseErr := repo.ReleaseCloudAgentResourceLeases(run.UserID, state.Approval.ID); releaseErr != nil {
				return releaseErr
			}
		}
		cloudAgentRecordToolResult(current, state, call, map[string]any{"taskSubmitted": submitted, "usesModel": true, "phase": "layer_planning"}, err)
		state.MediaTaskID = ""
		return cloudAgentSave(current, state)
	})
}

func (s *Service) advanceCloudAgentLayerPlanning(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	if state.MediaTaskID != "" {
		return s.completeCloudAgentLayerPlanning(run, state, call)
	}
	if state.Approval != nil {
		if err := validateCloudAgentLayerPlanningApproval(state, call); err != nil {
			return s.cloudAgentLayerPlanningError(run, state, call, false, err)
		}
		if state.Approval.Decision != "approve" {
			return nil
		}
		if time.Now().After(state.Approval.LayerPlanning.ExpiresAt) {
			return s.cloudAgentLayerPlanningError(run, state, call, false, BadAuthRequest("识图审批已过期，请重新确认"))
		}
	}
	task, preparation, source, err := s.prepareCloudAgentLayerPlanning(run, state, call)
	if err != nil {
		return s.cloudAgentLayerPlanningError(run, state, call, false, err)
	}
	resolved, err := cloudAgentResolvedMediaHash(task)
	if err != nil {
		return err
	}
	quote := cloudAgentQuoteHash(preparation.Order)
	if state.Approval == nil {
		return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
			if _, _, err := cloudAgentImageOperationSource(repo, run.UserID, state.Request.CanvasID, source.SourceNodeID, "resource:"+source.ResourceID); err != nil {
				return err
			}
			amount := int64(0)
			if preparation.Order != nil {
				amount = preparation.Order.AmountMicrocredits
			}
			preview := cloudAgentApprovalPreview{Kind: "image_layer_planning", Title: "识图拆层规划", Description: "仅运行当前文本模型识图并保存规划；确认图层前不会生成或修改图片。", Items: []cloudAgentApprovalPreviewItem{{Operation: "image_layer_plan", NodeID: source.SourceNodeID, NodeType: "image", NodeTypeLabel: "原图", Summary: "识图预算单独限制", Details: []string{fmt.Sprintf("原图%d×%d像素，实际识图%d×%d像素", source.Source.Width, source.Source.Height, source.ReferenceSize.Width, source.ReferenceSize.Height), fmt.Sprintf("本次报价 %.6f 积分；上限 %.6f 积分", float64(amount)/float64(CreditScale), source.MaxCredits), "结果和原图摘要随原任务保存，模型回复成功不表示规划或视觉质量合格。"}}}}
			approvalID := fmt.Sprintf("%s-%d-%d", run.ID, state.Step, state.CallIndex)
			state.Approval = &cloudAgentApproval{ID: approvalID, Call: call, CallHash: cloudAgentApprovalCallHash(call), Preview: preview, ModelName: task.Model, LayerPlanning: &cloudAgentLayerPlanningApproval{Source: *source, ResolvedHash: resolved, QuoteHash: quote, ExpiresAt: time.Now().UTC().Add(cloudAgentMediaQuoteLifetime)}}
			if err := repo.UpsertCloudAgentResourceLeases(run.UserID, run.ID, approvalID, []string{source.ResourceID}, state.Approval.LayerPlanning.ExpiresAt); err != nil {
				return err
			}
			current.Status = "waiting_approval"
			state.event(run.ID, "approval_requested", map[string]any{"approvalId": approvalID, "toolName": call.Function.Name, "arguments": json.RawMessage(call.Function.Arguments), "preview": preview, "text": preview.Description})
			return cloudAgentSave(current, state)
		})
	}
	approved := state.Approval.LayerPlanning
	if approved.ResolvedHash != resolved || approved.QuoteHash != quote || approved.Source.Source != source.Source || approved.Source.ReferenceSHA256 != source.ReferenceSHA256 {
		return s.cloudAgentLayerPlanningError(run, state, call, false, creationConflict("原图、模型配置或识图报价已变化，请重新审批；未提交任务"))
	}
	var input map[string]any
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil {
		return errors.New("识图任务输入无效")
	}
	if err := s.protectTaskSecrets(input); err != nil {
		return err
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return err
	}
	task.InputJSON = string(encoded)
	task.ApprovalID = state.Approval.ID
	if preparation.Order != nil {
		task.BillingOrderID = preparation.Order.ID
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	s.storageMu.Lock()
	err = s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		if _, _, err := cloudAgentImageOperationSource(repo, run.UserID, state.Request.CanvasID, source.SourceNodeID, "resource:"+source.ResourceID); err != nil {
			return err
		}
		if err := createTaskWithStorageQuotaRepository(repo, task, preparation.Order, policy); err != nil {
			return err
		}
		if err := repo.TransferCloudAgentResourceLeases(run.UserID, state.Approval.ID, "task:"+task.ID, task.ID, time.Now().UTC().Add(24*time.Hour)); err != nil {
			return err
		}
		state.TaskIDs = append(state.TaskIDs, task.ID)
		state.MediaTaskID = task.ID
		state.Generations++
		state.event(run.ID, "generation_task_created", map[string]any{"toolName": call.Function.Name, "taskId": task.ID, "nodeId": source.SourceNodeID, "canvasId": task.ProjectID, "mode": "text", "usesModel": true, "text": "识图任务已提交，原图保持不变"})
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
		return s.cloudAgentLayerPlanningError(latest, &fresh, call, false, err)
	}
	if err == nil {
		s.wakeTaskDispatcher()
	}
	return err
}

func (s *Service) completeCloudAgentLayerPlanning(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	task, err := s.repo.TaskForUser(run.UserID, state.MediaTaskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.cloudAgentLayerPlanningError(run, state, call, true, NotFound("原识图任务不可用，未重复提交"))
	}
	if err != nil {
		return err
	}
	if task.Status == model.TaskStatusQueued || task.Status == model.TaskStatusRunning {
		return nil
	}
	return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		var output map[string]any
		_ = json.Unmarshal([]byte(task.ResultJSON), &output)
		result := map[string]any{"taskId": task.ID, "status": task.Status, "stage": task.Stage, "taskSubmitted": true, "usesModel": true, "planning": output["imageLayerPlanning"], "summary": "原识图任务已结束；核对规划后再决定是否拆层，不要重复识图"}
		var toolErr error
		if task.Status != model.TaskStatusSucceeded {
			toolErr = BadAuthRequest("识图任务未成功，请保留原记录核对；未自动重试")
		} else if planning, _ := output["imageLayerPlanning"].(map[string]any); planning["status"] != "ready" {
			toolErr = BadAuthRequest("识图回复需要修正，原回复和原因已保留；尚未形成可执行图层规划，未开始图片生成")
		}
		if err := repo.ReleaseCloudAgentResourceLeases(run.UserID, "task:"+task.ID); err != nil {
			return err
		}
		cloudAgentToolResult(run.ID, state, call, result, toolErr)
		state.MediaTaskID = ""
		return cloudAgentSave(current, state)
	})
}
