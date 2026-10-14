package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/google/uuid"
)

const StudioStorageUnavailable = "Studio storage is unavailable. Restore free space or reconnect storage before generating."

var studioStorageProbe struct {
	sync.Mutex
	key   string
	until time.Time
	ready bool
}

// Probe write access, not merely bucket read access. A full store may still serve GETs.
func StudioStorageWritable() bool {
	config := system_setting.LoadTaskArtifactStoreConfig()
	if config.Mode != system_setting.TaskArtifactStoreModeS3 {
		return true
	}
	key := sha256.Sum256([]byte(config.S3Endpoint + config.S3Bucket + config.S3Prefix + config.S3AccessKey + config.S3SecretKey))
	studioStorageProbe.Lock()
	defer studioStorageProbe.Unlock()
	if studioStorageProbe.key == hex.EncodeToString(key[:]) && time.Now().Before(studioStorageProbe.until) {
		return studioStorageProbe.ready
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	body := "studio-write-check"
	digest := sha256.Sum256([]byte(body))
	objectKey := path.Join(config.S3Prefix, "health", uuid.NewString())
	response, err := studioS3Request(ctx, config, http.MethodPut, objectKey, hex.EncodeToString(digest[:]), strings.NewReader(body), int64(len(body)), "application/octet-stream")
	ready := err == nil
	if ready {
		response.Body.Close()
		empty := sha256.Sum256(nil)
		removed, removeErr := studioS3Request(ctx, config, http.MethodDelete, objectKey, hex.EncodeToString(empty[:]), nil, 0, "")
		if removeErr == nil {
			removed.Body.Close()
		}
	}
	studioStorageProbe.key, studioStorageProbe.until, studioStorageProbe.ready = hex.EncodeToString(key[:]), time.Now().Add(30*time.Second), ready
	return ready
}

func finishStudioObjectPersistence(media *model.StudioMedia, localPath string) error {
	if system_setting.LoadTaskArtifactStoreConfig().Mode != system_setting.TaskArtifactStoreModeS3 || strings.HasPrefix(media.ObjectKey, "s3://") {
		return nil
	}
	if err := persistStudioObject(media, localPath); err != nil {
		return err
	}
	return model.DB.Model(&model.StudioMedia{}).Where("owner_id = ? AND media_id = ? AND digest = ?", media.OwnerID, media.MediaID, media.Digest).Update("object_key", media.ObjectKey).Error
}

// Object credentials are startup configuration and never enter a project or a
// signed browser URL. Authenticated media routes proxy private bucket objects.
func studioS3Request(ctx context.Context, config system_setting.TaskArtifactStoreConfig, method, key, digest string, body io.Reader, size int64, mediaType string) (*http.Response, error) {
	endpoint, err := url.Parse(config.S3Endpoint)
	if err != nil {
		return nil, err
	}
	endpoint.Path = path.Join(endpoint.Path, config.S3Bucket, key)
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return nil, err
	}
	request.ContentLength = size
	if mediaType != "" {
		request.Header.Set("Content-Type", mediaType)
	}
	request.Header.Set("X-Amz-Content-Sha256", digest)
	credentials := aws.Credentials{AccessKeyID: config.S3AccessKey, SecretAccessKey: config.S3SecretKey}
	if err := v4.NewSigner(func(options *v4.SignerOptions) { options.DisableURIPathEscaping = true }).SignHTTP(ctx, credentials, request, digest, "s3", config.S3Region, time.Now()); err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 3 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("object storage redirects are disabled") }}
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("object storage connection failed")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		response.Body.Close()
		return nil, errors.New("object storage rejected the request")
	}
	return response, nil
}

func persistStudioObject(media *model.StudioMedia, localPath string) error {
	config := system_setting.LoadTaskArtifactStoreConfig()
	if config.Mode != system_setting.TaskArtifactStoreModeS3 {
		return nil
	}
	file, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer file.Close()
	key := path.Join(config.S3Prefix, media.ObjectKey)
	if len("s3://"+config.S3Bucket+"/"+key) > 256 {
		return errors.New("object storage prefix is too long")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	response, err := studioS3Request(ctx, config, http.MethodPut, key, media.Digest, file, media.Size, media.MimeType)
	if err != nil {
		return err
	}
	response.Body.Close()
	media.ObjectKey = "s3://" + config.S3Bucket + "/" + key
	return nil
}

// These short-lived URLs are only sent to an upstream worker. They are never
// written into project documents or returned as long-lived download links.
func StudioMediaProviderReference(ownerID int, mediaID string) (string, error) {
	if os.Getenv("STUDIO_S3_REFERENCE_MODE") == "data-url" {
		return StudioMediaDataURL(ownerID, mediaID)
	}
	media, err := GetStudioMedia(ownerID, mediaID)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(media.ObjectKey, "s3://") {
		return StudioMediaDataURL(ownerID, mediaID)
	}
	config := system_setting.LoadTaskArtifactStoreConfig()
	object, err := url.Parse(media.ObjectKey)
	if err != nil || config.Mode != system_setting.TaskArtifactStoreModeS3 || object.Host != config.S3Bucket {
		return "", errors.New("configure the original object storage bucket")
	}
	endpoint, err := url.Parse(config.S3Endpoint)
	if err != nil {
		return "", err
	}
	endpoint.Path = path.Join(endpoint.Path, object.Host, object.Path)
	query := endpoint.Query()
	query.Set("X-Amz-Expires", fmt.Sprint(config.S3PresignTTLSeconds))
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequest(http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return "", err
	}
	signed, _, err := v4.NewSigner(func(options *v4.SignerOptions) { options.DisableURIPathEscaping = true }).PresignHTTP(context.Background(), aws.Credentials{AccessKeyID: config.S3AccessKey, SecretAccessKey: config.S3SecretKey}, request, "UNSIGNED-PAYLOAD", "s3", config.S3Region, time.Now())
	return signed, err
}

func restoreStudioObject(media *model.StudioMedia, localPath string) error {
	if _, err := os.Stat(localPath); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if !strings.HasPrefix(media.ObjectKey, "s3://") {
		return errors.New("stored media bytes are unavailable")
	}
	config := system_setting.LoadTaskArtifactStoreConfig()
	object, err := url.Parse(media.ObjectKey)
	if err != nil || config.Mode != system_setting.TaskArtifactStoreModeS3 || object.Host != config.S3Bucket {
		return errors.New("configure the original object storage bucket")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	empty := sha256.Sum256(nil)
	response, err := studioS3Request(ctx, config, http.MethodGet, strings.TrimPrefix(object.Path, "/"), hex.EncodeToString(empty[:]), nil, 0, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if err := os.MkdirAll(filepath.Dir(localPath), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(localPath), "object-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(response.Body, StudioMaxMediaBytes+1))
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if size != media.Size || hex.EncodeToString(hash.Sum(nil)) != media.Digest {
		return errors.New("object storage media integrity check failed")
	}
	return os.Rename(file.Name(), localPath)
}
