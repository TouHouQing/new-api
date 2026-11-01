package app

import (
	"context"
	"fmt"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func (s *Service) startNativeCanvasTaskDelivery(ctx context.Context) {
	s.runWorkerLoop(func(ctx context.Context) {
		recoveredLegacyLayers := false
		reconcile := func() {
			if ctx.Err() != nil || s.IsDraining() {
				return
			}
			if !recoveredLegacyLayers {
				if s.repairLegacyDedicatedCanvasDeliveries(ctx) == nil {
					recoveredLegacyLayers = true
				}
			}
			ids, err := s.repo.WithContext(ctx).PendingCanvasTaskDeliveries(time.Now(), 32)
			if err != nil {
				return
			}
			for _, id := range ids {
				if ctx.Err() != nil || s.IsDraining() {
					return
				}
				attemptCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
				_ = s.reconcileCanvasTaskDelivery(attemptCtx, id)
				cancel()
			}
		}
		reconcile()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
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

func (s *Service) reconcileCanvasTaskDelivery(ctx context.Context, id string) error {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.WithContext(ctx).WithPendingCanvasTaskDelivery(id, time.Now(), func(repo *repository.Repository, task *model.Task) error {
		return s.deliverTerminalCanvasTask(repo, task, policy)
	})
}

func (s *Service) deliverTerminalCanvasTask(repo *repository.Repository, task *model.Task, policy RuntimePolicySetting) error {
	if task.CanvasDeliveryStatus != "pending" {
		return nil
	}
	original := *task
	err := repo.Transaction(func(tx *repository.Repository) error {
		var applied bool
		var err error
		message := ""
		if isNativeProjectStoryTask(task) {
			applied, message, err = s.applyNativeProjectStory(tx, task, policy)
		} else if task.Status == model.TaskStatusSucceeded && isDedicatedLayerTask(task) {
			applied, err = s.applyDedicatedCanvasLayers(tx, task, policy)
		} else {
			applied, err = applyCanvasTaskDraft(tx, *task, policy)
		}
		if err != nil {
			return err
		}
		status := "applied"
		if !applied {
			status = "skipped"
		}
		return tx.SaveCanvasTaskDelivery(task, status, message, nil)
	})
	if err == nil {
		return nil
	}
	*task = original
	delay := time.Duration(10*(1<<min(task.CanvasDeliveryAttempts, 6))) * time.Second
	next := time.Now().Add(delay)
	message := "任务已完成处理，画布暂未同步；后台会继续保存，原结果仍在任务中心"
	if isNativeProjectStoryTask(task) {
		message = "章节生成已完成，正文暂未保存；后台会继续处理，原回复保留在任务中心"
	}
	// Status and retry scheduling survive even if the account cannot store an
	// additional diagnostic. This path never changes task status or billing.
	usage, readErr := repo.UserStorageUsage(task.UserID)
	if readErr != nil {
		return readErr
	}
	if validateTaskDataGrowthQuotaWithPolicy(usage, int64(len(message)-len(task.CanvasDeliveryError)), policy.Resource) != nil {
		message = task.CanvasDeliveryError
	}
	if saveErr := repo.SaveCanvasTaskDelivery(task, "pending", message, &next); saveErr != nil {
		return saveErr
	}
	_ = (&Service{repo: repo}).log(task.UserID, task.ID, "warn", "画布回写暂未完成，将按原任务继续保存", fmt.Sprintf("attempt=%d: %s", task.CanvasDeliveryAttempts, truncateRunes(redactUpstreamAddress(err.Error()), 1000)))
	return nil
}
