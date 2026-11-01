package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/service"
)

func reviewHeaders(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")
}
func reviewRead(svc *service.Service, action func(*gin.Context, string) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		reviewHeaders(c)
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := action(c, user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	}
}
func reviewWrite[T any](svc *service.Service, action func(*gin.Context, string, T) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		reviewHeaders(c)
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input T
		if !bindTimelineEditJSON(c, &input) {
			return
		}
		result, err := action(c, user.ID, input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	}
}
func reviewLimit(c *gin.Context) (int, error) { return parsePositiveQueryInt(c.Query("pageSize"), 30) }

func registerProjectReviewRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/projects/:id/reviews/asset-source", reviewRead(svc, func(c *gin.Context, u string) (any, error) {
		return svc.ReadProjectReviewAssetSource(u, c.Param("id"), c.Query("assetVersionId"))
	}))
	r.GET("/projects/:id/reviews/:reviewId/comments/:commentId/rework", reviewRead(svc, func(c *gin.Context, u string) (any, error) {
		return svc.ReadProjectReviewRework(u, c.Param("id"), c.Param("reviewId"), c.Param("commentId"))
	}))
	r.GET("/projects/:id/members", reviewRead(svc, func(c *gin.Context, u string) (any, error) { return svc.ListProjectMembers(u, c.Param("id")) }))
	r.POST("/projects/:id/members", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectMemberRequest) (any, error) {
		return svc.SaveProjectMember(u, c.Param("id"), v)
	}))
	r.GET("/reviews", reviewRead(svc, func(c *gin.Context, u string) (any, error) {
		n, err := reviewLimit(c)
		if err != nil {
			return nil, service.BadAuthRequest("分页参数无效")
		}
		return svc.ListProjectReviews(u, c.Query("projectId"), c.Query("cursor"), c.Query("archived") == "1", n)
	}))
	r.POST("/projects/:id/reviews", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectReviewCreateRequest) (any, error) {
		return svc.CreateProjectReview(u, c.Param("id"), v)
	}))
	r.GET("/projects/:id/reviews/results", reviewRead(svc, func(c *gin.Context, u string) (any, error) {
		result, err := svc.ReadProjectReviewResult(u, c.Param("id"), c.Query("requestId"))
		if err != nil {
			return nil, err
		}
		if result.Share != nil {
			link, err := svc.ReviewShareWriteLink(u, c.Param("id"), result)
			if err != nil {
				return nil, err
			}
			return gin.H{"result": result, "link": link}, nil
		}
		return gin.H{"result": result}, nil
	}))
	r.GET("/reviews/:reviewId", reviewRead(svc, func(c *gin.Context, u string) (any, error) { return svc.ReadProjectReview(u, c.Param("reviewId")) }))
	r.GET("/reviews/:reviewId/media", func(c *gin.Context) {
		reviewHeaders(c)
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if c.Query("access") == "1" {
			failService(c, service.BadAuthRequest("审片文件请通过固定播放入口读取"))
			return
		}
		delivery, err := svc.PrepareProjectReviewMedia(user.ID, c.Param("reviewId"), c.GetHeader("Range"))
		if err != nil {
			failService(c, err)
			return
		}
		serveResourceDelivery(c, delivery, "private, no-store", "")
	})
	r.PATCH("/projects/:id/reviews/:reviewId", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectReviewStateRequest) (any, error) {
		return svc.SetProjectReviewState(u, c.Param("id"), c.Param("reviewId"), v)
	}))
	r.GET("/projects/:id/reviews/:reviewId/comments", reviewRead(svc, func(c *gin.Context, u string) (any, error) {
		n, err := reviewLimit(c)
		if err != nil {
			return nil, service.BadAuthRequest("分页参数无效")
		}
		return svc.ListProjectReviewComments(u, c.Param("id"), c.Param("reviewId"), c.Query("cursor"), n)
	}))
	r.POST("/projects/:id/reviews/:reviewId/comments", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectReviewCommentRequest) (any, error) {
		return svc.AddProjectReviewComment(u, c.Param("id"), c.Param("reviewId"), v)
	}))
	r.PATCH("/projects/:id/reviews/:reviewId/comments/:commentId", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectReviewCommentPatch) (any, error) {
		return svc.PatchProjectReviewComment(u, c.Param("id"), c.Param("reviewId"), c.Param("commentId"), v)
	}))
	r.GET("/projects/:id/reviews/:reviewId/shares", reviewRead(svc, func(c *gin.Context, u string) (any, error) {
		return svc.ListProjectReviewShares(u, c.Param("id"), c.Param("reviewId"))
	}))
	r.POST("/projects/:id/reviews/:reviewId/shares", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectReviewShareRequest) (any, error) {
		result, err := svc.CreateProjectReviewShare(u, c.Param("id"), c.Param("reviewId"), v)
		if err != nil {
			return nil, err
		}
		link, err := svc.ReviewShareWriteLink(u, c.Param("id"), result)
		return gin.H{"result": result, "link": link}, err
	}))
	r.POST("/projects/:id/reviews/:reviewId/shares/:shareId/revoke", reviewWrite(svc, func(c *gin.Context, u string, v service.ProjectReviewShareRevokeRequest) (any, error) {
		return svc.RevokeProjectReviewShare(u, c.Param("id"), c.Param("reviewId"), c.Param("shareId"), v)
	}))
}

const reviewShareCookie = "yingce_review_access"

func registerPublicReviewRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/review-shares/:shareId/comment-result", func(c *gin.Context) {
		reviewHeaders(c)
		token, _ := c.Cookie(reviewShareCookie)
		v, err := svc.ReadPublicReviewCommentResult(c.Param("shareId"), token, c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, v)
	})
	r.POST("/review-shares/:shareId/session", func(c *gin.Context) {
		reviewHeaders(c)
		var input struct {
			Token string `json:"token"`
		}
		if !bindTimelineEditJSON(c, &input) {
			return
		}
		view, err := svc.PublicProjectReview(c.Param("shareId"), input.Token)
		if err != nil {
			failService(c, err)
			return
		}
		secure := c.Request.TLS != nil || strings.EqualFold(strings.TrimSpace(c.GetHeader("X-Forwarded-Proto")), "https")
		http.SetCookie(c.Writer, &http.Cookie{Name: reviewShareCookie, Value: input.Token, Path: kernel.APIPath("/review-shares/") + c.Param("shareId"), MaxAge: int(time.Until(view.ExpiresAt).Seconds()), Expires: view.ExpiresAt, HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode})
		ok(c, view)
	})
	r.GET("/review-shares/:shareId", func(c *gin.Context) {
		reviewHeaders(c)
		token, _ := c.Cookie(reviewShareCookie)
		v, err := svc.PublicProjectReview(c.Param("shareId"), token)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, v)
	})
	r.GET("/review-shares/:shareId/media", func(c *gin.Context) {
		reviewHeaders(c)
		token, _ := c.Cookie(reviewShareCookie)
		if c.Query("access") == "1" {
			failService(c, service.BadAuthRequest("审片文件请通过固定播放入口读取"))
			return
		}
		v, err := svc.PreparePublicReviewMedia(c.Param("shareId"), token, c.GetHeader("Range"))
		if err != nil {
			failService(c, err)
			return
		}
		serveResourceDelivery(c, v, "private, no-store", "")
	})
	r.GET("/review-shares/:shareId/comments", func(c *gin.Context) {
		reviewHeaders(c)
		token, _ := c.Cookie(reviewShareCookie)
		n, err := reviewLimit(c)
		if err != nil {
			failService(c, service.BadAuthRequest("分页参数无效"))
			return
		}
		v, err := svc.ListPublicReviewComments(c.Param("shareId"), token, c.Query("cursor"), n)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, v)
	})
	r.POST("/review-shares/:shareId/comments", func(c *gin.Context) {
		reviewHeaders(c)
		token, _ := c.Cookie(reviewShareCookie)
		var input service.PublicReviewCommentRequest
		if !bindTimelineEditJSON(c, &input) {
			return
		}
		v, err := svc.AddPublicReviewComment(c.Param("shareId"), token, input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, v)
	})
}
