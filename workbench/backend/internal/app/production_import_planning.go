package app

import (
	"encoding/json"
	"yingce/backend/internal/repository"
)

func legacyPlanningStorageBytes(plan *repository.LegacyPlanningRows) int64 {
	if plan == nil {
		return 0
	}
	bytes := int64(len(plan.Record.PayloadJSON) + len(plan.Record.Title) + 256)
	for _, value := range []any{plan.Unit, plan.Shots, plan.Revisions, plan.References, plan.Artifacts, plan.Versions, plan.Representations} {
		raw, _ := json.Marshal(value)
		bytes += int64(len(raw))
	}
	return bytes
}
