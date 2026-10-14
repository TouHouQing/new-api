package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	studioagent "github.com/QuantumNous/new-api/integrations/studio-agent"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func studioBridgeError(c *gin.Context, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, service.ErrStudioBridgeUnavailable) {
		status = http.StatusNotFound
	}
	if errors.Is(err, service.ErrStudioBridgeConflict) {
		status = http.StatusConflict
	}
	if errors.Is(err, service.ErrStudioBridgePermission) {
		status = http.StatusForbidden
	}
	c.JSON(status, gin.H{"success": false, "message": err.Error()})
}

func studioBridgeDecode(c *gin.Context, value any, limit int64) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
	data, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "Studio bridge request is too large"})
		return false
	}
	if err = common.Unmarshal(data, value); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Studio bridge request is invalid"})
		return false
	}
	return true
}

func studioBridgeBrowser(c *gin.Context) (string, bool) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Only the connected browser can publish or execute Studio commands"})
		return "", false
	}
	return identity.SessionID, true
}

func OpenStudioBridge(c *gin.Context) {
	browser, ok := studioBridgeBrowser(c)
	if !ok {
		return
	}
	var input service.StudioBridgeOpen
	if !studioBridgeDecode(c, &input, 5<<20) {
		return
	}
	if _, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), input.ProjectID, input.Permissions.AllowEdits || input.Permissions.AllowGeneration); err != nil {
		studioBridgeError(c, service.ErrStudioBridgePermission)
		return
	}
	workspace, err := service.DefaultStudioBridge.Open(c.GetInt("id"), browser, input)
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": workspace})
}

func DownloadStudioAgentSkill(c *gin.Context) {
	data, err := studioagent.SkillBundle()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Studio Skill package is unavailable"})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="new-api-studio.zip"`)
	c.Data(http.StatusOK, "application/zip", data)
}

func ListStudioBridges(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": service.DefaultStudioBridge.List(c.GetInt("id"))})
}

func ReadStudioBridge(c *gin.Context) {
	workspace, err := service.DefaultStudioBridge.Read(c.GetInt("id"), c.Param("session_id"))
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	if _, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), workspace.ProjectID, false); err != nil {
		studioBridgeError(c, service.ErrStudioBridgePermission)
		return
	}
	if c.GetBool("use_access_token") {
		workspace, err = service.DefaultStudioBridge.VerifyClient(c.GetInt("id"), c.Param("session_id"))
		if err != nil {
			studioBridgeError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": workspace})
}

func PublishStudioBridge(c *gin.Context) {
	browser, ok := studioBridgeBrowser(c)
	if !ok {
		return
	}
	var input service.StudioBridgeUpdate
	if !studioBridgeDecode(c, &input, 5<<20) {
		return
	}
	workspace, err := service.DefaultStudioBridge.Publish(c.GetInt("id"), browser, c.Param("session_id"), input)
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": workspace})
}

func CloseStudioBridge(c *gin.Context) {
	browser, ok := studioBridgeBrowser(c)
	if !ok {
		return
	}
	if err := service.DefaultStudioBridge.Close(c.GetInt("id"), browser, c.Param("session_id")); err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func QueueStudioBridgeCommand(c *gin.Context) {
	var input service.StudioBridgeCommandRequest
	if !studioBridgeDecode(c, &input, 300<<10) {
		return
	}
	workspace, err := service.DefaultStudioBridge.Read(c.GetInt("id"), c.Param("session_id"))
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	if _, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), workspace.ProjectID, true); err != nil {
		studioBridgeError(c, service.ErrStudioBridgePermission)
		return
	}
	command, err := service.DefaultStudioBridge.Enqueue(c.GetInt("id"), c.Param("session_id"), input)
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": command})
}

func ReadStudioBridgeCommand(c *gin.Context) {
	command, err := service.DefaultStudioBridge.Job(c.GetInt("id"), c.Param("session_id"), c.Param("command_id"))
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": command})
}

func ClaimStudioBridgeCommand(c *gin.Context) {
	browser, ok := studioBridgeBrowser(c)
	if !ok {
		return
	}
	var input struct {
		Revision int64 `json:"revision"`
	}
	if !studioBridgeDecode(c, &input, 4096) {
		return
	}
	workspace, err := service.DefaultStudioBridge.Read(c.GetInt("id"), c.Param("session_id"))
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	if _, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), workspace.ProjectID, true); err != nil {
		studioBridgeError(c, service.ErrStudioBridgePermission)
		return
	}
	claimed, err := service.DefaultStudioBridge.Claim(c.GetInt("id"), browser, c.Param("session_id"), c.Param("command_id"), input.Revision)
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"claimed": claimed}})
}

func FinishStudioBridgeCommand(c *gin.Context) {
	browser, ok := studioBridgeBrowser(c)
	if !ok {
		return
	}
	var input struct {
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if !studioBridgeDecode(c, &input, 300<<10) {
		return
	}
	err := service.DefaultStudioBridge.Finish(c.GetInt("id"), browser, c.Param("session_id"), c.Param("command_id"), input.Result, input.Error)
	if err != nil {
		studioBridgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
