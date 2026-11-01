package repository

import (
	"errors"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

type ProductionImportRows struct {
	Receipt                model.ProductionImport
	Project                model.Project
	Unit                   model.ProjectUnit
	Canvas                 model.CanvasProject
	Timeline               *model.ProjectTimeline
	CanvasLink             model.CanvasUnitLink
	Assets                 []model.Asset
	Versions               []model.AssetVersion
	Representations        []model.AssetRepresentation
	AssetLinks             []model.ProjectAssetLink
	Shots                  []model.Shot
	ShotRevisions          []model.ShotRevision
	ShotArtifacts          []model.ShotArtifact
	ShotReferences         []model.ShotAssetReference
	Cut                    *model.ProjectCut
	Transcripts            []model.ProjectTranscript
	TranscriptRevisions    []model.ProjectTranscriptRevision
	MediaAnalyses          []model.ProjectMediaAnalysis
	MediaAnalysisRevisions []model.ProjectMediaAnalysisRevision
	Planning               *LegacyPlanningRows
	PrevisCanvas           *model.CanvasProject
	PrevisCanvasBeforeSHA  string
}

type LegacyPlanningRows struct {
	Record          model.ProjectShotPlanRecord
	Unit            *model.ProjectUnit
	Shots           []model.Shot
	Revisions       []model.ShotRevision
	References      []model.ShotAssetReference
	Artifacts       []model.ShotArtifact
	Versions        []model.AssetVersion
	Representations []model.AssetRepresentation
}

func (r *Repository) ProductionImportForSource(userID, fingerprint string) (*model.ProductionImport, error) {
	var receipt model.ProductionImport
	if err := r.db.Where("user_id = ? AND source_fingerprint = ?", userID, fingerprint).First(&receipt).Error; err != nil {
		return nil, err
	}
	return &receipt, nil
}

func (r *Repository) ProductionImportForProject(userID, projectID string) (*model.ProductionImport, error) {
	var receipt model.ProductionImport
	if err := r.db.Where("user_id = ? AND project_id = ?", userID, projectID).First(&receipt).Error; err != nil {
		return nil, err
	}
	return &receipt, nil
}

// All project rows and the idempotency receipt commit together. Uploaded
// resources use the normal upload identity and can be reused after a rollback.
func (r *Repository) CreateProductionImport(rows *ProductionImportRows, initialize func(*Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&rows.Receipt).Error; err != nil {
			return err
		}
		if err := New(tx).CreateProject(&rows.Project); err != nil {
			return err
		}
		for _, row := range []any{&rows.Unit, &rows.Canvas, &rows.CanvasLink} {
			if err := tx.Create(row).Error; err != nil {
				return err
			}
		}
		if rows.Timeline != nil {
			if err := tx.Create(rows.Timeline).Error; err != nil {
				return err
			}
		}
		if err := New(tx).CreateLegacySupplementRows(rows); err != nil {
			return err
		}
		if err := insertProductionRows(tx, rows.Assets); err != nil {
			return err
		}
		if err := insertProductionRows(tx, rows.Versions); err != nil {
			return err
		}
		// Historical candidates have no native Task row. Keep task_id NULL so
		// the task/role unique index does not conflate all imported versions.
		if len(rows.Representations) > 0 {
			if err := tx.Omit("TaskID").CreateInBatches(&rows.Representations, 30).Error; err != nil {
				return err
			}
		}
		if err := insertProductionRows(tx, rows.AssetLinks); err != nil {
			return err
		}
		if err := insertProductionRows(tx, rows.Shots); err != nil {
			return err
		}
		if err := insertProductionRows(tx, rows.ShotRevisions); err != nil {
			return err
		}
		if err := insertProductionRows(tx, rows.ShotArtifacts); err != nil {
			return err
		}
		if err := insertProductionRows(tx, rows.ShotReferences); err != nil {
			return err
		}
		return initialize(New(tx))
	})
}

func (r *Repository) CreateLegacySupplementRows(rows *ProductionImportRows) error {
	if err := r.createLegacyPlanningRows(rows); err != nil {
		return err
	}
	if rows.Cut != nil {
		if err := r.db.Create(rows.Cut).Error; err != nil {
			return err
		}
	}
	// Converter upgrades reuse original transcript identities. Preserve the
	// current human correction pointer, title and archive state in every case.
	for _, incoming := range rows.Transcripts {
		var existing model.ProjectTranscript
		err := r.db.Where("id = ?", incoming.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err = r.db.Create(&incoming).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if existing.UserID != incoming.UserID || existing.ProjectID != incoming.ProjectID || existing.SourceKind != incoming.SourceKind || existing.SourceKey != incoming.SourceKey || existing.SourceImportID != incoming.SourceImportID || existing.SourceLegacyID != incoming.SourceLegacyID || existing.ResourceID != incoming.ResourceID || existing.SourceBytes != incoming.SourceBytes || existing.SourceDurationMs != incoming.SourceDurationMs {
			return ErrProjectTimelineConflict
		}
	}
	for _, incoming := range rows.TranscriptRevisions {
		var existing model.ProjectTranscriptRevision
		err := r.db.Where("id = ?", incoming.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err = r.db.Create(&incoming).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if existing.TranscriptID != incoming.TranscriptID || existing.UserID != incoming.UserID || existing.Version != incoming.Version || existing.DocumentJSON != incoming.DocumentJSON {
			return ErrProjectTimelineConflict
		}
	}
	// Reusing imported identities must never reset a later human correction,
	// rename or archive. Immutable source/evidence and prior revisions must match.
	for _, incoming := range rows.MediaAnalyses {
		var existing model.ProjectMediaAnalysis
		err := r.db.Where("id = ?", incoming.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err = r.db.Create(&incoming).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if existing.UserID != incoming.UserID || existing.ProjectID != incoming.ProjectID || existing.Kind != incoming.Kind || existing.SourceKind != incoming.SourceKind || existing.SourceKey != incoming.SourceKey || existing.SourceImportID != incoming.SourceImportID || existing.SourceLegacyID != incoming.SourceLegacyID || existing.ResourceID != incoming.ResourceID || existing.SourceJSON != incoming.SourceJSON || existing.EvidenceJSON != incoming.EvidenceJSON {
			return ErrProjectTimelineConflict
		}
	}
	for _, incoming := range rows.MediaAnalysisRevisions {
		var existing model.ProjectMediaAnalysisRevision
		err := r.db.Where("id = ?", incoming.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err = r.db.Create(&incoming).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if existing.AnalysisID != incoming.AnalysisID || existing.UserID != incoming.UserID || existing.Version != incoming.Version || existing.DocumentJSON != incoming.DocumentJSON || existing.RequestID != incoming.RequestID || existing.RequestSHA256 != incoming.RequestSHA256 {
			return ErrProjectTimelineConflict
		}
	}
	return nil
}

func insertProductionRows[T any](tx *gorm.DB, rows []T) error {
	if len(rows) == 0 {
		return nil
	}
	return tx.CreateInBatches(&rows, 30).Error
}
