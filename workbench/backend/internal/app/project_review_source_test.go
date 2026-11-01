package app

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func reviewImageFixture(t *testing.T, s *Service, db *gorm.DB, pid string) (ProjectReviewTargetRequest, *model.Resource, []byte) {
	t.Helper()
	var data bytes.Buffer
	img := image.NewNRGBA(image.Rect(0, 0, 16, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.NRGBA{R: 220, G: uint8(x * 11), B: uint8(y * 17), A: 255})
		}
	}
	if err := png.Encode(&data, img); err != nil {
		t.Fatal(err)
	}
	resource, err := s.UploadResourceFile("owner", "review-reference.png", int64(data.Len()), "image", 16, 12, 0, bytes.NewReader(data.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	asset := model.Asset{ID: "review-character", UserID: "owner", Kind: "entity", Category: model.AssetCategoryCharacter, Status: model.AssetVersionStatusConfirmed, PrimaryVersionID: "review-character-v1", Title: "角色原片", PayloadJSON: `{}`, CreatedAt: now, UpdatedAt: now}
	version := model.AssetVersion{ID: asset.PrimaryVersionID, AssetID: asset.ID, Version: 1, Status: model.AssetVersionStatusConfirmed, DefinitionJSON: `{"name":"角色原片"}`, CreatedAt: now, UpdatedAt: now}
	representation := model.AssetRepresentation{ID: "review-representation", AssetVersionID: version.ID, ResourceID: resource.ID, MediaType: "image", Role: "primary", CreatedAt: now}
	link := model.ProjectAssetLink{ID: "review-project-link", ProjectID: pid, AssetID: asset.ID, CreatedAt: now}
	for _, row := range []any{&asset, &version, &representation, &link} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	return ProjectReviewTargetRequest{Kind: "asset", AssetVersionID: version.ID, RepresentationID: representation.ID}, resource, data.Bytes()
}

func verifyFixedReviewCreation(t *testing.T, s *Service, db *gorm.DB, pid string) {
	t.Helper()
	target, resource, body := reviewImageFixture(t, s, db, pid)
	input := ProjectReviewCreateRequest{RequestID: "fixed-asset-review-0001", Title: "角色审片第一版", Target: target}
	if _, err := s.CreateProjectReview("stranger", pid, input); err == nil {
		t.Fatal("foreign actor created a review")
	}
	mixed := input
	mixed.Target.CutID = "forged"
	if _, err := s.CreateProjectReview("owner", pid, mixed); err == nil {
		t.Fatal("mixed source identities accepted")
	}
	result, err := s.CreateProjectReview("owner", pid, input)
	if err != nil || result.Review == nil {
		t.Fatal("fixed review creation", result, err)
	}
	view, err := s.GetProjectReview("owner", pid, result.Review.ID)
	if err != nil {
		t.Fatal(err)
	}
	expected := fmt.Sprintf("%x", sha256.Sum256(body))
	if view.Source.ResourceID != resource.ID || view.Source.ResourceSHA256 != expected || view.Source.AssetVersionID != target.AssetVersionID || view.Review.Status != "in_review" || !view.CanManage || !view.CanComment {
		t.Fatal("review lost exact source", view)
	}
	active := true
	member := ProjectMemberRequest{RequestID: "fixed-review-viewer-0001", MemberUserID: "other", Role: "viewer", Active: &active}
	if _, err = s.SaveProjectMember("owner", pid, member); err != nil {
		t.Fatal(err)
	}
	foreign, err := s.GetProjectReview("other", pid, result.Review.ID)
	if err != nil || foreign.CanComment || foreign.CanDecide || foreign.CanManage || foreign.Source.ResourceSHA256 != expected {
		t.Fatal("viewer capabilities", foreign, err)
	}
	if _, err = s.CreateProjectReview("other", pid, input); err == nil {
		t.Fatal("viewer created a new review")
	}
	replay, err := s.CreateProjectReview("owner", pid, input)
	if err != nil || !replay.Replayed || replay.Review.ID != result.Review.ID {
		t.Fatal("unknown creation response duplicated source", replay, err)
	}
	receipt, err := s.ReadProjectReviewResult("owner", pid, input.RequestID)
	if err != nil || receipt.Review.ID != result.Review.ID {
		t.Fatal("creation receipt lost", receipt, err)
	}
	if _, err = s.ReadProjectReviewResult("other", pid, input.RequestID); err == nil {
		t.Fatal("viewer could read owner operation receipts")
	}
	// Later candidate selection cannot change this review or release its file.
	if err = db.Model(&model.Asset{}).Where("id = ?", "review-character").UpdateColumn("primary_version_id", "later-version").Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Model(&model.AssetRepresentation{}).Where("id = ?", target.RepresentationID).UpdateColumn("resource_id", "").Error; err != nil {
		t.Fatal(err)
	}
	after, err := s.GetProjectReview("owner", pid, result.Review.ID)
	if err != nil || after.Source.ResourceSHA256 != expected || after.Source.ResourceID != resource.ID {
		t.Fatal("review followed a later candidate", after, err)
	}
	references, err := s.repo.ResourceReferenceSnapshot("owner", "", []string{resource.ID})
	if err != nil {
		t.Fatal(err)
	}
	protected := false
	for _, reference := range references.Direct {
		if reference.Kind == "固定版本审片" && reference.ID == result.Review.ID && reference.ResourceID == resource.ID {
			protected = true
		}
	}
	if !protected {
		t.Fatal("review original can be deleted after candidate selection changes")
	}
	list, err := s.ListProjectReviews("other", pid, "", false, 20)
	if err != nil || len(list.Reviews) != 1 || list.Reviews[0].ID != result.Review.ID {
		t.Fatal("shared review inbox", list, err)
	}
	// Re-reviewing this exact original remains possible even after the asset's
	// current representation has changed. It must never follow that pointer.
	round, err := s.CreateProjectReview("owner", pid, ProjectReviewCreateRequest{RequestID: "review-same-original-round-0001", Title: "重新审同一原片", ParentReviewID: result.Review.ID, Target: ProjectReviewTargetRequest{Kind: "snapshot", ReviewID: result.Review.ID, ReviewTargetSHA256: result.Review.TargetSHA256}})
	if err != nil {
		t.Fatal("same original re-review", err)
	}
	newRound, err := s.GetProjectReview("owner", pid, round.Review.ID)
	if err != nil || newRound.Source.ResourceID != resource.ID || newRound.Source.ResourceSHA256 != expected || newRound.Source.OriginReviewID != result.Review.ID || !newRound.CanDecide {
		t.Fatal("re-review followed later candidate", newRound, err)
	}
	if err = db.Model(&model.User{}).Where("id = ?", "owner").Update("status", model.UserStatusDisabled).Error; err != nil {
		t.Fatal(err)
	}
	list, err = s.ListProjectReviews("other", "", "", false, 20)
	if err != nil || len(list.Reviews) != 0 {
		t.Fatal("disabled owner's titles leaked through inbox", list, err)
	}
	var tasks int64
	db.Model(&model.Task{}).Count(&tasks)
	if tasks != 0 {
		t.Fatal("review creation started generation", tasks)
	}
}

func TestProjectReviewCreationPinsActualImageAndProtectsItsOriginal(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, false)
	verifyFixedReviewCreation(t, s, db, pid)
}
func TestProjectReviewCreationPostgresPinsActualImageAndProtectsItsOriginal(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, true)
	verifyFixedReviewCreation(t, s, db, pid)
}
