package app

import (
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
)

func verifyReviewShareLifecycle(t *testing.T, s *Service, db *gorm.DB, pid string) {
	t.Helper()
	view := reviewWithParticipants(t, s, db, pid)
	rid := view.Review.ID
	request := ProjectReviewShareRequest{RequestID: "review-share-request-0001", AllowComments: true, ExpiresDays: 7}
	if _, err := s.CreateProjectReviewShare("other", pid, rid, request); err == nil {
		t.Fatal("reviewer shared owner files")
	}
	write, err := s.CreateProjectReviewShare("owner", pid, rid, request)
	if err != nil {
		t.Fatal(err)
	}
	link, err := s.ReviewShareWriteLink("owner", pid, write)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(link.URL, "#token=")
	if len(parts) != 2 || len(parts[1]) != 43 {
		t.Fatal("invalid fragment link")
	}
	token := parts[1]
	sid := write.Share.ID
	var stored model.ProjectReviewShare
	if err = db.Where("id = ?", sid).Take(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if stored.TokenHash == token || stored.TokenCipher == token || !strings.HasPrefix(stored.TokenCipher, encryptedSettingPrefix) {
		t.Fatal("share secret stored in plaintext")
	}
	var receipts []model.ProjectReviewReceipt
	db.Where("review_id = ?", rid).Find(&receipts)
	for _, r := range receipts {
		if strings.Contains(r.ResultJSON, token) || strings.Contains(r.ResultJSON, stored.TokenCipher) {
			t.Fatal("secret persisted in receipt")
		}
	}
	for _, wrong := range []string{"", strings.Repeat("a", 43), token + "x"} {
		if _, err = s.PublicProjectReview(sid, wrong); err == nil {
			t.Fatal("invalid token accepted")
		}
	}
	public, err := s.PublicProjectReview(sid, token)
	if err != nil || public.TargetSHA256 != view.Review.TargetSHA256 || !public.AllowComments {
		t.Fatal("wrong fixed manifest", err)
	}
	delivery, err := s.PreparePublicReviewMedia(sid, token, "bytes=0-15")
	if err != nil {
		t.Fatal(err)
	}
	if delivery.Access.Delivery != assets.DeliveryProxy || strings.Contains(delivery.Access.URL, "token") {
		t.Fatal("review exposed storage URL")
	}
	body, err := io.ReadAll(delivery.Stream.Body)
	delivery.Stream.Body.Close()
	if err != nil || len(body) == 0 {
		t.Fatal("original unreadable", err)
	}
	comment := PublicReviewCommentRequest{RequestID: "guest-comment-request-0001", TargetSHA256: public.TargetSHA256, AuthorName: "客户", Message: "建议调整色调"}
	one, err := s.AddPublicReviewComment(sid, token, comment)
	if err != nil || !one.Guest {
		t.Fatal("guest comment failed", err)
	}
	replay, err := s.AddPublicReviewComment(sid, token, comment)
	if err != nil || replay.ID != one.ID {
		t.Fatal("duplicate comment", err)
	}
	lookup, err := s.ReadPublicReviewCommentResult(sid, token, comment.RequestID)
	if err != nil || lookup.ID != one.ID || !lookup.Guest {
		t.Fatal("guest result lookup", lookup, err)
	}
	altered := comment
	altered.Message = "changed"
	if _, err = s.AddPublicReviewComment(sid, token, altered); err == nil {
		t.Fatal("request ID reused for changed text")
	}
	for i := 2; i <= 10; i++ {
		next := comment
		next.RequestID = fmt.Sprintf("guest-comment-request-%04d", i)
		if _, err = s.AddPublicReviewComment(sid, token, next); err != nil {
			t.Fatal(err)
		}
	}
	next := comment
	next.RequestID = "guest-comment-request-0011"
	if _, err = s.AddPublicReviewComment(sid, token, next); err == nil {
		t.Fatal("guest rate limit absent")
	}
	if _, err = s.AddPublicReviewComment(sid, token, comment); err != nil {
		t.Fatal("rate limited receipt recovery", err)
	}
	page, err := s.ListPublicReviewComments(sid, token, "", 3)
	if err != nil || len(page.Comments) != 3 || page.NextCursor == "" {
		t.Fatal("guest pagination", err)
	}
	var count int64
	db.Model(&model.ProjectReviewComment{}).Where("review_id = ? AND blocking = ?", rid, true).Count(&count)
	if count != 0 {
		t.Fatal("guest invented blocking issue")
	}
	secondRequest := request
	secondRequest.RequestID = "review-readonly-link-0001"
	secondRequest.AllowComments = false
	readonly, err := s.CreateProjectReviewShare("owner", pid, rid, secondRequest)
	if err != nil {
		t.Fatal(err)
	}
	readonlyLink, err := s.ReviewShareWriteLink("owner", pid, readonly)
	if err != nil {
		t.Fatal(err)
	}
	readonlyToken := strings.Split(readonlyLink.URL, "#token=")[1]
	if _, err = s.AddPublicReviewComment(readonly.Share.ID, readonlyToken, comment); err == nil {
		t.Fatal("read-only link wrote comment")
	}
	revoked, err := s.RevokeProjectReviewShare("owner", pid, rid, sid, ProjectReviewShareRevokeRequest{RequestID: "revoke-share-request-0001", ExpectedRevision: 1})
	if err != nil || revoked.Share.Active {
		t.Fatal("revoke", err)
	}
	if _, err = s.PublicProjectReview(sid, token); err == nil {
		t.Fatal("revoked link still readable")
	}
	if _, err = s.PreparePublicReviewMedia(sid, token, ""); err == nil {
		t.Fatal("revoked media still readable")
	}
	if _, err = s.AddPublicReviewComment(sid, token, comment); err == nil {
		t.Fatal("revoked link could recover private receipt")
	}
	replayed, err := s.CreateProjectReviewShare("owner", pid, rid, request)
	if err != nil || !replayed.Replayed {
		t.Fatal("create recovery", err)
	}
	recovered, err := s.ReviewShareWriteLink("owner", pid, replayed)
	if err != nil || recovered.URL != "" || recovered.Share.Active {
		t.Fatal("old create replay reactivated link", err)
	}
	if err = db.Model(&model.ProjectReviewShare{}).Where("id = ?", readonly.Share.ID).Update("expires_at", time.Now().Add(-time.Second)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err = s.PublicProjectReview(readonly.Share.ID, readonlyToken); err == nil {
		t.Fatal("expired link still readable")
	}
	if err = db.Model(&model.ProjectReviewShare{}).Where("id = ?", readonly.Share.ID).Update("expires_at", time.Now().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Model(&model.User{}).Where("id = ?", "owner").Update("status", model.UserStatusDisabled).Error; err != nil {
		t.Fatal(err)
	}
	if _, err = s.PublicProjectReview(readonly.Share.ID, readonlyToken); err == nil {
		t.Fatal("disabled owner still shared")
	}
}
func TestProjectReviewSharePinnedOriginalGuestRateRevocationAndRecovery(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, false)
	verifyReviewShareLifecycle(t, s, db, pid)
}
func TestProjectReviewSharePostgresPinnedOriginalGuestRateRevocationAndRecovery(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, true)
	verifyReviewShareLifecycle(t, s, db, pid)
}
