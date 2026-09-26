package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/tidwall/gjson"
)

const studioAttemptResponseLimit = 8192

type studioAttemptResponseWriter struct {
	gin.ResponseWriter
	preview []byte
}

func (writer *studioAttemptResponseWriter) Write(data []byte) (int, error) {
	if len(writer.preview) < studioAttemptResponseLimit {
		remaining := studioAttemptResponseLimit - len(writer.preview)
		writer.preview = append(writer.preview, data[:min(remaining, len(data))]...)
	}
	return writer.ResponseWriter.Write(data)
}

func (writer *studioAttemptResponseWriter) WriteString(value string) (int, error) {
	if len(writer.preview) < studioAttemptResponseLimit {
		remaining := studioAttemptResponseLimit - len(writer.preview)
		writer.preview = append(writer.preview, value[:min(remaining, len(value))]...)
	}
	return writer.ResponseWriter.WriteString(value)
}

// StudioAttemptAudit records dashboard video submissions before routing so
// failures that never become billable tasks still have a user-visible ID.
func StudioAttemptAudit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost || c.Request.URL.Path != "/pg/studio/videos" {
			c.Next()
			return
		}
		userID := c.GetInt("id")
		if userID <= 0 {
			c.Next()
			return
		}
		var clientRequestID *string
		if values, supplied := c.Request.Header[http.CanonicalHeaderKey("X-Studio-Request-ID")]; supplied {
			if len(values) != 1 {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error": gin.H{"code": "studio_request_id_invalid", "message": "Studio request ID must be a UUID"},
				})
				return
			}
			parsed, err := uuid.Parse(values[0])
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error": gin.H{"code": "studio_request_id_invalid", "message": "Studio request ID must be a UUID"},
				})
				return
			}
			canonical := parsed.String()
			clientRequestID = &canonical
			c.Header("X-Studio-Request-ID", canonical)
		}
		requestedGroup := c.Query("studio_group")
		if requestedGroup == "" {
			requestedGroup = c.GetHeader("X-Studio-Group")
		}
		attempt := model.StudioAttempt{
			ID:              uuid.NewString(),
			UserID:          userID,
			ClientRequestID: clientRequestID,
			Stage:           "started",
		}
		if err := model.CreateStudioAttempt(&attempt); err != nil {
			if clientRequestID != nil {
				existing, lookupErr := model.GetStudioAttemptByRequest(userID, *clientRequestID)
				if lookupErr == nil && existing != nil {
					c.Header("X-Studio-Attempt-ID", existing.ID)
					c.AbortWithStatusJSON(http.StatusConflict, gin.H{
						"error": gin.H{
							"code": "studio_submission_exists", "message": "Studio submission already exists; reconcile before retrying",
							"attempt_id": existing.ID, "stage": existing.Stage, "task_id": existing.TaskID,
						},
					})
					return
				}
			}
			logger.LogError(c.Request.Context(), fmt.Sprintf("studio attempt insert failed: %v", err))
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error": gin.H{"code": "studio_attempt_unavailable", "message": "Studio submission log is unavailable"},
			})
			return
		}
		c.Header("X-Studio-Attempt-ID", attempt.ID)
		writer := &studioAttemptResponseWriter{ResponseWriter: c.Writer}
		c.Writer = writer
		c.Next()

		attempt.HTTPStatus = c.Writer.Status()
		attempt.Group = requestedGroup
		if attempt.Group == "" {
			attempt.Group = common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
		}
		if requestValue, exists := c.Get(contextKeyTaskPluginEndpointModel); exists {
			if request, ok := requestValue.(ModelRequest); ok {
				attempt.Model = request.Model
			}
		}
		if attempt.Model == "" {
			if request, err := getModelFromRequest(c); err == nil {
				attempt.Model = request.Model
			}
		}
		attempt.ChannelID = common.GetContextKeyInt(c, constant.ContextKeyChannelId)
		if pinnedValue, exists := c.Get(pluginruntime.ContextKeyPinnedEndpoint); exists {
			if pinned, ok := pinnedValue.(pluginruntime.PinnedEndpoint); ok && pinned.Plugin != nil {
				attempt.PluginKey = pinned.Plugin.Meta.Key
			}
		}
		if attempt.HTTPStatus >= http.StatusBadRequest {
			attempt.Stage = "rejected_before_channel"
			if attempt.ChannelID > 0 {
				attempt.Stage = "rejected_after_channel"
			}
			attempt.ErrorCode = gjson.GetBytes(writer.preview, "error.code").String()
			if attempt.ErrorCode == "" {
				attempt.ErrorCode = gjson.GetBytes(writer.preview, "code").String()
			}
			if attempt.ErrorCode == "" {
				attempt.ErrorCode = "request_failed"
			}
		} else {
			attempt.TaskID = gjson.GetBytes(writer.preview, "id").String()
			if attempt.TaskID == "" {
				attempt.TaskID = gjson.GetBytes(writer.preview, "task_id").String()
			}
			attempt.Stage = "accepted"
			if attempt.TaskID != "" {
				attempt.Stage = "submitted"
			}
		}
		if len(attempt.Group) > 100 {
			attempt.Group = string([]rune(attempt.Group)[:min(100, len([]rune(attempt.Group)))])
		}
		if len([]rune(attempt.Model)) > 200 {
			attempt.Model = string([]rune(attempt.Model)[:200])
		}
		if len(attempt.TaskID) > 191 || strings.ContainsAny(attempt.TaskID, "\r\n?/") {
			attempt.TaskID = ""
		}
		if len(attempt.ErrorCode) > 100 || strings.IndexFunc(attempt.ErrorCode, func(r rune) bool {
			return !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_' || r == '-' || r == '.')
		}) >= 0 {
			attempt.ErrorCode = "request_failed"
		}
		if err := model.FinishStudioAttempt(&attempt); err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("studio attempt update failed id=%s: %v", attempt.ID, err))
		}
	}
}
