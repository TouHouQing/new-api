package app

import (
	"encoding/json"
	"errors"
	"reflect"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// Native metadata writers with CAS but no public request receipt commit their
// existing business mutation and this Agent's execution receipt in the same
// database transaction. A lost acknowledgement cannot duplicate a chapter,
// shot, revision or later overwrite. No media/network operation enters here.
func (s *Service) commitProductionAgentMetadata(run *model.CloudAgentExecution, state *cloudAgentRuntime, call cloudAgentCall, action productionAgentAction, args []reflect.Value, intent *productionAgentIntent) error {
	before, err := json.Marshal(state)
	if err != nil {
		return err
	}
	runtimeID := state.RuntimeRunID
	s.storageMu.Lock()
	var businessErr error
	err = s.repo.MutateCloudAgent(run.UserID, run.ID, run.Revision, func(current *model.CloudAgentExecution, repo *repository.Repository) error {
		writer := &Service{repo: repo, dataDir: s.dataDir, pendingStorage: s.pendingStorage}
		bound, err := writer.productionAgentAction(action.name)
		if err != nil {
			return err
		}
		result, err := bound.invoke(args)
		if err != nil {
			businessErr = err
			return err
		}
		raw, err := json.Marshal(result)
		if err != nil {
			return err
		}
		intent.Complete, intent.Result = true, raw
		cloudAgentInvalidateReadCache(state)
		cloudAgentRecordToolResult(current, state, call, productionAgentReceipt(intent, result, false), nil)
		return cloudAgentSave(current, state)
	})
	s.storageMu.Unlock()
	if err != nil {
		var restored cloudAgentRuntime
		if restoreErr := json.Unmarshal(before, &restored); restoreErr != nil {
			return restoreErr
		}
		restored.RuntimeRunID = runtimeID
		*state = restored
	}
	if businessErr != nil {
		var argumentError *AppError
		if errors.As(businessErr, &argumentError) && (argumentError.Status == 400 || argumentError.Status == 422) {
			delete(state.ProductionIntents, intent.IntentID)
		}
		return s.recordCloudAgentProductionResult(run, state, call, nil, businessErr)
	}
	return err
}
