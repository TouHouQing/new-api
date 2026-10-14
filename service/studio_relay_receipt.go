package service

import (
	"os"

	"github.com/QuantumNous/new-api/model"
)

// Private receipts make result collection resumable even for synchronous
// generation endpoints. They are not linked to the editable project document.
func LoadStudioRelayReceipt(ownerID int, mediaID string) (StudioRelayResponse, error) {
	media, err := GetStudioMedia(ownerID, mediaID)
	if err != nil {
		return StudioRelayResponse{}, err
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return StudioRelayResponse{}, err
	}
	if err := finishStudioObjectPersistence(media, path); err != nil {
		return StudioRelayResponse{}, err
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return StudioRelayResponse{}, err
	}
	return StudioRelayResponse{Status: 200, ContentType: media.MimeType, Body: body}, nil
}

func ReconcileStudioRelayReceipt(job *model.StudioWorkflowJob, progress *StudioWorkflowProgress) error {
	if progress.RequestID == "" || progress.Take != nil || progress.TaskID != "" {
		return nil
	}
	project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
	if err != nil {
		return err
	}
	if media, err := GetStudioMedia(project.OwnerID, "receipt-"+progress.RequestID); err == nil {
		progress.ResponseMediaID, progress.Phase = media.MediaID, "responded"
	}
	return nil
}
