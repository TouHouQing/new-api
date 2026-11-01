package app

import (
	"errors"
	"gorm.io/gorm"
	"yingce/backend/internal/production"
)

type ProjectReviewRework struct {
	ReviewID     string                          `json:"reviewId"`
	CommentID    string                          `json:"commentId"`
	TargetSHA256 string                          `json:"targetSha256"`
	Source       production.ReviewSource         `json:"source"`
	Location     production.ReviewReworkLocation `json:"location"`
}

func (s *Service) ReadProjectReviewRework(actor, projectID, reviewID, commentID string) (ProjectReviewRework, error) {
	var result ProjectReviewRework
	project, review, _, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return result, err
	}
	comment, err := s.repo.ProjectReviewComment(project.UserID, projectID, reviewID, commentID)
	if err != nil {
		return result, reviewMissing()
	}
	source, err := decodeReviewSource(review)
	if err != nil {
		return result, err
	}
	location, err := production.ResolveReviewLocation(source, production.ReviewLocation{TimeMs: comment.TimeMs, EndMs: comment.EndMs, ClipID: comment.ClipID})
	if err != nil {
		return result, NewAppError(500, "意见位置与固定原片无法对应，请检查原始记录")
	}
	return ProjectReviewRework{ReviewID: reviewID, CommentID: commentID, TargetSHA256: review.TargetSHA256, Source: source, Location: location}, nil
}

// Selecting an asset is explicit: return only concrete representations of the
// requested project-linked version, never its later primary candidate.
type ProjectReviewAssetSource struct {
	AssetVersionID  string                             `json:"assetVersionId"`
	Representations []ProjectReviewAssetRepresentation `json:"representations"`
}
type ProjectReviewAssetRepresentation struct {
	ID         string `json:"id"`
	ResourceID string `json:"resourceId"`
	MediaType  string `json:"mediaType"`
	Role       string `json:"role"`
}

func (s *Service) ReadProjectReviewAssetSource(actor, projectID, versionID string) (ProjectReviewAssetSource, error) {
	result := ProjectReviewAssetSource{AssetVersionID: versionID, Representations: []ProjectReviewAssetRepresentation{}}
	project, role, err := s.projectReviewAccess(actor, projectID)
	if err != nil {
		return result, err
	}
	if role != "owner" && role != "editor" {
		return result, NewAppError(403, "当前权限不能发起资产审片")
	}
	if versionID == "" || len(versionID) > 36 {
		return result, BadAuthRequest("请选择一个明确的资产版本")
	}
	if _, err = s.repo.AssetVersionForProject(projectID, versionID); err != nil {
		return result, reviewMissing()
	}
	rows, err := s.repo.AssetRepresentations(versionID)
	if err != nil {
		return result, err
	}
	for _, row := range rows {
		resource, err := s.repo.ResourceForUser(project.UserID, row.ResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return result, err
		}
		if resource.Status != "ready" || resource.Kind != "image" && resource.Kind != "audio" && resource.Kind != "video" {
			continue
		}
		result.Representations = append(result.Representations, ProjectReviewAssetRepresentation{ID: row.ID, ResourceID: row.ResourceID, MediaType: resource.Kind, Role: row.Role})
	}
	return result, nil
}
