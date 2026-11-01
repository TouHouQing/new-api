package app

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type productionAgentCall struct {
	Action    string          `json:"action"`
	IntentID  string          `json:"intentId,omitempty"`
	Arguments json.RawMessage `json:"arguments"`
}
type productionAgentIntent struct {
	Action    string          `json:"action"`
	ProjectID string          `json:"projectId"`
	IntentID  string          `json:"intentId"`
	SHA256    string          `json:"sha256"`
	Arguments json.RawMessage `json:"arguments"`
	Complete  bool            `json:"complete"`
	Result    json.RawMessage `json:"result,omitempty"`
}

func cloudAgentHasProductionScope(request CloudAgentRequest) bool {
	for _, scope := range request.ContextScope {
		if scope == "project" {
			return true
		}
	}
	return false
}

func (s *Service) cloudAgentProductionScope(user string, state *cloudAgentRuntime) (string, error) {
	if state == nil || !cloudAgentHasProductionScope(state.Request) {
		return "", BadAuthRequest("项目制作未获本轮上下文授权")
	}
	canvas, err := s.repo.CanvasProjectForUser(user, state.Request.CanvasID)
	if err != nil {
		return "", err
	}
	project := state.Request.ProductionProjectID
	if project == "" {
		project = state.CreatedProductionProjectID
	}
	// A newly created project may not yet have a canvas. Existing project scope
	// never follows a later relink of the canvas to another project.
	if state.Request.ProductionProjectID != "" && canvas.ProjectID != project || state.Request.ProductionProjectID == "" && canvas.ProjectID != "" && canvas.ProjectID != project {
		return "", cutConflict("画布所属项目已变化，请在新项目重新开始这一轮")
	}
	if project != "" {
		if _, err := s.repo.ProjectForUser(user, project); err != nil {
			return "", err
		}
	}
	return project, nil
}

func (s *Service) cloudAgentProductionCatalog(user string, state *cloudAgentRuntime, call cloudAgentCall) (any, error) {
	project, err := s.cloudAgentProductionScope(user, state)
	if err != nil {
		return nil, err
	}
	var args struct {
		Action string `json:"action,omitempty"`
		Group  string `json:"group,omitempty"`
	}
	if err := decodeCloudAgentJSONObject(call.Function.Arguments, &args); err != nil {
		return nil, BadAuthRequest("制作目录参数必须符合合同")
	}
	rows := []map[string]any{}
	for _, action := range s.productionAgentActions() {
		if args.Action != "" && args.Action != action.name || args.Group != "" && args.Group != action.group {
			continue
		}
		if !action.readOnly && state.Request.PermissionMode == "read_only" {
			continue
		}
		if action.name == "project.create" && project != "" {
			continue
		}
		row := map[string]any{"action": action.name, "group": action.group, "description": action.description, "readOnly": action.readOnly}
		if args.Action != "" {
			schema, err := action.schema()
			if err != nil {
				return nil, err
			}
			row["argumentsSchema"] = schema
		}
		rows = append(rows, row)
	}
	if args.Action != "" && len(rows) == 0 {
		return nil, BadAuthRequest("此动作不存在或未获本轮权限，请读取可用目录")
	}
	return map[string]any{"projectId": project, "actions": rows, "guidance": "先读动作参数合同。外层intentId是稳定写入编号；请求内requestId/idempotencyKey须相同或省略。写结果在result；replayed=true返回原回执，当前状态请重新读取。未知写入先查原生回执。剪辑与采用必须先预览再按原正文确认。"}, nil
}

func decodeProductionAgentCall(call cloudAgentCall) (productionAgentCall, error) {
	var args productionAgentCall
	if err := decodeCloudAgentJSONObject(call.Function.Arguments, &args); err != nil {
		return args, BadAuthRequest("制作动作参数必须符合合同")
	}
	if args.Action == "" || len(args.Action) > 100 || len(args.Arguments) == 0 {
		return args, BadAuthRequest("请选择明确制作动作及参数")
	}
	return args, nil
}

func (s *Service) cloudAgentProductionRead(user string, state *cloudAgentRuntime, call cloudAgentCall) (any, error) {
	args, err := decodeProductionAgentCall(call)
	if err != nil {
		return nil, err
	}
	action, err := s.productionAgentAction(args.Action)
	if err != nil {
		return nil, err
	}
	if !action.readOnly || args.IntentID != "" {
		return nil, BadAuthRequest("读取入口不能执行制作写入")
	}
	project, err := s.cloudAgentProductionScope(user, state)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	decoded, err := action.argumentsFor(ctx, user, project, "", args.Arguments)
	if err != nil {
		return nil, err
	}
	return action.invoke(decoded)
}

func productionAgentCanonicalArguments(action productionAgentAction, args []reflect.Value) json.RawMessage {
	values := map[string]any{}
	for index, name := range action.arguments {
		if !strings.HasPrefix(name, "$") {
			values[name] = args[index].Interface()
		}
	}
	raw, _ := json.Marshal(values)
	return raw
}

func productionAgentSignature(action, project string, canonical json.RawMessage) string {
	var normalized map[string]json.RawMessage
	if json.Unmarshal(canonical, &normalized) == nil {
		var request map[string]json.RawMessage
		if json.Unmarshal(normalized["request"], &request) == nil && request != nil {
			delete(request, "previewToken")
			normalized["request"], _ = json.Marshal(request)
			canonical, _ = json.Marshal(normalized)
		}
	}
	return cutSignature(struct {
		Action, Project string
		Arguments       json.RawMessage
	}{action, project, canonical})
}

func (s *Service) advanceCloudAgentProduction(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall) error {
	fail := func(err error) error { return s.recordCloudAgentProductionResult(run, state, call, nil, err) }
	input, err := decodeProductionAgentCall(call)
	if err != nil {
		return fail(err)
	}
	if state.Request.PermissionMode == "read_only" || !validCutRequestID(input.IntentID) {
		return fail(BadAuthRequest("写入需要有效的稳定intentId和本轮编辑权限"))
	}
	action, err := s.productionAgentAction(input.Action)
	if err != nil {
		return fail(err)
	}
	if action.readOnly {
		return fail(BadAuthRequest("此动作请使用production_read"))
	}
	project, err := s.cloudAgentProductionScope(run.UserID, state)
	if err != nil {
		return fail(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if action.name == "project.create" {
		project = ""
	}
	args, err := action.argumentsFor(ctx, run.UserID, project, input.IntentID, input.Arguments)
	if err != nil {
		return fail(err)
	}
	canonical := productionAgentCanonicalArguments(action, args)
	signature := productionAgentSignature(action.name, project, canonical)
	prior := state.ProductionIntents[input.IntentID]
	if prior != nil && (prior.SHA256 != signature || prior.Action != action.name || prior.ProjectID != project) {
		return fail(cutConflict("这个制作编号已用于其他参数，请核对原回执"))
	}
	if prior != nil && prior.Complete {
		return s.recordCloudAgentProductionResult(run, state, call, productionAgentReceipt(prior, json.RawMessage(prior.Result), true), nil)
	}
	if action.name == "project.create" && state.CreatedProductionProjectID != "" && prior == nil || action.name == "project.create" && state.Request.ProductionProjectID != "" {
		return fail(BadAuthRequest("本轮已有项目，不能静默切换；请在独立画布创建其他项目"))
	}
	needsApproval := state.Request.PermissionMode == "request_approval" && (state.Approval == nil || state.Approval.CallHash != cloudAgentApprovalCallHash(call))
	if prior == nil || needsApproval {
		if prior == nil && len(state.ProductionIntents) >= 64 {
			return fail(BadAuthRequest("本轮制作动作已达64项，请核对已完成结果后另开一轮"))
		}
		prepared := &productionAgentIntent{Action: action.name, ProjectID: project, IntentID: input.IntentID, SHA256: signature, Arguments: canonical}
		s.storageMu.Lock()
		err := s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
			if state.ProductionIntents == nil {
				state.ProductionIntents = map[string]*productionAgentIntent{}
			}
			state.ProductionIntents[input.IntentID] = prepared
			if state.Request.PermissionMode == "request_approval" {
				id := mediaAnalysisID("agent-production-approval", run.ID, input.IntentID, call.ID)
				preview := cloudAgentApprovalPreview{Kind: "production", Title: action.description, Description: "将对本轮项目执行" + action.name + "；原生权限、预览、CAS与回执仍生效。", Items: []cloudAgentApprovalPreviewItem{}}
				state.Approval = &cloudAgentApproval{ID: id, Call: call, CallHash: cloudAgentApprovalCallHash(call), Preview: preview, Production: prepared}
				current.Status = "waiting_approval"
				state.event(run.ID, "approval_required", map[string]any{"approvalId": id, "callId": call.ID, "toolName": call.Function.Name, "arguments": json.RawMessage(call.Function.Arguments), "preview": preview, "text": preview.Description})
			}
			return cloudAgentSave(current, state)
		})
		s.storageMu.Unlock()
		if err != nil || state.Request.PermissionMode == "request_approval" {
			return err
		}
		// Pi expects an actual tool result from this bridge call. An auto-mode
		// admission checkpoint is durable preparation, not a completed action.
		// Reload its committed revision and finish the same intent before reply.
		latest, err := s.repo.CloudAgent(run.UserID, run.ID)
		if err != nil {
			return err
		}
		restored, err := cloudAgentDecode(latest)
		if err != nil {
			return err
		}
		*state = restored
		return s.advanceCloudAgentProduction(latest, state, call)
	}
	if state.Request.PermissionMode == "request_approval" && (state.Approval == nil || state.Approval.Production == nil || state.Approval.Production.SHA256 != signature || state.Approval.Decision != "approve") {
		return fail(BadAuthRequest("制作动作尚未获得明确审批"))
	}
	if action.atomicMetadata() {
		return s.commitProductionAgentMetadata(run, state, call, action, args, prior)
	}
	// Every registered write below has an original stable receipt or a unique
	// native link. A crash before saving this result reuses that same receipt.
	result, err := action.invoke(args)
	if err != nil {
		return fail(err)
	}
	raw, err := json.Marshal(result)
	if err != nil {
		return fail(err)
	}
	if action.name == "project.create" {
		created, ok := result.(model.Project)
		if !ok || created.ID == "" {
			return fail(NewAppError(500, "项目创建结果缺少原生身份，请核对原编号"))
		}
		state.CreatedProductionProjectID = created.ID
		if err := s.repo.AssignCanvasToProjectIfUnbound(run.UserID, state.Request.CanvasID, created.ID); err != nil {
			return s.recordCloudAgentProductionResult(run, state, call, map[string]any{"project": created, "openProject": "/projects/" + created.ID}, cutConflict("原生项目已创建，但画布绑定发生变化；请打开已创建项目核对，勿换编号重复创建"))
		}
	}
	prior.Complete, prior.Result = true, raw
	return s.recordCloudAgentProductionResult(run, state, call, productionAgentReceipt(prior, result, false), nil)
}

func productionAgentReceipt(intent *productionAgentIntent, result any, replayed bool) map[string]any {
	return map[string]any{"intentId": intent.IntentID, "action": intent.Action, "projectId": intent.ProjectID, "result": result, "replayed": replayed}
}

func (s *Service) recordCloudAgentProductionResult(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall, result any, failure error) error {
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
		cloudAgentInvalidateReadCache(state)
		cloudAgentRecordToolResult(current, state, call, result, failure)
		return cloudAgentSave(current, state)
	})
}
