package repository

import (
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrResourceCleanupSetChanged = errors.New("待清理的资源已变化，请刷新后重试")
var ErrResourceCleanupStillReferenced = errors.New("资源仍被引用，暂不清理")

// DeleteDetachedResources removes Resource rows and enqueues physical deletion in one transaction.
// Rechecks durable documents after locking the same Resource rows used by native
// writers. A service snapshot taken before the transaction can already be stale.
func (r *Repository) DeleteDetachedResources(resources []model.Resource, deletionJobs []model.ResourceDeletionJob) error {
	if len(resources) == 0 {
		return nil
	}
	resourceIDs := make([]string, 0, len(resources))
	for _, resource := range resources {
		resourceIDs = append(resourceIDs, resource.ID)
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		var current []model.Resource
		query := tx.Where("id IN ?", resourceIDs).Order("id")
		if r.Dialect() != "sqlite" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.Find(&current).Error; err != nil {
			return err
		}
		if len(current) != len(resources) {
			return ErrResourceCleanupSetChanged
		}
		expected := make(map[string]model.Resource, len(resources))
		for _, resource := range resources {
			expected[resource.ID] = resource
		}
		for _, resource := range current {
			candidate := expected[resource.ID]
			if resource.UserID != candidate.UserID || resource.Status != candidate.Status || resource.Kind != candidate.Kind || resource.Provider != candidate.Provider || resource.Endpoint != candidate.Endpoint || resource.Bucket != candidate.Bucket || resource.StorageSettingID != candidate.StorageSettingID || resource.ObjectKey != candidate.ObjectKey || resource.ETag != candidate.ETag || resource.Size != candidate.Size || resource.MimeType != candidate.MimeType || !resource.UpdatedAt.Truncate(time.Microsecond).Equal(candidate.UpdatedAt.Truncate(time.Microsecond)) {
				return ErrResourceCleanupSetChanged
			}
		}
		documentsByUser := map[string][]string{}
		for _, resource := range current {
			if _, loaded := documentsByUser[resource.UserID]; loaded {
				continue
			}
			documents := []string{}
			for _, source := range []struct {
				model  any
				column string
			}{
				{&model.Asset{}, "payload_json"},
				{&model.CanvasProject{}, "payload_json"},
				{&model.ProjectTimeline{}, "payload_json"},
				{&model.ProjectCut{}, "payload_json"},
				{&model.ProjectCut{}, "metadata_json"},
				{&model.ProductionImport{}, "resource_refs_json"},
			} {
				if !tx.Migrator().HasTable(source.model) {
					continue
				}
				var values []string
				if err := tx.Model(source.model).Where("user_id = ?", resource.UserID).Pluck(source.column, &values).Error; err != nil {
					return err
				}
				documents = append(documents, values...)
			}
			documentsByUser[resource.UserID] = documents
		}
		candidateIDs := map[string]struct{}{}
		for _, id := range resourceIDs {
			candidateIDs[id] = struct{}{}
		}
		for _, documents := range documentsByUser {
			for _, document := range documents {
				if len(assets.DocumentReferencedIDs(document, candidateIDs)) > 0 {
					return ErrResourceCleanupStillReferenced
				}
			}
		}
		for _, resource := range current {
			storageKey := "resource:" + resource.ID + `"`
			fileURL := "/api/resources/" + resource.ID + "/"
			for _, document := range documentsByUser[resource.UserID] {
				if strings.Contains(document, storageKey) || strings.Contains(document, fileURL) {
					return ErrResourceCleanupStillReferenced
				}
			}
		}
		for _, check := range []struct {
			model any
			query string
		}{
			{&model.Announcement{}, "image_resource_id IN ?"},
			{&model.AnnouncementImageDraft{}, "resource_id IN ?"},
			{&model.AssetRepresentation{}, "resource_id IN ?"},
			{&model.VoiceProfile{}, "sample_resource_id IN ?"},
			{&model.ShotArtifact{}, "resource_id IN ?"},
			{&model.CanvasSnapshotResource{}, "resource_id IN ?"},
			{&model.ProjectTranscript{}, "resource_id IN ?"},
			{&model.ProjectMediaAnalysis{}, "resource_id IN ?"},
			// 短剧表直接持有参考图、段视频、尾帧、成片与历史版本，不出现在任何 JSON 文档里。
			{&model.DramaCast{}, "image_resource_id IN ?"},
			{&model.DramaSegment{}, "video_resource_id IN ?"},
			{&model.DramaSegment{}, "tail_frame_resource_id IN ?"},
			{&model.DramaEpisode{}, "final_resource_id IN ?"},
			{&model.DramaTake{}, "resource_id IN ?"},
		} {
			if !tx.Migrator().HasTable(check.model) {
				continue
			}
			var count int64
			if err := tx.Model(check.model).Where(check.query, resourceIDs).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return ErrResourceCleanupStillReferenced
			}
		}
		if err := tx.Where("resource_id IN ?", resourceIDs).Delete(&model.ArkPrivateAssetBinding{}).Error; err != nil {
			return err
		}
		if len(deletionJobs) > 0 {
			if err := tx.Create(&deletionJobs).Error; err != nil {
				return err
			}
		}
		deleted := tx.Where("id IN ?", resourceIDs).Delete(&model.Resource{})
		if deleted.Error != nil {
			return deleted.Error
		}
		if deleted.RowsAffected != int64(len(resourceIDs)) {
			return ErrResourceCleanupSetChanged
		}
		return nil
	})
}
