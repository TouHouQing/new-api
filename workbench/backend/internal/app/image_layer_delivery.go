package app

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"yingce/backend/internal/model"
)

type ImageLayerDelivery struct {
	Status   string `json:"status"`
	CanvasID string `json:"canvasId"`
	NodeID   string `json:"nodeId"`
	Revision int64  `json:"revision,omitempty"`
	Reason   string `json:"reason,omitempty"`
	Message  string `json:"message,omitempty"`
}

func (s *Service) deliverNativeImageLayerGroup(task *model.Task) {
	if task.Type != model.TaskTypeImageOperation || (task.Operation != "compose" && task.Operation != "trim-layers") {
		return
	}
	latest, err := s.repo.TaskForUser(task.UserID, task.ID)
	if err != nil || latest.Status != model.TaskStatusSucceeded || latest.ImageLayerDeliveryStatus != "pending" {
		return
	}
	input, err := decodeImageOperationInput(latest)
	if err != nil || input.Request.SourceGroupSHA256 == "" && !imageMaterialTask(input) {
		return
	}
	_, err = s.ApplyImageOperationTask(task.UserID, task.ID, ImageOperationApplyRequest{RequestID: "image-layer-group-apply:" + task.ID})
	if err == nil {
		return
	}
	var appError *AppError
	if !errors.As(err, &appError) || appError.Reason == "quota_exceeded" || (appError.Status != 404 && appError.Reason != "image_operation_source_changed" && appError.Status != 403 && appError.Status != 400) {
		// A transient infrastructure or quota failure retains its durable pending
		// state; reconciliation rotates through other tasks before retrying.
		return
	}
	delivery, _ := json.Marshal(ImageLayerDelivery{Status: "detached", CanvasID: task.ProjectID, NodeID: input.Request.SourceNodeID, Reason: "image_operation_source_changed", Message: "图层组或访问权限已变化，图片保留在素材库，未覆盖当前作品"})
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(task.UserID, int64(len(delivery)+len("detached")-len(latest.ImageLayerDeliveryJSON)-len(latest.ImageLayerDeliveryStatus))); err != nil {
		return
	}
	_ = s.repo.UpdateImageLayerDelivery(task.UserID, task.ID, "pending", "detached", string(delivery))
}

func (s *Service) startNativeImageLayerDelivery(ctx context.Context) {
	s.runWorkerLoop(func(ctx context.Context) {
		after := ""
		cancelAfter := ""
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		reconcile := func() {
			if ctx.Err() != nil || s.IsDraining() {
				return
			}
			cancelled, cancelErr := s.repo.WithContext(ctx).CancelledImageLayerWorkflows(cancelAfter, 5)
			if cancelErr == nil {
				if len(cancelled) == 0 {
					cancelAfter = ""
				}
				for i := range cancelled {
					if ctx.Err() != nil {
						return
					}
					_ = s.cancelImageLayerWorkflow(&cancelled[i])
					cancelAfter = cancelled[i].ID
				}
			}
			rows, err := s.repo.WithContext(ctx).PendingImageLayerDeliveries(after, 5)
			if err != nil {
				return
			}
			if len(rows) == 0 {
				after = ""
				return
			}
			for index := range rows {
				if ctx.Err() != nil || s.IsDraining() {
					return
				}
				s.deliverNativeImageLayerGroup(&rows[index])
				after = rows[index].ID
			}
		}
		reconcile()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				reconcile()
			}
		}
	})
}
