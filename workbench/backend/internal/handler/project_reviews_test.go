package handler

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestProjectReviewPublicHTTPUsesScopedSecureCookieRangesAndImmediateRevoke(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.Open(database.Config{Driver: "sqlite", DSN: ":memory:"})
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	connection.SetMaxOpenConns(1)
	t.Cleanup(func() { connection.Close() })
	if err = database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	for _, row := range []any{&model.User{ID: "review-http-owner", Username: "review-http-owner", Status: model.UserStatusActive, Role: model.UserRoleUser}, &model.AuthSession{ID: "review-http-session", UserID: "review-http-owner", TokenHash: auth.HashToken("review-http-test-token"), ExpiresAt: now.Add(time.Hour)}, &model.Project{ID: "review-http-project", UserID: "review-http-owner", Status: model.ProjectStatusActive, Revision: 1, Name: "HTTP审片"}} {
		if err = db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	var data bytes.Buffer
	if err = png.Encode(&data, image.NewNRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatal(err)
	}
	resource, err := svc.UploadResourceFile("review-http-owner", "reference.png", int64(data.Len()), "image", 4, 4, 0, bytes.NewReader(data.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []any{&model.Asset{ID: "review-http-asset", UserID: "review-http-owner", Kind: "image", Status: model.AssetVersionStatusConfirmed, PrimaryVersionID: "review-http-version"}, &model.AssetVersion{ID: "review-http-version", AssetID: "review-http-asset", Version: 1, Status: model.AssetVersionStatusConfirmed, DefinitionJSON: `{}`}, &model.AssetRepresentation{ID: "review-http-representation", AssetVersionID: "review-http-version", ResourceID: resource.ID, MediaType: "image", Role: "primary"}, &model.ProjectAssetLink{ID: "review-http-link", ProjectID: "review-http-project", AssetID: "review-http-asset"}} {
		if err = db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	router := gin.New()
	RegisterCanvasAPI(router.Group("/api"), svc)
	call := func(method, path, body string, cookie *http.Cookie, mediaRange string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-Proto", "https")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if mediaRange != "" {
			req.Header.Set("Range", mediaRange)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	owner := &http.Cookie{Name: service.SessionCookieName, Value: "review-http-session.review-http-test-token"}
	unpack := func(w *httptest.ResponseRecorder) map[string]any {
		t.Helper()
		if w.Code != 200 {
			t.Fatalf("status=%d: %s", w.Code, w.Body.String())
		}
		var envelope struct {
			Code int            `json:"code"`
			Data map[string]any `json:"data"`
		}
		if err = json.Unmarshal(w.Body.Bytes(), &envelope); err != nil || envelope.Code != 0 {
			t.Fatal("envelope", err, w.Body.String())
		}
		return envelope.Data
	}
	created := unpack(call("POST", "/api/projects/review-http-project/reviews", `{"requestId":"review-http-create-0001","title":"固定图片","target":{"kind":"asset","assetVersionId":"review-http-version","representationId":"review-http-representation"}}`, owner, ""))
	review := created["review"].(map[string]any)
	rid := review["id"].(string)
	sha := review["targetSha256"].(string)
	base := "/api/projects/review-http-project/reviews/" + rid
	shared := unpack(call("POST", base+"/shares", `{"requestId":"review-http-share-0001","expiresDays":7,"allowComments":true}`, owner, ""))
	link := shared["link"].(map[string]any)
	sid := link["share"].(map[string]any)["id"].(string)
	token := strings.Split(link["url"].(string), "#token=")[1]
	guestBase := "/api/review-shares/" + sid
	if response := call("GET", guestBase, "", nil, ""); response.Code != 404 {
		t.Fatal("guest manifest without token", response.Code)
	}
	session := call("POST", guestBase+"/session", `{"token":"`+token+`"}`, nil, "")
	unpack(session)
	var guest *http.Cookie
	for _, cookie := range session.Result().Cookies() {
		if cookie.Name == reviewShareCookie {
			guest = cookie
		}
	}
	if guest == nil || !guest.HttpOnly || !guest.Secure || guest.SameSite != http.SameSiteStrictMode || guest.Path != guestBase {
		t.Fatal("unsafe or missing review cookie", guest)
	}
	if session.Header().Get("Referrer-Policy") != "no-referrer" || session.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("missing private headers")
	}
	unpack(call("GET", guestBase, "", guest, ""))
	if response := call("GET", guestBase+"/media?access=1", "", guest, ""); response.Code != 400 {
		t.Fatal("review attempted to expose a generic storage description", response.Code)
	}
	media := call("GET", guestBase+"/media", "", guest, "bytes=0-15")
	if media.Code != 206 || !bytes.Equal(media.Body.Bytes(), data.Bytes()[:16]) || media.Header().Get("Content-Range") == "" || media.Header().Get("Location") != "" {
		t.Fatal("range delivery", media.Code, media.Header())
	}
	if response := call("POST", guestBase+"/comments", `{"requestId":"review-http-forged-comment","targetSha256":"`+sha+`","authorName":"访客","message":"意见","location":{},"blocking":true}`, guest, ""); response.Code != 400 {
		t.Fatal("guest invented blocking flag", response.Code)
	}
	body := `{"requestId":"review-http-comment-0001","targetSha256":"` + sha + `","authorName":"客户","message":"色彩建议","location":{}}`
	comment := unpack(call("POST", guestBase+"/comments", body, guest, ""))
	recovered := unpack(call("GET", guestBase+"/comment-result?requestId=review-http-comment-0001", "", guest, ""))
	if comment["id"] != recovered["id"] || recovered["guest"] != true {
		t.Fatal("guest receipt recovery")
	}
	if response := call("GET", "/api/reviews/"+rid, "", guest, ""); response.Code != 401 {
		t.Fatal("guest accessed member API", response.Code)
	}
	unpack(call("POST", base+"/shares/"+sid+"/revoke", `{"requestId":"review-http-revoke-0001","expectedRevision":1}`, owner, ""))
	if response := call("GET", guestBase+"/media", "", guest, "bytes=0-15"); response.Code != 404 {
		t.Fatal("revoked cookie still streamed", response.Code)
	}
}
