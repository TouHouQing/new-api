package main

import (
	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func projectWorkingOrigins[T any](source *gorm.DB, name string, rows []T) error {
	if name != "project_cuts" && name != "project_timelines" {
		return nil
	}
	status, err := database.ReadSchemaStatus(source)
	if err != nil {
		return err
	}
	if status.Current >= 67 {
		return nil
	}
	plan, err := database.ReadProjectCutOriginPlan(source)
	if err != nil {
		return err
	}
	switch values := any(rows).(type) {
	case []model.ProjectCut:
		for i := range values {
			values[i].OriginCutID = plan.Cuts[values[i].ID]
		}
	case []model.ProjectTimeline:
		for i := range values {
			values[i].OriginCutID = plan.Timelines[values[i].ProjectID]
		}
	}
	return nil
}
