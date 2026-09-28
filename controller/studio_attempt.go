package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func ListStudioAttempts(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	attempts, err := model.ListStudioAttempts(c.GetInt("id"), 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Could not load Studio submissions",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": attempts})
}

func GetStudioAttemptByRequest(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	requestID, err := uuid.Parse(c.Param("request_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid Studio request ID"})
		return
	}
	attempt, err := model.GetStudioAttemptByRequest(c.GetInt("id"), requestID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load Studio submission"})
		return
	}
	if attempt == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Studio submission not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": attempt})
}
