package repository

import (
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// Cache facts read from an owned original without reviving a removed record or
// applying facts to a resource whose storage identity changed during probing.
func (r *Repository) SaveInspectedResourceMetadata(source *model.Resource, width, height int, durationMs int64) (*model.Resource, error) {
	if source == nil || source.ID == "" || source.UserID == "" || width < 0 || height < 0 || durationMs < 0 {
		return nil, gorm.ErrInvalidData
	}
	result := r.db.Model(&model.Resource{}).Where("id = ? AND user_id = ? AND status = ? AND COALESCE(kind, '') = ? AND COALESCE(provider, '') = ? AND COALESCE(endpoint, '') = ? AND COALESCE(bucket, '') = ? AND COALESCE(storage_setting_id, '') = ? AND COALESCE(object_key, '') = ? AND COALESCE(mime_type, '') = ? AND size = ? AND COALESCE(e_tag, '') = ?", source.ID, source.UserID, model.ResourceStatusReady, source.Kind, source.Provider, source.Endpoint, source.Bucket, source.StorageSettingID, source.ObjectKey, source.MimeType, source.Size, source.ETag).Updates(map[string]any{"width": width, "height": height, "duration_ms": durationMs})
	if result.Error != nil {
		return nil, result.Error
	}
	// MySQL may report zero affected rows for identical values. Read and check
	// the exact identity rather than treating a successful replay as deletion.
	current, err := r.ResourceForUser(source.UserID, source.ID)
	if err != nil {
		return nil, err
	}
	if current.Status != model.ResourceStatusReady || current.Kind != source.Kind || current.Provider != source.Provider || current.Endpoint != source.Endpoint || current.Bucket != source.Bucket || current.StorageSettingID != source.StorageSettingID || current.ObjectKey != source.ObjectKey || current.MimeType != source.MimeType || current.Size != source.Size || current.ETag != source.ETag || current.Width != width || current.Height != height || current.DurationMs != durationMs {
		return nil, gorm.ErrRecordNotFound
	}
	return current, nil
}
