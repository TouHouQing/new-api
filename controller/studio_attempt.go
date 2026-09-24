package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
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
