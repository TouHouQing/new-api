package app

import (
	"yingce/backend/internal/repository"
)

func cloudAgentHandleRetainedRead(repo *repository.Repository, userID string, state *cloudAgentRuntime, call cloudAgentCall, services ...*Service) (any, error) {
	var service *Service
	if len(services) > 0 {
		service = services[0]
	}
	switch call.Function.Name {
	case "production_catalog", "production_read":
		if service == nil {
			return nil, BadAuthRequest("原生制作服务不可用")
		}
		if call.Function.Name == "production_catalog" {
			return service.cloudAgentProductionCatalog(userID, state, call)
		}
		return service.cloudAgentProductionRead(userID, state, call)
	case "task_history":
		var args struct {
			Page     *int   `json:"page"`
			PageSize *int   `json:"pageSize"`
			Query    string `json:"query"`
			Kind     string `json:"kind"`
			Model    string `json:"model"`
			Status   string `json:"status"`
			TimeZone string `json:"timeZone"`
		}
		if err := decodeCloudAgentJSONObject(call.Function.Arguments, &args); err != nil {
			return nil, cloudAgentJSONArgumentError(err)
		}
		if service == nil || state.Request.CanvasID == "" {
			return nil, BadAuthRequest("当前画布的任务历史服务不可用")
		}
		req := TaskHistoryRequest{Page: 1, PageSize: 20, ProjectID: state.Request.CanvasID, Query: args.Query, Kind: args.Kind, Model: args.Model, Status: args.Status, TimeZone: args.TimeZone}
		if args.Page != nil {
			req.Page = *args.Page
		}
		if args.PageSize != nil {
			req.PageSize = *args.PageSize
		}
		if req.PageSize > 50 {
			return nil, BadAuthRequest("Agent任务历史每页最多50项")
		}
		page, err := service.TaskHistory(userID, req)
		if err != nil {
			return nil, err
		}
		// A canvas Agent stays within its current canvas; global history facets
		// are reserved for the account history page and the explicitly connected MCP.
		return map[string]any{"tasks": page.Tasks, "page": page.Page, "pageSize": page.PageSize, "total": page.Total, "stats": page.Stats}, nil

	}
	return nil, BadAuthRequest("未知工具")
}
