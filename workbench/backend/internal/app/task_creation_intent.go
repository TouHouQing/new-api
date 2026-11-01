package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"strings"
	"yingce/backend/internal/model"
)

type publicTaskIntent struct{ ID, Key, SHA256 string }

func publicTaskIntentID(userID, key string) string {
	return projectCreationHash([]byte("native-task-intent-v1\x00" + userID + "\x00" + key))[:32]
}

// Public retries reuse the original admitted task, before consulting a model
// catalog that may have changed since the server accepted the first request.
func (s *Service) CreateTask(userID string, req CreateTaskRequest) (*model.Task, error) {
	if req.admission != nil || req.creationPrepare != nil {
		return s.createTask(userID, req)
	}
	intent, err := publicTaskIntentForRequest(userID, req)
	if err != nil {
		return nil, err
	}
	if intent == nil {
		return s.createTask(userID, req)
	}
	replay := func() (*model.Task, error) {
		return s.replayPublicTaskIntent(userID, intent)
	}
	if existing, err := replay(); err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	req.publicIntent = intent
	task, err := s.createTask(userID, req)
	if err == nil {
		return task, nil
	}
	// A concurrent insert can win while this request waits for the account
	// lock. Its task and credit reservation commit together; the losing
	// transaction rolls back before this owned canonical lookup.
	if existing, replayErr := replay(); replayErr == nil {
		return existing, nil
	} else if !errors.Is(replayErr, gorm.ErrRecordNotFound) {
		return nil, replayErr
	}
	return nil, err
}

func publicTaskIntentForRequest(userID string, req CreateTaskRequest) (*publicTaskIntent, error) {
	metadata, _ := req.Input["metadata"].(map[string]any)
	raw, exists := metadata["clientOperationId"]
	if !exists {
		return nil, nil
	}
	key, ok := raw.(string)
	if !ok || key != strings.TrimSpace(key) || !validCutRequestID(key) {
		return nil, BadAuthRequest("请提供有效且稳定的生成操作编号")
	}
	body, err := json.Marshal(struct {
		ProjectID, Type, Operation, Prompt, Provider, Model, LogicalModelID string
		Input                                                               map[string]any
	}{req.ProjectID, req.Type, req.Operation, req.Prompt, req.Provider, req.Model, req.LogicalModelID, req.Input})
	if err != nil {
		return nil, BadAuthRequest("生成输入无法序列化")
	}
	return &publicTaskIntent{ID: publicTaskIntentID(userID, key), Key: key, SHA256: projectCreationHash(body)}, nil
}

func (s *Service) replayPublicTaskIntent(userID string, intent *publicTaskIntent) (*model.Task, error) {
	task, err := s.repo.Task(intent.ID)
	if err != nil {
		return nil, err
	}
	if task.UserID != userID || task.ClientOperationID != intent.Key || task.CreationIntentSHA256 != intent.SHA256 {
		e := NewAppError(409, "同一生成操作编号不能提交不同内容，请先核对原任务")
		e.Reason = "task_intent_changed"
		return nil, e
	}
	return taskForOutput(*task), nil
}

func (s *Service) TaskByClientOperation(userID, key string) (*model.Task, error) {
	if !validCutRequestID(key) {
		return nil, BadAuthRequest("无效的生成操作编号")
	}
	task, err := s.repo.Task(publicTaskIntentID(userID, key))
	if err != nil {
		return nil, shotOperationError(err)
	}
	if task.UserID != userID || task.ClientOperationID != key {
		return nil, NotFound("未找到该生成请求")
	}
	return taskForOutput(*task), nil
}
