package app

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func structuredBytes(usage repository.UserStorageUsage) int64 {
	return usage.AssetBytes + usage.CanvasBytes
}

func validateStructuredStorageQuotaWithPolicy(usage repository.UserStorageUsage, kind string, creating bool, deltaBytes int64, policy RuntimeResourcePolicy) error {
	if structuredBytes(usage)+deltaBytes > megabytes(policy.StructuredDataMB) {
		return QuotaExceeded(fmt.Sprintf("账号画布和素材数据已达到 %dMB 上限，请先删除不需要的内容", policy.StructuredDataMB))
	}
	if !creating {
		return nil
	}
	switch kind {
	case "asset":
		if usage.AssetCount >= policy.AssetCount {
			return QuotaExceeded(fmt.Sprintf("账号素材数量已达到 %d 个上限", policy.AssetCount))
		}
	case "canvas":
		if usage.CanvasCount >= policy.CanvasCount {
			return QuotaExceeded(fmt.Sprintf("账号画布数量已达到 %d 个上限", policy.CanvasCount))
		}
	}
	return nil
}

func validateTaskStorageQuotaWithPolicy(usage repository.UserStorageUsage, incomingBytes int64, policy RuntimeResourcePolicy) error {
	if usage.TaskCount >= policy.TaskCount {
		return QuotaExceeded(fmt.Sprintf("账号任务历史已达到 %d 条上限，请联系管理员归档", policy.TaskCount))
	}
	return validateTaskDataGrowthQuotaWithPolicy(usage, incomingBytes, policy)
}

func validateTaskDataGrowthQuotaWithPolicy(usage repository.UserStorageUsage, incomingBytes int64, policy RuntimeResourcePolicy) error {
	if usage.TaskBytes+incomingBytes > gigabytes(policy.TaskDataGB) {
		return QuotaExceeded(fmt.Sprintf("账号任务历史数据已达到 %dGB 上限，请联系管理员归档", policy.TaskDataGB))
	}
	return nil
}

func validateAPICallLogQuotaWithPolicy(usage repository.UserStorageUsage, incomingBytes int64, policy RuntimeResourcePolicy) error {
	if usage.APICallCount >= policy.APICallLogCount {
		return QuotaExceeded(fmt.Sprintf("账号上游请求日志已达到 %d 条上限，请联系管理员归档", policy.APICallLogCount))
	}
	return validateTaskDataGrowthQuotaWithPolicy(usage, incomingBytes, policy)
}

func validateStructuredReplacementQuotaWithPolicy(usage repository.UserStorageUsage, kind string, count int, bytes int64, policy RuntimeResourcePolicy) error {
	deltaBytes := bytes
	switch kind {
	case "asset":
		if int64(count) > policy.AssetCount {
			return QuotaExceeded(fmt.Sprintf("账号素材数量不能超过 %d 个", policy.AssetCount))
		}
		deltaBytes -= usage.AssetBytes
	case "canvas":
		if int64(count) > policy.CanvasCount {
			return QuotaExceeded(fmt.Sprintf("账号画布数量不能超过 %d 个", policy.CanvasCount))
		}
		deltaBytes -= usage.CanvasBytes
	}
	return validateStructuredStorageQuotaWithPolicy(usage, kind, false, deltaBytes, policy)
}

func (s *Service) createTaskWithinStorageQuota(task *model.Task, billingOrder *model.BillingOrder, policy RuntimePolicySetting) error {
	s.storageMu.Lock()
	err := func() error {
		defer s.storageMu.Unlock()
		if hasCanvasTaskDraft(*task) {
			draft, err := canvasTaskDraftFor(*task)
			if err != nil {
				return err
			}
			return s.repo.Transaction(func(repo *repository.Repository) error {
				if err := repo.LockCanvasMutation(task.UserID, task.ProjectID); err != nil {
					return err
				}
				if draft != nil {
					if err := bindCanvasTaskDraft(repo, task, draft, policy); err != nil {
						return err
					}
				}
				return createTaskWithStorageQuotaRepository(repo, task, billingOrder, policy)
			})
		}
		return createTaskWithStorageQuotaRepository(s.repo, task, billingOrder, policy)
	}()
	if err == nil {
		s.wakeTaskDispatcher()
	}
	return err
}

func createTaskWithStorageQuotaRepository(repo *repository.Repository, task *model.Task, billingOrder *model.BillingOrder, policy RuntimePolicySetting) error {
	if hasCanvasTaskDraft(*task) {
		task.CanvasDeliveryStatus = "pending"
		task.CanvasDeliveryError = ""
		task.CanvasDeliveryAttempts = 0
		task.CanvasDeliveryNextAttemptAt = nil
	}
	usage, err := repo.UserStorageUsage(task.UserID)
	if err != nil {
		return err
	}
	incomingBytes := int64(len([]byte(task.Prompt)) + len([]byte(task.InputJSON)) + len([]byte(task.Error)))
	incomingBytes += int64(len(task.ClientOperationID) + len(task.CreationIntentSHA256))
	incomingBytes += int64(len(task.ImageLayerDeliveryStatus) + len(task.ImageLayerDeliveryJSON))
	incomingBytes += int64(len(task.CanvasDeliveryStatus) + len(task.CanvasDeliveryError))
	if err := validateTaskStorageQuotaWithPolicy(usage, incomingBytes, policy.Resource); err != nil {
		return err
	}
	if billingOrder != nil {
		return repo.CreateTaskWithCreditReservation(task, billingOrder, policy.Task.ActiveTaskLimit)
	}
	return repo.CreateTaskWithActiveLimit(task, policy.Task.ActiveTaskLimit)
}

// 任务完成会同时扩张任务历史和画布操作数据，必须在同一临界区核算并原子写入。
func (s *Service) saveTaskCompletionWithinStorageQuota(task *model.Task, resultJSON []byte, opsJSON []byte, hasCanvasOps bool) error {
	resultJSON, err := finalizeNativeLayerPlanningResult(task, resultJSON)
	if err != nil {
		return err
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()

	usage, err := s.repo.UserStorageUsage(task.UserID)
	if err != nil {
		return err
	}
	publicInputJSON := publicTaskInputJSONForTask(*task)
	taskDelta := int64(len(resultJSON) + len(publicInputJSON) - len(task.ResultJSON) - len(task.InputJSON))

	results := make([]model.Result, 0, 2)
	if hasCanvasOps {
		results = append(results, model.Result{ID: newID(), UserID: task.UserID, TaskID: task.ID, Kind: "canvas_ops", Payload: string(opsJSON)})
	}
	for index := range results {
		taskDelta += int64(len(results[index].URL) + len(results[index].Payload))
	}
	if err := validateTaskDataGrowthQuotaWithPolicy(usage, taskDelta, policy.Resource); err != nil {
		return err
	}

	expectedStatus := task.Status
	completed := *task
	completed.Status = model.TaskStatusSucceeded
	completed.Stage = "任务完成"
	var planningStatus struct {
		Planning *struct {
			Status string `json:"status"`
		} `json:"imageLayerPlanning"`
	}
	if task.Type == "canvas_text" && json.Unmarshal(resultJSON, &planningStatus) == nil && planningStatus.Planning != nil {
		if planningStatus.Planning.Status == "ready" {
			completed.Stage = "识图规划已保存，待确认图层"
		} else if planningStatus.Planning.Status == "needs_correction" {
			completed.Stage = "识图回复已保存，规划需要修正"
		}
	}
	completed.Progress = 100
	completed.ResultJSON = string(resultJSON)
	completed.InputJSON = publicInputJSON
	completed.CompletedAt = ptr(time.Now())
	var register func(*repository.Repository) error
	visualImage := strings.Contains(task.InputJSON, "project_asset_image")
	canvasDraft := hasCanvasTaskDraft(*task) || isNativeProjectStoryTask(task)
	if task.MediaRecoveryJSON != "" || visualImage || canvasDraft {
		if task.Type != "canvas_text" {
			completed.MediaStage = "completed"
		}
		register = func(repo *repository.Repository) error {
			writer := &Service{repo: repo, dataDir: s.dataDir}
			if visualImage {
				var result map[string]interface{}
				if err := json.Unmarshal(resultJSON, &result); err != nil {
					return err
				}
				if _, err := writer.finalizeProjectAssetImageTask(*task, result); err != nil {
					return err
				}
				encoded, err := json.Marshal(result)
				if err != nil {
					return err
				}
				if err := validateTaskDataGrowthQuotaWithPolicy(usage, taskDelta+int64(len(encoded)-len(resultJSON)), policy.Resource); err != nil {
					return err
				}
				completed.ResultJSON = string(encoded)
			}
			if task.MediaRecoveryJSON == "" && !canvasDraft {
				return nil
			}
			if err := writer.RegisterTaskOutputFromTask(completed); err != nil {
				return err
			}
			if task.MediaRecoveryJSON != "" {
				if err := writer.registerRecoveredMediaAssets(completed); err != nil {
					return err
				}
				previousBytes := len(completed.ResultJSON)
				if err := writer.bindTaskMediaAssetVersions(&completed); err != nil {
					return err
				}
				usage, err := repo.UserStorageUsage(task.UserID)
				if err != nil {
					return err
				}
				if err := validateTaskDataGrowthQuotaWithPolicy(usage, int64(len(completed.ResultJSON)-previousBytes), policy.Resource); err != nil {
					return err
				}
			}
			if canvasDraft {
				if isDedicatedLayerTask(&completed) {
					// The internal group checks the durable source result, including
					// fixed output-version bindings, in this same completion tx.
					if err := repo.SaveSucceededTaskMediaBindings(&completed, string(resultJSON)); err != nil {
						return err
					}
				}
				return s.deliverTerminalCanvasTask(repo, &completed, policy)
			}
			return nil
		}
	}
	if err := s.repo.SaveTaskCompletionWithRegistration(&completed, expectedStatus, results, register); err != nil {
		return err
	}
	*task = completed
	return nil
}
