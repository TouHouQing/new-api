package app

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"yingce/backend/internal/repository"
)

const deliveryDocumentLimit = 32 << 20

// Converter revisions have independent package identities. Old receipts remain
// readable, while a corrected writer cannot reuse an older incorrect archive.
func deliverySourceHash(document []byte) [32]byte {
	return sha256.Sum256(append([]byte("yingce-delivery-exporter-v2\n"), document...))
}

const deliveryMediaLimit = int64(2 << 30)

var deliveryID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,80}$`)
var deliveryResourceRef = regexp.MustCompile(`(?:resource:|/api/resources/(?:public/)?)([a-zA-Z0-9_-]{1,80})`)

type ProjectDeliveryFile struct {
	*os.File
	FileName string
}

func (f *ProjectDeliveryFile) Close() error {
	name := f.Name()
	err := f.File.Close()
	remove := os.Remove(name)
	if err != nil {
		return err
	}
	return remove
}

type deliveryMedia struct {
	ResourceID string `json:"resourceId"`
	Path       string `json:"path"`
	SHA256     string `json:"sha256"`
	Bytes      int64  `json:"bytes"`
	MimeType   string `json:"mimeType"`
}

// The completed archive exists before HTTP headers are sent. Missing source
// bytes, cancellation or a changed document cannot produce a successful ZIP.
func (s *Service) ExportProjectDelivery(ctx context.Context, owner, projectID string, expectedSource ...string) (result *ProjectDeliveryFile, err error) {
	if !s.deliveryMu.TryLock() {
		return nil, RateLimited("已有工程正在整理，请稍后核对或重试")
	}
	defer s.deliveryMu.Unlock()
	if _, e := s.repo.ProjectForUser(owner, projectID); e != nil {
		return nil, NotFound("项目不存在或无权访问")
	}
	snapshot, err := s.repo.ProjectDeliverySnapshot(ctx, owner, projectID)
	if err != nil {
		return nil, err
	}
	original, err := json.Marshal(snapshot)
	if err != nil || len(original) > deliveryDocumentLimit {
		return nil, BadAuthRequest("项目文档过大，无法完整打包；请使用本地完整备份")
	}
	sourceHash := deliverySourceHash(original)
	if len(expectedSource) > 0 && expectedSource[0] != hex.EncodeToString(sourceHash[:]) {
		return nil, cutConflict("项目来源已改变，请重新核对当前内容")
	}
	var document any
	if err = json.Unmarshal(original, &document); err != nil {
		return nil, err
	}
	document = cleanDeliveryDocument(document)
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, err
	}
	var exportedSnapshot repository.ProjectDeliverySnapshot
	if err = json.Unmarshal(data, &exportedSnapshot); err != nil {
		return nil, err
	}
	resourceIDs := map[string]bool{}
	if err = deliveryResources(document, "", resourceIDs); err != nil {
		return nil, err
	}
	ids := []string{}
	for id := range resourceIDs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) > 10000 {
		return nil, BadAuthRequest("项目引用素材过多，请使用本地完整备份")
	}
	dir := filepath.Join(s.dataDir, "delivery-tmp")
	if err = os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	if files, e := os.ReadDir(dir); e == nil {
		for _, entry := range files {
			if entry.Type().IsRegular() && strings.HasPrefix(entry.Name(), "project-") && strings.HasSuffix(entry.Name(), ".zip") {
				if info, e := entry.Info(); e == nil && time.Since(info.ModTime()) > 24*time.Hour {
					_ = os.Remove(filepath.Join(dir, entry.Name()))
				}
			}
		}
	}
	file, err := os.CreateTemp(dir, "project-*.zip")
	if err != nil {
		return nil, err
	}
	result = &ProjectDeliveryFile{File: file, FileName: "yingce-project-" + projectID + ".zip"}
	defer func() {
		if err != nil {
			_ = result.Close()
			result = nil
		}
	}()
	archive := zip.NewWriter(file)
	put := func(name string, bytes []byte) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		w, e := archive.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
		if e != nil {
			return e
		}
		_, e = w.Write(bytes)
		return e
	}
	if err = put("project.json", data); err != nil {
		return result, err
	}
	media := []deliveryMedia{}
	paths := map[string]string{}
	var total int64
	for _, id := range ids {
		if err = ctx.Err(); err != nil {
			return result, err
		}
		resource, body, e := s.OpenResource(owner, id)
		if e != nil {
			return result, BadAuthRequest("素材 " + id + " 不存在、无权访问或无法读取，未导出残缺工程")
		}
		if resource.Size <= 0 || resource.Size > deliveryMediaLimit-total {
			body.Close()
			return result, BadAuthRequest("完整工程超过2 GiB，请使用本地完整备份")
		}
		ext := deliveryExtension(resource.MimeType)
		name := "media/" + id + ext
		w, e := archive.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store})
		if e != nil {
			body.Close()
			return result, e
		}
		hash := sha256.New()
		n, e := io.Copy(io.MultiWriter(w, hash), &deliveryContextReader{ctx: ctx, reader: io.LimitReader(body, resource.Size+1)})
		closeErr := body.Close()
		if e != nil {
			return result, e
		}
		if closeErr != nil {
			return result, closeErr
		}
		if n != resource.Size {
			return result, BadAuthRequest("素材大小发生变化，未导出残缺工程")
		}
		total += n
		paths[id] = "../" + name
		media = append(media, deliveryMedia{id, name, hex.EncodeToString(hash.Sum(nil)), n, resource.MimeType})
	}
	exchanges, warnings, e := projectDeliveryExchanges(exportedSnapshot, paths)
	if e != nil {
		return result, e
	}
	names := []string{}
	for name := range exchanges {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if err = put(name, exchanges[name]); err != nil {
			return result, err
		}
	}
	after, e := s.repo.ProjectDeliverySnapshot(ctx, owner, projectID)
	if e != nil {
		return result, e
	}
	afterBytes, e := json.Marshal(after)
	if e != nil {
		return result, e
	}
	if string(original) != string(afterBytes) {
		return result, NewAppError(http.StatusConflict, "项目在打包时发生变化，请保存后重新导出")
	}
	digest := sha256.Sum256(data)
	manifest := map[string]any{"format": "yingce-project-delivery", "version": 1, "exporterVersion": 2, "projectId": projectID, "projectRevision": snapshot.Project.Revision, "documentSHA256": hex.EncodeToString(digest[:]), "media": media, "mediaBytes": total, "warnings": warnings, "restore": "Full application state, execution receipts and permissions are restored with the separately verified full production backup. This archive delivers editable authoring documents, version history, original media and OTIO/SRT interchange; it is not an original-platform import ZIP."}
	manifestBytes, e := json.MarshalIndent(manifest, "", "  ")
	if e != nil {
		return result, e
	}
	if err = put("manifest.json", manifestBytes); err != nil {
		return result, err
	}
	if err = put("README.txt", []byte("影策完整素材工程包\nproject.json：项目、完整脚本、画布及历史、镜头与候选、素材版本、剪辑、转写和分析历史、审片意见。\nmedia/：本项目引用的原始素材，逐文件SHA256见manifest.json。\nexchange/：各剪辑的OTIO及SRT。OTIO保留片段、源时钟、变速与位置；字幕样式、构图、混音、动效等另见原生JSON与warnings，外部编辑器的还原效果需核对。\n完整应用恢复（包括执行回执、账号权限）使用管理员已验证的本地完整备份；此包不是原平台导入格式，不会自动重新调用模型。\n")); err != nil {
		return result, err
	}
	if err = archive.Close(); err != nil {
		return result, err
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		return result, err
	}
	return result, nil
}

type ProjectDeliverySource struct {
	SHA256          string `json:"sha256"`
	ProjectRevision int64  `json:"projectRevision"`
}
type ProjectDeliveryRequest struct {
	SourceSHA256 string `json:"sourceSha256"`
}
type ProjectDeliveryResult struct {
	ResourceID string `json:"resourceId"`
	FileName   string `json:"fileName"`
	SHA256     string `json:"sha256"`
	Bytes      int64  `json:"bytes"`
}

func (s *Service) ReadProjectDeliverySource(ctx context.Context, owner, projectID string) (ProjectDeliverySource, error) {
	if _, err := s.repo.ProjectForUser(owner, projectID); err != nil {
		return ProjectDeliverySource{}, NotFound("项目不存在或无权访问")
	}
	snapshot, err := s.repo.ProjectDeliverySnapshot(ctx, owner, projectID)
	if err != nil {
		return ProjectDeliverySource{}, err
	}
	bytes, err := json.Marshal(snapshot)
	if err != nil {
		return ProjectDeliverySource{}, err
	}
	hash := deliverySourceHash(bytes)
	return ProjectDeliverySource{SHA256: hex.EncodeToString(hash[:]), ProjectRevision: snapshot.Project.Revision}, nil
}
func (s *Service) ReadProjectDeliveryResult(ctx context.Context, owner, projectID, sourceSHA string) (ProjectDeliveryResult, error) {
	if _, err := s.repo.ProjectForUser(owner, projectID); err != nil {
		return ProjectDeliveryResult{}, NotFound("项目不存在或无权访问")
	}
	if !validDeliverySHA(sourceSHA) {
		return ProjectDeliveryResult{}, BadAuthRequest("工程来源摘要无效")
	}
	resource, err := s.resourceForUploadKey(owner, normalizedResourceUploadKey([]string{"delivery:" + projectID + ":" + sourceSHA}))
	if err != nil {
		return ProjectDeliveryResult{}, err
	}
	if resource == nil {
		return ProjectDeliveryResult{}, NotFound("尚未找到此来源的工程包，请保留原摘要核对")
	}
	if resource.Status == "pending" {
		return ProjectDeliveryResult{}, RateLimited("原工程包仍在保存，请稍后按原摘要核对")
	}
	if resource.Status != "ready" {
		return ProjectDeliveryResult{}, NotFound("原工程包尚未完整保存，可以按原摘要重试")
	}
	_, body, err := s.OpenResource(owner, resource.ID)
	if err != nil {
		return ProjectDeliveryResult{}, err
	}
	defer body.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, &deliveryContextReader{ctx: ctx, reader: body})
	if err != nil {
		return ProjectDeliveryResult{}, err
	}
	return ProjectDeliveryResult{ResourceID: resource.ID, FileName: "yingce-project-" + projectID + ".zip", SHA256: hex.EncodeToString(hash.Sum(nil)), Bytes: size}, nil
}
func validDeliverySHA(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == 32 && strings.ToLower(value) == value
}
func (s *Service) CreateProjectDelivery(ctx context.Context, owner, projectID string, request ProjectDeliveryRequest) (ProjectDeliveryResult, error) {
	if !validDeliverySHA(request.SourceSHA256) {
		return ProjectDeliveryResult{}, BadAuthRequest("请先核对工程来源摘要")
	}
	if existing, e := s.ReadProjectDeliveryResult(ctx, owner, projectID, request.SourceSHA256); e == nil {
		return existing, nil
	} else if app, ok := e.(*AppError); !ok || app.Status != http.StatusNotFound {
		return ProjectDeliveryResult{}, e
	}
	file, err := s.ExportProjectDelivery(ctx, owner, projectID, request.SourceSHA256)
	if err != nil {
		return ProjectDeliveryResult{}, err
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, &deliveryContextReader{ctx: ctx, reader: file})
	if err != nil {
		return ProjectDeliveryResult{}, err
	}
	digest := hex.EncodeToString(hash.Sum(nil))
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		return ProjectDeliveryResult{}, err
	}
	if err = ctx.Err(); err != nil {
		return ProjectDeliveryResult{}, err
	}
	resource, err := s.UploadResourceFile(owner, file.FileName, size, "file", 0, 0, 0, file, "delivery:"+projectID+":"+request.SourceSHA256)
	if err != nil {
		return ProjectDeliveryResult{}, err
	}
	return ProjectDeliveryResult{ResourceID: resource.ID, FileName: file.FileName, SHA256: digest, Bytes: size}, nil
}

type deliveryContextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *deliveryContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
func deliveryExtension(mime string) string {
	switch strings.ToLower(strings.Split(mime, ";")[0]) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "audio/wav", "audio/x-wav":
		return ".wav"
	case "audio/mpeg":
		return ".mp3"
	case "audio/flac":
		return ".flac"
	case "audio/ogg":
		return ".ogg"
	default:
		return ".bin"
	}
}
func cleanDeliveryDocument(value any) any {
	switch item := value.(type) {
	case map[string]any:
		for key, v := range item {
			normalized := strings.ToLower(strings.ReplaceAll(key, "_", ""))
			switch normalized {
			case "apikey", "authorization", "password", "accesstoken", "refreshtoken", "secret", "session", "cookie", "headers", "sharetoken":
				delete(item, key)
				continue
			}
			if text, ok := v.(string); ok && strings.HasSuffix(normalized, "json") {
				var nested any
				if json.Unmarshal([]byte(text), &nested) == nil {
					bytes, _ := json.Marshal(cleanDeliveryDocument(nested))
					item[key] = string(bytes)
					continue
				}
			}
			item[key] = cleanDeliveryDocument(v)
		}
	case []any:
		for i, v := range item {
			item[i] = cleanDeliveryDocument(v)
		}
	case string:
		if parsed, err := url.Parse(item); err == nil && ((parsed.IsAbs() && (parsed.Scheme == "http" || parsed.Scheme == "https")) || strings.HasPrefix(item, "/")) {
			parsed.User = nil
			parsed.Fragment = ""
			q := parsed.Query()
			for key := range q {
				low := strings.ToLower(key)
				if strings.Contains(low, "token") || strings.Contains(low, "key") || strings.Contains(low, "signature") {
					q.Del(key)
				}
			}
			parsed.RawQuery = q.Encode()
			return parsed.String()
		}
	}
	return value
}
func deliveryResources(value any, key string, ids map[string]bool) error {
	switch item := value.(type) {
	case map[string]any:
		for k, v := range item {
			if err := deliveryResources(v, k, ids); err != nil {
				return err
			}
		}
	case []any:
		for _, v := range item {
			if err := deliveryResources(v, key, ids); err != nil {
				return err
			}
		}
	case string:
		if strings.HasSuffix(strings.ToLower(key), "resourceid") && item != "" {
			if !deliveryID.MatchString(item) {
				return BadAuthRequest("项目包含无法解释的素材编号")
			}
			ids[item] = true
		}
		if strings.HasSuffix(strings.ToLower(key), "resourceids") {
			if item != "" && deliveryID.MatchString(item) {
				ids[item] = true
			}
		}
		for _, match := range deliveryResourceRef.FindAllStringSubmatch(item, -1) {
			ids[match[1]] = true
		}
		trimmed := strings.TrimSpace(item)
		if len(trimmed) > 1 && (trimmed[0] == '{' || trimmed[0] == '[') {
			var nested any
			if json.Unmarshal([]byte(item), &nested) == nil {
				return deliveryResources(nested, "", ids)
			}
		}
	}
	return nil
}
