package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StudioProvider stores one user-owned OpenAI-compatible text or image API.
// EncryptedAPIKey is ciphertext from service.EncryptStudioProviderKey and is
// never serialized into dashboard responses.
type StudioProvider struct {
	ID              uint      `json:"-" gorm:"primaryKey"`
	UserID          int       `json:"-" gorm:"not null;uniqueIndex:idx_studio_provider_user_kind"`
	Kind            string    `json:"kind" gorm:"type:varchar(16);not null;uniqueIndex:idx_studio_provider_user_kind"`
	BaseURL         string    `json:"base_url" gorm:"type:text;not null"`
	EncryptedAPIKey string    `json:"-" gorm:"type:text;not null"`
	CreatedAt       time.Time `json:"-"`
	UpdatedAt       time.Time `json:"-"`
}

func GetStudioProvider(userID int, kind string) (*StudioProvider, error) {
	var provider StudioProvider
	err := DB.Where("user_id = ? AND kind = ?", userID, kind).First(&provider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &provider, nil
}

func ListStudioProviders(userID int) ([]StudioProvider, error) {
	var providers []StudioProvider
	err := DB.Where("user_id = ?", userID).Order("kind ASC").Find(&providers).Error
	return providers, err
}

func UpsertStudioProvider(userID int, kind, baseURL, encryptedAPIKey string) error {
	provider := StudioProvider{UserID: userID, Kind: kind, BaseURL: baseURL, EncryptedAPIKey: encryptedAPIKey}
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "kind"}},
		DoUpdates: clause.AssignmentColumns([]string{"base_url", "encrypted_api_key", "updated_at"}),
	}).Create(&provider).Error
}

func DeleteStudioProvider(userID int, kind string) error {
	return DB.Where("user_id = ? AND kind = ?", userID, kind).Delete(&StudioProvider{}).Error
}
