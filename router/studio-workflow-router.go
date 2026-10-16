package router

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type studioWorkerContextKey struct{}

type studioRelayRecorder struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func (writer *studioRelayRecorder) Header() http.Header { return writer.header }

// Relay handlers flush non-streaming bodies before settlement. The private
// recorder keeps those bytes in memory and must satisfy the same HTTP contract.
func (writer *studioRelayRecorder) Flush() {
	if writer.status == 0 {
		writer.status = http.StatusOK
	}
}
func (writer *studioRelayRecorder) WriteHeader(status int) {
	if writer.status == 0 {
		writer.status = status
	}
}
func (writer *studioRelayRecorder) Write(data []byte) (int, error) {
	if writer.body.Len()+len(data) > service.StudioMaxMediaBytes {
		return 0, errors.New("relay response exceeds the media limit")
	}
	if writer.status == 0 {
		writer.status = http.StatusOK
	}
	return writer.body.Write(data)
}

// This engine is never attached to a listening socket. Only a database-claimed
// workflow can enter it; requests still use current account/group permissions,
// model distribution and the gateway's normal billing and task tracking.
func configureStudioWorkflowRelay() {
	engine := gin.New()
	engine.Use(gin.Recovery(), func(c *gin.Context) {
		defer func() {
			if c.Request.Method == http.MethodPost && common.GetContextKeyInt(c, constant.ContextKeyChannelId) == 0 {
				c.Header("X-Studio-Prechannel-Rejection", "true")
			}
		}()
		job, ok := c.Request.Context().Value(studioWorkerContextKey{}).(*model.StudioWorkflowJob)
		if !ok || job.UserID <= 0 {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		user, err := model.GetUserCache(job.UserID)
		if err != nil || user.Status != common.UserStatusEnabled {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Set("id", user.Id)
		c.Set("username", user.Username)
		c.Set("role", user.Role)
		c.Set("group", user.Group)
		c.Set("user_group", user.Group)
		c.Set("studio_workflow_relay", true)
		user.WriteContext(c)
		if !strings.HasSuffix(c.Request.URL.Path, "/content") {
			var current model.StudioWorkflowJob
			if err := model.DB.Where("id = ? AND user_id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", job.ID, job.UserID, "running", job.LeaseOwner, time.Now().Unix()).First(&current).Error; err != nil {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			if _, _, err := model.StudioProjectAccess(model.DB, job.UserID, current.ProjectID, true); err != nil {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			group := c.GetHeader("X-Studio-Group")
			if group == "" {
				group = user.Group
			}
			if !service.IsUserSelectableGroup(user.Group, group) {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
			identity := &model.Token{UserId: user.Id, Name: "studio-workflow", Group: group, UnlimitedQuota: true}
			if err := middleware.SetupContextForToken(c, identity); err != nil {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			requestID := c.GetHeader("X-Studio-Request-ID")
			if requestID == "" {
				requestID = common.NewRequestId()
			}
			if err := model.EnsureStudioWorkflowCharge(job.UserID, job.ID, requestID); err != nil {
				c.AbortWithStatus(http.StatusServiceUnavailable)
				return
			}
			common.SetContextKey(c, common.RequestIdKey, requestID)
			c.Set("studio_workflow_id", job.ID)
		}
		c.Next()
		if c.Request.Method == http.MethodPost && c.Writer.Status() >= http.StatusBadRequest {
			// A rejected free request has no BillingSession to finalize its zero reservation.
			var charge model.StudioWorkflowCharge
			requestID := common.GetContextKeyString(c, common.RequestIdKey)
			if model.DB.Where("request_id = ? AND user_id = ? AND quota = 0", requestID, job.UserID).First(&charge).Error == nil {
				_ = model.UpdateStudioWorkflowCharge(job.UserID, job.ID, requestID, 0, false, true)
			}
		}
	})
	engine.Use(func(c *gin.Context) {
		if c.Request.Method == http.MethodPost {
			middleware.SystemPerformanceCheck()(c)
			return
		}
		c.Next()
	})
	engine.POST("/v1/chat/completions", middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) { controller.Relay(c, types.RelayFormatOpenAI) })
	engine.POST("/v1/audio/speech", middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) { controller.Relay(c, types.RelayFormatOpenAIAudio) })
	engine.POST("/v1/audio/transcriptions", middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) { controller.Relay(c, types.RelayFormatOpenAIAudio) })
	engine.POST("/v1/images/generations", middleware.ModelRequestRateLimit(), middleware.PinTaskPluginEndpoint(), middleware.PrepareTaskPluginEndpoint(), middleware.Distribute(), func(c *gin.Context) {
		controller.RelayTaskPluginEndpoint(c, func(c *gin.Context) { controller.Relay(c, types.RelayFormatOpenAIImage) })
	})
	engine.POST("/v1/images/edits", middleware.ModelRequestRateLimit(), middleware.PinTaskPluginEndpoint(), middleware.PrepareTaskPluginEndpoint(), middleware.Distribute(), func(c *gin.Context) {
		controller.RelayTaskPluginEndpoint(c, func(c *gin.Context) { controller.Relay(c, types.RelayFormatOpenAIImage) })
	})
	engine.POST("/v1/videos", middleware.StudioAttemptAudit(), middleware.PinTaskPluginEndpoint(), middleware.TaskPluginEndpointOnly(middleware.ModelRequestRateLimit()), middleware.PrepareTaskPluginEndpoint(), middleware.Distribute(), func(c *gin.Context) { controller.RelayTaskPluginEndpoint(c, controller.RelayTask) })
	engine.GET("/v1/videos/:task_id/content", controller.VideoProxy)
	engine.POST("/v1/tasks/:key", middleware.StudioAttemptAudit(), middleware.ModelRequestRateLimit(), middleware.PrepareTaskPluginSubmit(), middleware.Distribute(), controller.RelayTask)
	engine.GET("/v1/tasks/:key/artifacts/:artifact_key/content", controller.TaskArtifactContent)
	service.StudioWorkflowRelay = func(ctx context.Context, job *model.StudioWorkflowJob, kind string, body []byte) (service.StudioRelayResponse, error) {
		path := ""
		method := http.MethodPost
		switch kind {
		case "text":
			path = "/v1/chat/completions"
		case "image":
			path = "/v1/images/generations"
		case "audio":
			path = "/v1/audio/speech"
		case "transcription":
			path = "/v1/audio/transcriptions"
		case "video":
			path = "/v1/videos"
		case "production-media":
			path = "/v1/tasks/studio-media"
		default:
			if taskID, ok := strings.CutPrefix(kind, "media:"); ok {
				path = "/v1/videos/" + url.PathEscape(taskID) + "/content"
				method = http.MethodGet
			} else if artifact, ok := strings.CutPrefix(kind, "artifact:"); ok {
				taskID, key, multiple := strings.Cut(artifact, ":")
				if !multiple {
					key = "output"
				}
				if !service.StudioIDPattern.MatchString(taskID) || !service.StudioIDPattern.MatchString(key) {
					return service.StudioRelayResponse{}, errors.New("invalid worker artifact")
				}
				path = "/v1/tasks/" + url.PathEscape(taskID) + "/artifacts/" + url.PathEscape(key) + "/content"
				method = http.MethodGet
			} else {
				return service.StudioRelayResponse{}, errors.New("unsupported worker relay")
			}
		}
		group := ""
		if len(body) > 0 {
			var payload map[string]any
			if err := common.Unmarshal(body, &payload); err != nil {
				return service.StudioRelayResponse{}, err
			}
			group, _ = payload["studio_group"].(string)
			delete(payload, "studio_group")
			var err error
			body, err = common.Marshal(payload)
			if err != nil {
				return service.StudioRelayResponse{}, err
			}
		}
		contentType := "application/json"
		if kind == "image" {
			var payload map[string]any
			if err := common.Unmarshal(body, &payload); err != nil {
				return service.StudioRelayResponse{}, err
			}
			images, _ := payload["images"].([]any)
			if len(images) > 0 {
				if len(images) > 12 {
					return service.StudioRelayResponse{}, errors.New("too many image references")
				}
				path = "/v1/images/edits"
				delete(payload, "images")
				var buffer bytes.Buffer
				form := multipart.NewWriter(&buffer)
				for index, value := range images {
					image, _ := value.(string)
					prefix, encoded, valid := strings.Cut(image, ",")
					if !valid || !strings.HasPrefix(prefix, "data:image/") || !strings.HasSuffix(prefix, ";base64") || len(encoded) > 16<<20 {
						return service.StudioRelayResponse{}, errors.New("invalid inline reference image")
					}
					decoded, err := base64.StdEncoding.DecodeString(encoded)
					if err != nil || len(decoded) > 12<<20 {
						return service.StudioRelayResponse{}, errors.New("invalid reference image bytes")
					}
					mimeType := strings.TrimSuffix(strings.TrimPrefix(prefix, "data:"), ";base64")
					extension := map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}[mimeType]
					if extension == "" {
						return service.StudioRelayResponse{}, errors.New("reference must be a supported raster image")
					}
					headers := make(textproto.MIMEHeader)
					headers.Set("Content-Disposition", fmt.Sprintf(`form-data; name="image[]"; filename="reference-%d.%s"`, index, extension))
					headers.Set("Content-Type", mimeType)
					part, err := form.CreatePart(headers)
					if err != nil {
						return service.StudioRelayResponse{}, err
					}
					if _, err := part.Write(decoded); err != nil {
						return service.StudioRelayResponse{}, err
					}
				}
				for key, value := range payload {
					if value != nil {
						text, isString := value.(string)
						if !isString {
							encoded, err := common.Marshal(value)
							if err != nil {
								return service.StudioRelayResponse{}, err
							}
							text = string(encoded)
						}
						if err := form.WriteField(key, text); err != nil {
							return service.StudioRelayResponse{}, err
						}
					}
				}
				if err := form.Close(); err != nil {
					return service.StudioRelayResponse{}, err
				}
				body, contentType = buffer.Bytes(), form.FormDataContentType()
			}
		}
		if kind == "transcription" {
			var payload map[string]any
			if err := common.Unmarshal(body, &payload); err != nil {
				return service.StudioRelayResponse{}, err
			}
			project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
			if err != nil {
				return service.StudioRelayResponse{}, err
			}
			mediaID, _ := payload["audio_media_id"].(string)
			delete(payload, "audio_media_id")
			media, err := service.GetStudioMedia(project.OwnerID, mediaID)
			if err != nil {
				return service.StudioRelayResponse{}, err
			}
			localPath, err := service.StudioMediaPath(media)
			if err != nil {
				return service.StudioRelayResponse{}, err
			}
			file, err := os.Open(localPath)
			if err != nil {
				return service.StudioRelayResponse{}, err
			}
			defer file.Close()
			body, contentType, err = studioTranscriptionMultipart(media.MimeType, file, payload)
			if err != nil {
				return service.StudioRelayResponse{SafeToRetry: true}, err
			}
		}
		request, err := http.NewRequestWithContext(context.WithValue(ctx, studioWorkerContextKey{}, job), method, path, bytes.NewReader(body))
		if err != nil {
			return service.StudioRelayResponse{}, err
		}
		request.Host = "studio-worker.internal"
		request.Header.Set("Content-Type", contentType)
		request.Header.Set("X-Studio-Group", group)
		var progress service.StudioWorkflowProgress
		if common.Unmarshal([]byte(job.Result), &progress) == nil && progress.RequestID != "" {
			request.Header.Set("X-Studio-Request-ID", progress.RequestID)
		}
		if method == http.MethodPost && request.Header.Get("X-Studio-Request-ID") == "" {
			request.Header.Set("X-Studio-Request-ID", uuid.NewString())
		}
		writer := studioRelayRecorder{header: make(http.Header)}
		engine.ServeHTTP(&writer, request)
		if method == http.MethodPost && writer.status >= 200 && writer.status < 300 {
			var response struct {
				ID string `json:"id"`
			}
			_ = common.Unmarshal(writer.body.Bytes(), &response)
			var task model.Task
			pending := response.ID != "" && model.DB.Where("user_id = ? AND task_id = ?", job.UserID, response.ID).First(&task).Error == nil && task.Status != model.TaskStatusSuccess && task.Status != model.TaskStatusFailure
			if !pending {
				var charge model.StudioWorkflowCharge
				if model.DB.Where("request_id = ? AND user_id = ?", request.Header.Get("X-Studio-Request-ID"), job.UserID).First(&charge).Error == nil {
					if err := model.UpdateStudioWorkflowCharge(job.UserID, job.ID, charge.RequestID, charge.Quota, false, true); err != nil {
						return service.StudioRelayResponse{}, err
					}
				}
			}
		}
		if err := ctx.Err(); err != nil {
			return service.StudioRelayResponse{}, err
		}
		return service.StudioRelayResponse{Status: writer.status, ContentType: writer.header.Get("Content-Type"), Body: writer.body.Bytes(), SafeToRetry: writer.status >= 400 && writer.header.Get("X-Studio-Prechannel-Rejection") == "true"}, nil
	}
}

func studioTranscriptionMultipart(mimeType string, file io.Reader, payload map[string]any) ([]byte, string, error) {
	extension := map[string]string{"audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/x-flac": "flac", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/webm": "webm"}[mimeType]
	if extension == "" {
		return nil, "", errors.New("unsupported transcription audio format")
	}
	var buffer bytes.Buffer
	form := multipart.NewWriter(&buffer)
	headers := make(textproto.MIMEHeader)
	headers.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="audio.%s"`, extension))
	headers.Set("Content-Type", mimeType)
	part, err := form.CreatePart(headers)
	if err != nil {
		return nil, "", err
	}
	if _, err := io.Copy(part, io.LimitReader(file, 20<<20)); err != nil {
		return nil, "", err
	}
	for key, value := range payload {
		if text, ok := value.(string); ok && text != "" {
			if err := form.WriteField(key, text); err != nil {
				return nil, "", err
			}
		}
	}
	if err := form.Close(); err != nil {
		return nil, "", err
	}
	return buffer.Bytes(), form.FormDataContentType(), nil
}
