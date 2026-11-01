package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type imageLayerWorkflowMutation func(*Service, map[string]map[string]any, map[string]any, bool) ([]canvas.CanvasOperation, error)

func (s *Service) mutateImageLayerWorkflow(parent *model.Task, input imageLayerWorkflowInput, stage string, build imageLayerWorkflowMutation, finish func(*repository.Repository) error) error {
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.Transaction(func(repo *repository.Repository) error {
		if _, err := repo.LockRunningTask(parent.UserID, parent.ID, parent.LeaseOwner); err != nil {
			return err
		}
		if err := repo.LockCanvasMutation(parent.UserID, parent.ProjectID); err != nil {
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(parent); err != nil {
			return err
		}
		project, err := repo.CanvasProjectForUser(parent.UserID, parent.ProjectID)
		if err != nil {
			return err
		}
		var doc struct {
			Nodes []map[string]any `json:"nodes"`
		}
		if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil {
			return BadAuthRequest("无法读取拆层画布")
		}
		byID := map[string]map[string]any{}
		for _, node := range doc.Nodes {
			id, _ := node["id"].(string)
			byID[id] = node
		}
		root := byID[input.NodeID]
		meta, _ := root["metadata"].(map[string]any)
		marker, _ := meta["nativeImageLayerWorkflow"].(map[string]any)
		if root["type"] != "image" || marker["taskId"] != parent.ID || marker["requestSha256"] != input.RequestSHA256 {
			return imageMaterialSourceChanged()
		}
		mutationID := "image-layer-workflow:" + parent.ID + ":" + stage
		_, err = repo.CanvasMutationReceiptForUser(parent.UserID, parent.ProjectID, mutationID)
		replayed := err == nil
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		ops, err := build(writer, byID, root, replayed)
		if err != nil {
			return err
		}
		if !replayed && len(ops) > 0 {
			base := project.Revision
			_, err := writer.canvasDomain().ApplyUserCanvasOperations(parent.UserID, parent.ProjectID, canvas.CanvasOperationsRequest{MutationID: mutationID, BaseRevision: &base, Operations: ops, TrustedServerMutation: true})
			if err != nil {
				return err
			}
		}
		if finish != nil {
			return finish(repo)
		}
		return nil
	})
}

func (s *Service) admitImageLayerWorkflowChild(parent model.Task, child *model.Task, order *model.BillingOrder) error {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.Transaction(func(repo *repository.Repository) error {
		if _, err := repo.LockRunningTask(parent.UserID, parent.ID, parent.LeaseOwner); err != nil {
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(&parent); err != nil {
			return err
		}
		user, err := repo.User(parent.UserID)
		if err != nil {
			return err
		}
		if user.Status != model.UserStatusActive {
			return Forbidden("当前账号不能继续拆层")
		}
		if err := requireStoredFileCapacityRepository(repo, parent.UserID, child.Type, policy, s.pendingStorage[parent.UserID]); err != nil {
			return err
		}
		return createTaskWithStorageQuotaRepository(repo, child, order, policy)
	})
}
