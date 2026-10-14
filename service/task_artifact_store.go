package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// StoredArtifactRef describes a persisted artifact object.
type StoredArtifactRef struct {
	Backend   string
	Bucket    string
	ObjectKey string
	MimeType  string
	Size      int64
}

// TaskArtifactStore is the persistence boundary for generated artifact bytes.
// types.TaskArtifact is re-exported by relay/channel as channel.TaskArtifact.
type TaskArtifactStore interface {
	Enabled() bool
	Resolve(task *model.Task, artifactKey string) (*StoredArtifactRef, error)
	Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error)
	Serve(c *gin.Context, task *model.Task, ref *StoredArtifactRef) error
}

var ErrTaskArtifactStoreDisabled = errors.New("task artifact store is disabled")

type disabledArtifactStore struct{}

func (disabledArtifactStore) Enabled() bool {
	return false
}

func (disabledArtifactStore) Resolve(*model.Task, string) (*StoredArtifactRef, error) {
	return nil, nil
}

func (disabledArtifactStore) Persist(context.Context, *model.Task, types.TaskArtifact, io.Reader) (*StoredArtifactRef, error) {
	return nil, ErrTaskArtifactStoreDisabled
}

func (disabledArtifactStore) Serve(*gin.Context, *model.Task, *StoredArtifactRef) error {
	return ErrTaskArtifactStoreDisabled
}

type studioArtifactStore struct{}

func (studioArtifactStore) Enabled() bool {
	return os.Getenv("STUDIO_STORE_TASK_ARTIFACTS") == "true" || system_setting.LoadTaskArtifactStoreConfig().Mode == system_setting.TaskArtifactStoreModeS3
}

func studioTaskArtifactID(task *model.Task, key string) string {
	digest := sha256.Sum256([]byte(task.TaskID + "\n" + key))
	return "artifact-" + hex.EncodeToString(digest[:])
}

func (store studioArtifactStore) Resolve(task *model.Task, key string) (*StoredArtifactRef, error) {
	if !store.Enabled() {
		return nil, nil
	}
	media, err := GetStudioMedia(task.UserId, studioTaskArtifactID(task, key))
	if err != nil {
		return nil, nil
	}
	backend := "local"
	if strings.HasPrefix(media.ObjectKey, "s3://") {
		backend = "s3"
	}
	return &StoredArtifactRef{Backend: backend, ObjectKey: media.MediaID, MimeType: media.MimeType, Size: media.Size}, nil
}

func (store studioArtifactStore) Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error) {
	if !store.Enabled() {
		return nil, ErrTaskArtifactStoreDisabled
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	mediaType := artifact.MimeType
	if mediaType == "" {
		switch artifact.Type {
		case "video":
			mediaType = "video/mp4"
		case "image":
			mediaType = "image/png"
		case "audio":
			mediaType = "audio/mpeg"
		default:
			return nil, errors.New("artifact media type is required")
		}
	}
	media, err := SaveStudioMedia(task.UserId, studioTaskArtifactID(task, artifact.Key), mediaType, content)
	if err != nil {
		return nil, err
	}
	return &StoredArtifactRef{Backend: "studio", ObjectKey: media.MediaID, MimeType: media.MimeType, Size: media.Size}, nil
}

func (studioArtifactStore) Serve(c *gin.Context, task *model.Task, ref *StoredArtifactRef) error {
	if !(studioArtifactStore{}).Enabled() {
		return ErrTaskArtifactStoreDisabled
	}
	media, err := GetStudioMedia(task.UserId, ref.ObjectKey)
	if err != nil {
		return err
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return err
	}
	c.Header("Content-Type", media.MimeType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.File(path)
	return nil
}

var taskArtifactStore TaskArtifactStore = &studioArtifactStore{}

func init() {
	_ = system_setting.LoadTaskArtifactStoreConfig()
}

// GetTaskArtifactStore returns the configured durable artifact storage backend.
func GetTaskArtifactStore() TaskArtifactStore {
	return taskArtifactStore
}
