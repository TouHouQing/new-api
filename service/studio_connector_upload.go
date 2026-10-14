package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/adler32"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type studioConnectorUploadPart struct {
	URL  string `json:"url"`
	Size int64  `json:"size"`
}

// Signed upload URLs are reusable credentials. Store them in private worker
// files, never job results, project snapshots, logs or downloadable artifacts.
type studioConnectorReceipt struct {
	Stage        string                      `json:"stage"`
	Provider     string                      `json:"provider"`
	RemoteID     string                      `json:"remote_id"`
	UploadID     string                      `json:"upload_id"`
	Name         string                      `json:"name"`
	SourceDigest string                      `json:"source_digest"`
	Parts        []studioConnectorUploadPart `json:"parts"`
	Completed    int                         `json:"completed"`
	Size         int64                       `json:"size"`
	SentAt       int64                       `json:"sent_at,omitempty"`
}

func studioConnectorSaveReceipt(jobID string, receipt *studioConnectorReceipt) error {
	root, err := StudioStorageRoot()
	if err != nil {
		return err
	}
	directory := filepath.Join(root, "connector-receipts")
	if !StudioIDPattern.MatchString(jobID) {
		return errors.New("invalid connection receipt")
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	data, err := common.Marshal(receipt)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(directory, jobID+".tmp"), data, 0600); err != nil {
		return err
	}
	return os.Rename(filepath.Join(directory, jobID+".tmp"), filepath.Join(directory, jobID+".json"))
}

func studioConnectorReadReceipt(jobID string) (*studioConnectorReceipt, error) {
	root, err := StudioStorageRoot()
	if err != nil {
		return nil, err
	}
	if !StudioIDPattern.MatchString(jobID) {
		return nil, errors.New("invalid connection receipt")
	}
	file, err := os.Open(filepath.Join(root, "connector-receipts", jobID+".json"))
	if errors.Is(err, os.ErrNotExist) {
		return &studioConnectorReceipt{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 2<<20))
	if err != nil {
		return nil, err
	}
	var receipt studioConnectorReceipt
	if err := common.Unmarshal(data, &receipt); err != nil {
		return nil, errors.New("saved connection receipt could not be read")
	}
	return &receipt, nil
}

func studioConnectorMultipart(fields map[string]string, filename, contentType string, data []byte) ([]byte, string, error) {
	var buffer bytes.Buffer
	form := multipart.NewWriter(&buffer)
	for name, value := range fields {
		if err := form.WriteField(name, value); err != nil {
			return nil, "", err
		}
	}
	headers := make(textproto.MIMEHeader)
	headers.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename))
	headers.Set("Content-Type", contentType)
	part, err := form.CreatePart(headers)
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(data); err != nil {
		return nil, "", err
	}
	if err := form.Close(); err != nil {
		return nil, "", err
	}
	return buffer.Bytes(), form.FormDataContentType(), nil
}

func studioConnectorSignedUpload(ctx context.Context, config StudioConnectorConfig, endpoint, contentType string, data []byte) error {
	parsed, err := url.Parse(endpoint)
	origin, _ := url.Parse(studioConnectorOrigin(config.Provider))
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || origin == nil || !(parsed.Host == origin.Host || strings.HasSuffix(parsed.Hostname(), ".amazonaws.com") || strings.HasSuffix(parsed.Hostname(), ".frame.io") || strings.HasSuffix(parsed.Hostname(), ".adobe.com")) {
		return errors.New("provider returned an untrusted upload destination")
	}
	request, err := http.NewRequestWithContext(ctx, "PUT", endpoint, bytes.NewReader(data))
	if err != nil {
		return errors.New("provider returned an invalid upload destination")
	}
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("x-amz-acl", "private")
	client := *studioConnectorHTTPClient()
	client.Timeout = 2 * time.Minute
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		return errors.New("upload part did not complete; resume the saved upload instead of creating another file")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("upload part returned HTTP %d", response.StatusCode)
	}
	_, err = io.Copy(io.Discard, io.LimitReader(response.Body, 65536))
	return err
}

func studioConnectorUpload(ctx context.Context, job *model.StudioWorkflowJob, config StudioConnectorConfig, media *model.StudioMedia, name string) (string, error) {
	receipt, err := studioConnectorReadReceipt(job.ID)
	if err != nil {
		return "", err
	}
	if receipt.SourceDigest != "" && (receipt.SourceDigest != media.Digest || receipt.Provider != config.Provider) {
		return "", errors.New("saved upload source or connection differs")
	}
	if receipt.Stage == "completed" {
		return receipt.RemoteID, nil
	}
	if receipt.Stage == "finishing" && receipt.RemoteID == "" {
		model.DB.Model(job).Update("status", "uncertain")
		return "", errors.New("external upload completion is uncertain; reconcile the uploaded file before finishing again")
	}
	if receipt.Stage == "creating" && receipt.UploadID == "" && receipt.RemoteID == "" {
		model.DB.Model(job).Update("status", "uncertain")
		return "", errors.New("external file creation is uncertain; reconcile the destination before starting another upload")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return "", err
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if receipt.Stage == "" {
		receipt.Stage, receipt.Provider, receipt.Name, receipt.SourceDigest, receipt.Size = "creating", config.Provider, name, media.Digest, media.Size
		if config.Provider == "webdav" {
			receipt.RemoteID = name
		}
		if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
			return "", err
		}
		switch config.Provider {
		case "frameio":
			var response struct {
				Data struct {
					ID    string
					Parts []studioConnectorUploadPart `json:"upload_urls"`
				}
			}
			err = studioConnectorJSON(ctx, config, "POST", "/v4/accounts/"+url.PathEscape(config.AccountID)+"/folders/"+url.PathEscape(config.FolderID)+"/files/local_upload", map[string]any{"data": map[string]any{"name": name, "file_size": media.Size}}, &response)
			if err != nil {
				model.DB.Model(job).Update("status", "uncertain")
				return "", err
			}
			receipt.RemoteID, receipt.Parts = response.Data.ID, response.Data.Parts
			if receipt.RemoteID == "" || len(receipt.Parts) < 1 || len(receipt.Parts) > 1024 {
				return "", errors.New("provider returned an invalid upload transaction")
			}
		case "feishu", "lark":
			var response struct {
				Data struct {
					UploadID  string `json:"upload_id"`
					BlockSize int64  `json:"block_size"`
					BlockNum  int    `json:"block_num"`
				}
			}
			err = studioConnectorJSON(ctx, config, "POST", "/open-apis/drive/v1/files/upload_prepare", map[string]any{"file_name": name, "parent_type": "explorer", "parent_node": config.FolderID, "size": media.Size}, &response)
			if err != nil {
				model.DB.Model(job).Update("status", "uncertain")
				return "", err
			}
			receipt.UploadID = response.Data.UploadID
			if receipt.UploadID == "" || response.Data.BlockSize < 1 || response.Data.BlockSize > 20<<20 || response.Data.BlockNum < 1 || response.Data.BlockNum > 1024 {
				return "", errors.New("Feishu returned an invalid upload transaction")
			}
			for index := range response.Data.BlockNum {
				receipt.Parts = append(receipt.Parts, studioConnectorUploadPart{Size: min(response.Data.BlockSize, media.Size-int64(index)*response.Data.BlockSize)})
			}
		case "notion":
			count := int((media.Size + (10 << 20) - 1) / (10 << 20))
			if media.Size <= 20<<20 {
				count = 1
			}
			mode := "single_part"
			body := map[string]any{"mode": mode, "filename": name, "content_type": media.MimeType}
			if count > 1 {
				body["mode"] = "multi_part"
				body["number_of_parts"] = count
			}
			var response struct{ ID string }
			err = studioConnectorJSON(ctx, config, "POST", "/v1/file_uploads", body, &response)
			if err != nil {
				model.DB.Model(job).Update("status", "uncertain")
				return "", err
			}
			receipt.UploadID = response.ID
			if receipt.UploadID == "" {
				return "", errors.New("Notion returned no upload ID")
			}
			for index := range count {
				size := min(10<<20, media.Size-int64(index)*(10<<20))
				if count == 1 {
					size = media.Size
				}
				receipt.Parts = append(receipt.Parts, studioConnectorUploadPart{Size: size})
			}
		case "webdav":
			receipt.Parts = []studioConnectorUploadPart{{Size: media.Size}}
		default:
			return "", errors.New("this connector does not export media")
		}
		receipt.Stage = "uploading"
		if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
			return "", err
		}
	}
	total := int64(0)
	for _, part := range receipt.Parts {
		if part.Size <= 0 || part.Size > StudioMaxMediaBytes {
			return "", errors.New("provider returned an invalid upload part size")
		}
		total += part.Size
	}
	if total != media.Size || receipt.Completed < 0 || receipt.Completed > len(receipt.Parts) {
		return "", errors.New("upload parts do not match the immutable source")
	}
	for index, part := range receipt.Parts {
		if index < receipt.Completed {
			if _, err := file.Seek(part.Size, io.SeekCurrent); err != nil {
				return "", err
			}
			continue
		}
		data, err := io.ReadAll(io.LimitReader(file, part.Size))
		if err != nil || int64(len(data)) != part.Size {
			return "", errors.New("upload source could not be read")
		}
		switch config.Provider {
		case "frameio":
			err = studioConnectorSignedUpload(ctx, config, part.URL, media.MimeType, data)
		case "feishu", "lark", "notion":
			fields := map[string]string{}
			resource := "/v1/file_uploads/" + url.PathEscape(receipt.UploadID) + "/send"
			if config.Provider == "feishu" || config.Provider == "lark" {
				resource = "/open-apis/drive/v1/files/upload_part"
				fields = map[string]string{"upload_id": receipt.UploadID, "seq": strconv.Itoa(index), "size": strconv.FormatInt(part.Size, 10), "checksum": strconv.FormatUint(uint64(adler32.Checksum(data)), 10)}
			} else if len(receipt.Parts) > 1 {
				fields["part_number"] = strconv.Itoa(index + 1)
			}
			body, mimeType, marshalErr := studioConnectorMultipart(fields, receipt.Name, media.MimeType, data)
			if marshalErr != nil {
				return "", marshalErr
			}
			response, _, requestErr := studioConnectorRequest(ctx, config, "POST", resource, mimeType, bytes.NewReader(body), 2<<20)
			err = requestErr
			if err == nil && (config.Provider == "feishu" || config.Provider == "lark") {
				var value struct{ Code int }
				if common.Unmarshal(response, &value) != nil || value.Code != 0 {
					err = errors.New("Feishu rejected an upload part")
				}
			}
		case "webdav":
			_, _, err = studioConnectorRequest(ctx, config, "PUT", "/"+url.PathEscape(receipt.RemoteID), media.MimeType, bytes.NewReader(data), 65536)
		}
		if err != nil {
			return "", err
		}
		receipt.Completed = index + 1
		if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
			return "", err
		}
		if err := studioSaveProgress(job, StudioWorkflowProgress{Phase: "external_uploading"}, 10+receipt.Completed*70/len(receipt.Parts)); err != nil {
			return "", err
		}
	}
	if receipt.Stage != "uploaded" && receipt.Stage != "attaching" {
		switch config.Provider {
		case "feishu", "lark":
			receipt.Stage = "finishing"
			if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
				return "", err
			}
			var response struct {
				Data struct {
					FileToken string `json:"file_token"`
				}
			}
			if err := studioConnectorJSON(ctx, config, "POST", "/open-apis/drive/v1/files/upload_finish", map[string]any{"upload_id": receipt.UploadID, "block_num": len(receipt.Parts)}, &response); err != nil {
				return "", err
			}
			receipt.RemoteID = response.Data.FileToken
		case "notion":
			if len(receipt.Parts) > 1 {
				if err := studioConnectorJSON(ctx, config, "POST", "/v1/file_uploads/"+url.PathEscape(receipt.UploadID)+"/complete", map[string]any{}, nil); err != nil {
					return "", err
				}
			}
			receipt.RemoteID = receipt.UploadID
		case "webdav":
			data, _, err := studioConnectorRequest(ctx, config, "GET", "/"+url.PathEscape(receipt.RemoteID), "", nil, StudioMaxMediaBytes)
			if err != nil {
				return "", err
			}
			digest := sha256.Sum256(data)
			if hex.EncodeToString(digest[:]) != media.Digest {
				return "", errors.New("WebDAV delivery bytes differ from the immutable source")
			}
		}
		if receipt.RemoteID == "" {
			return "", errors.New("provider did not return an exported file")
		}
		receipt.Stage = "uploaded"
		if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
			return "", err
		}
	}
	if config.Provider == "notion" {
		if receipt.Stage == "attaching" {
			model.DB.Model(job).Update("status", "uncertain")
			return "", errors.New("Notion attachment is uncertain; inspect the destination page before appending another block")
		}
		kind := "file"
		for _, possible := range []string{"image", "video", "audio"} {
			if strings.HasPrefix(media.MimeType, possible+"/") {
				kind = possible
			}
		}
		value := map[string]any{"type": "file_upload", "file_upload": map[string]any{"id": receipt.UploadID}}
		if kind == "file" {
			value["name"] = receipt.Name
		}
		receipt.Stage = "attaching"
		if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
			return "", err
		}
		var response struct{ Results []struct{ ID string } }
		if err := studioConnectorJSON(ctx, config, "PATCH", "/v1/blocks/"+url.PathEscape(config.FolderID)+"/children", map[string]any{"children": []any{map[string]any{"object": "block", "type": kind, kind: value}}}, &response); err != nil {
			model.DB.Model(job).Update("status", "uncertain")
			return "", err
		}
		if len(response.Results) != 1 || response.Results[0].ID == "" {
			return "", errors.New("Notion returned no attached file block")
		}
		receipt.RemoteID = response.Results[0].ID
	}
	receipt.Stage, receipt.Parts = "completed", nil
	if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
		return "", err
	}
	return receipt.RemoteID, nil
}
