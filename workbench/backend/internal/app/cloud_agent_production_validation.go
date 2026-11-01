package app

import (
	"encoding/json"
	"fmt"
)

func validateProductionAgentRuntime(state *cloudAgentRuntime) error {
	if state == nil {
		return nil
	}
	if !cloudAgentHasProductionScope(state.Request) && (state.Request.ProductionProjectID != "" || state.CreatedProductionProjectID != "" || len(state.ProductionIntents) > 0) {
		return fmt.Errorf("production state exists outside its authorized context")
	}
	if len(state.ProductionIntents) > 64 {
		return fmt.Errorf("too many production intents")
	}
	project := state.Request.ProductionProjectID
	if project == "" {
		project = state.CreatedProductionProjectID
	}
	for id, intent := range state.ProductionIntents {
		if intent == nil || id != intent.IntentID || !validCutRequestID(id) || !cloudAgentSHA256(intent.SHA256) || len(intent.Arguments) == 0 || len(intent.Arguments) > 512*1024 || !json.Valid(intent.Arguments) {
			return fmt.Errorf("invalid production intent checkpoint")
		}
		if intent.Action == "project.create" && intent.ProjectID != "" || intent.Action != "project.create" && (intent.ProjectID == "" || intent.ProjectID != project) {
			return fmt.Errorf("production intent changed its project scope")
		}
		if productionAgentSignature(intent.Action, intent.ProjectID, intent.Arguments) != intent.SHA256 {
			return fmt.Errorf("production intent arguments differ from its original checkpoint")
		}
		if intent.Complete && (len(intent.Result) == 0 || !json.Valid(intent.Result)) {
			return fmt.Errorf("completed production intent lacks a complete result")
		}
	}
	return nil
}
