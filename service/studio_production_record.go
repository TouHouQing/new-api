package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func SaveStudioProductionRecord(actorID int, projectID, recordID, kind string, revision int64, payload any) (*model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(recordID) || !StudioIDPattern.MatchString(kind) || (projectID != "" && !StudioIDPattern.MatchString(projectID)) || revision < 1 {
		return nil, errors.New("invalid production record")
	}
	raw, err := common.Marshal(payload)
	if err != nil || len(raw) > StudioMaxDocumentBytes {
		return nil, errors.New("production record exceeds its limit")
	}
	sum := sha256.Sum256(raw)
	record := &model.StudioProductionRecord{ID: recordID, ProjectID: projectID, Kind: kind, Revision: revision, State: "ready", Fingerprint: hex.EncodeToString(sum[:]), Document: model.StudioDocument(raw)}
	return model.CreateStudioProductionRecord(actorID, record)
}
