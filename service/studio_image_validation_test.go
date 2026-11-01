package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func studioValidImageFixture(t *testing.T, format string) []byte {
	t.Helper()
	pixels := image.NewRGBA(image.Rect(0, 0, 2, 2))
	pixels.SetRGBA(0, 0, color.RGBA{R: 210, G: 30, B: 70, A: 255})
	var encoded bytes.Buffer
	switch format {
	case "png":
		require.NoError(t, png.Encode(&encoded, pixels))
	case "jpeg":
		require.NoError(t, jpeg.Encode(&encoded, pixels, nil))
	case "gif":
		require.NoError(t, gif.Encode(&encoded, pixels, nil))
	case "webp":
		// Own2x2 pixel fixture encoded with installed OpenCV; not a header stub.
		decoded, err := base64.StdEncoding.DecodeString("UklGRjoAAABXRUJQVlA4TC4AAAAvAUAAAB8gFEAoksufoZuGQCAJYn+KAQUChAiBIgXOfxyhzAOyAcpUYRPR//gA")
		require.NoError(t, err)
		return decoded
	default:
		t.Fatalf("unsupported test fixture format: %s", format)
	}
	return encoded.Bytes()
}

func TestStudioImageValidationFullDecodeAndMIMEMatch(t *testing.T) {
	for _, format := range []string{"png", "jpeg", "webp", "gif"} {
		t.Run(format, func(t *testing.T) {
			file := filepath.Join(t.TempDir(), "original")
			original := studioValidImageFixture(t, format)
			require.NoError(t, os.WriteFile(file, original, 0600))
			require.NoError(t, ValidateStudioImageContent(file, "image/"+format))
			retained, err := os.ReadFile(file)
			require.NoError(t, err)
			require.Equal(t, original, retained, "validation never re-encodes the source")
		})
	}
	file := filepath.Join(t.TempDir(), "png")
	require.NoError(t, os.WriteFile(file, studioValidImageFixture(t, "png"), 0600))
	require.EqualError(t, ValidateStudioImageContent(file, "image/jpeg"), StudioImageTypeMismatch)
	require.EqualError(t, ValidateStudioImageContent(file, "image/tiff"), StudioUnsupportedImageFormat)
	require.NoError(t, ValidateStudioImageContent("non-image-has-no-decoder", "audio/wav"))
}

func TestStudioImageValidationRejectsForgedTruncatedAndOversized(t *testing.T) {
	pngBytes := studioValidImageFixture(t, "png")
	jpegBytes := studioValidImageFixture(t, "jpeg")
	webpBytes := studioValidImageFixture(t, "webp")
	oversized := bytes.Clone(pngBytes)
	binary.BigEndian.PutUint32(oversized[16:20], 8192)
	binary.BigEndian.PutUint32(oversized[20:24], 8192)
	binary.BigEndian.PutUint32(oversized[29:33], crc32.ChecksumIEEE(oversized[12:29]))
	longSide := bytes.Clone(pngBytes)
	binary.BigEndian.PutUint32(longSide[16:20], StudioMaxImageDimension+1)
	binary.BigEndian.PutUint32(longSide[29:33], crc32.ChecksumIEEE(longSide[12:29]))
	for _, item := range []struct {
		name, mime, error string
		data              []byte
	}{
		{"forged-text", "image/png", StudioInvalidImageContent, []byte("This text does not have a PNG header or pixel data.")},
		{"png-no-iend", "image/png", StudioInvalidImageContent, pngBytes[:len(pngBytes)-12]},
		{"jpeg-no-eoi", "image/jpeg", StudioInvalidImageContent, jpegBytes[:len(jpegBytes)-2]},
		{"webp-truncated-pixels", "image/webp", StudioInvalidImageContent, webpBytes[:len(webpBytes)-8]},
		{"pixel-budget", "image/png", StudioImageDimensionLimit, oversized},
		{"long-side", "image/png", StudioImageDimensionLimit, longSide},
	} {
		t.Run(item.name, func(t *testing.T) {
			file := filepath.Join(t.TempDir(), "input")
			require.NoError(t, os.WriteFile(file, item.data, 0600))
			require.EqualError(t, ValidateStudioImageContent(file, item.mime), item.error)
		})
	}
}

func TestStudioImageValidationBoundsAggregateGIFPixelsBeforeDecode(t *testing.T) {
	frame := image.NewPaletted(image.Rect(0, 0, 2048, 2048), color.Palette{color.Black, color.White})
	animation := &gif.GIF{}
	for range 9 {
		animation.Image = append(animation.Image, frame)
		animation.Delay = append(animation.Delay, 1)
	}
	var encoded bytes.Buffer
	require.NoError(t, gif.EncodeAll(&encoded, animation))
	file := filepath.Join(t.TempDir(), "aggregate.gif")
	require.NoError(t, os.WriteFile(file, encoded.Bytes(), 0600))
	require.EqualError(t, ValidateStudioImageContent(file, "image/gif"), StudioGIFFrameLimit)
}

func TestStudioImageValidationBoundsAndDecodesEveryGIFFrame(t *testing.T) {
	frame := image.NewPaletted(image.Rect(0, 0, 2, 2), color.Palette{color.Black, color.White})
	var two bytes.Buffer
	require.NoError(t, gif.EncodeAll(&two, &gif.GIF{Image: []*image.Paletted{frame, frame}, Delay: []int{1, 1}}))
	var excessive bytes.Buffer
	animation := &gif.GIF{}
	for range StudioMaxImageFrames + 1 {
		animation.Image = append(animation.Image, frame)
		animation.Delay = append(animation.Delay, 1)
	}
	require.NoError(t, gif.EncodeAll(&excessive, animation))
	for _, item := range []struct {
		name, error string
		data        []byte
	}{
		{"valid-animation", "", two.Bytes()},
		{"truncated-second-frame", StudioInvalidImageContent, two.Bytes()[:two.Len()-8]},
		{"too-many-frames", StudioGIFFrameLimit, excessive.Bytes()},
	} {
		t.Run(item.name, func(t *testing.T) {
			file := filepath.Join(t.TempDir(), "animation.gif")
			require.NoError(t, os.WriteFile(file, item.data, 0600))
			err := ValidateStudioImageContent(file, "image/gif")
			if item.error == "" {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, item.error)
			}
		})
	}
}

func TestStudioImageValidationSaveRejectsBeforeReceiptObjectOrUpload(t *testing.T) {
	studioProductionFixture(t)
	writes := 0
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writes++
		w.WriteHeader(200)
	}))
	defer remote.Close()
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "s3")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ENDPOINT", remote.URL)
	t.Setenv("TASK_ARTIFACT_STORE_S3_BUCKET", "validation-only")
	t.Setenv("TASK_ARTIFACT_STORE_S3_REGION", "us-east-1")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ACCESS_KEY", "test")
	t.Setenv("TASK_ARTIFACT_STORE_S3_SECRET_KEY", "test")
	for _, item := range []struct {
		id, mime string
		data     []byte
	}{
		{"forged", "image/png", []byte("not image pixels")},
		{"wrong-mime", "image/jpeg", studioValidImageFixture(t, "png")},
		{"truncated", "image/png", studioValidImageFixture(t, "png")[:40]},
	} {
		media, err := SaveStudioMedia(1, item.id, item.mime, bytes.NewReader(item.data))
		require.Error(t, err)
		require.Nil(t, media)
	}
	var rows int64
	require.NoError(t, model.DB.Model(&model.StudioMedia{}).Count(&rows).Error)
	require.Zero(t, rows)
	require.Zero(t, writes, "invalid media must never reach remote object storage")
	root, err := StudioStorageRoot()
	require.NoError(t, err)
	files := 0
	require.NoError(t, filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			files++
		}
		return err
	}))
	require.Zero(t, files, "failed validation must clean incoming temporary bytes, without an orphan final object")
}

func TestStudioImageValidationProviderRejectsLegacyBadImagesBeforeModel(t *testing.T) {
	studioProductionFixture(t)
	bytes := []byte("This text does not have a PNG header or pixel data.")
	digest := sha256.Sum256(bytes)
	media := model.StudioMedia{OwnerID: 1, MediaID: "legacy-invalid", MimeType: "image/png", Size: int64(len(bytes)), Digest: hex.EncodeToString(digest[:]), ObjectKey: "s3://legacy-bucket/retained-invalid"}
	file, err := StudioMediaPath(&media)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Dir(file), 0700))
	require.NoError(t, os.WriteFile(file, bytes, 0600))
	require.NoError(t, model.DB.Create(&media).Error)
	for _, mode := range []string{"", "data-url"} {
		t.Setenv("STUDIO_S3_REFERENCE_MODE", mode)
		reference, err := StudioMediaProviderReference(1, media.MediaID)
		require.EqualError(t, err, StudioInvalidImageContent)
		require.Empty(t, reference, "neither a presigned URL nor inline payload may escape")
	}
	calls := 0
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		calls++
		return StudioRelayResponse{}, nil
	}
	project := model.StudioProject{ID: "invalid-reference", OwnerID: 1, Revision: 1, Document: `{}`}
	job := model.StudioWorkflowJob{ID: "invalid-job", UserID: 1, ProjectID: project.ID, Result: `{}`, LeaseOwner: "validation"}
	require.NoError(t, model.DB.Create(&job).Error)
	err = RunStudioMediaOperation(t.Context(), &job, &project, &StudioMediaOperation{Action: "image_upscale", NodeID: "image", Model: "studio-image-upscale", ReferenceMediaIDs: []string{media.MediaID}})
	require.EqualError(t, err, StudioInvalidImageContent)
	require.Zero(t, calls)
	retained, err := os.ReadFile(file)
	require.NoError(t, err)
	require.Equal(t, bytes, retained, "legacy original remains downloadable for replacement; validation does not delete it")
}

func TestStudioImageValidationPreservesValidMediaAndTakeOnRejectedRetry(t *testing.T) {
	studioProductionFixture(t)
	original := studioValidImageFixture(t, "png")
	media, err := SaveStudioMedia(1, "valid-original", "image/png", bytes.NewReader(original))
	require.NoError(t, err)
	project := model.StudioProject{ID: "original-project", OwnerID: 1, Revision: 1, Document: `{"nodes":[{"id":"image","data":{"takes":[{"id":"original-take","mediaId":"valid-original","prompt":"Original immutable prompt"}]}}]}`}
	require.NoError(t, model.DB.Create(&project).Error)
	_, err = SaveStudioMedia(1, media.MediaID, "image/png", bytes.NewReader([]byte("bad replacement")))
	require.EqualError(t, err, StudioInvalidImageContent)
	path, err := StudioMediaPath(media)
	require.NoError(t, err)
	retained, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, original, retained)
	reference, err := StudioMediaProviderReference(1, media.MediaID)
	require.NoError(t, err)
	require.Equal(t, "data:image/png;base64,"+base64.StdEncoding.EncodeToString(original), reference)
	var after model.StudioProject
	require.NoError(t, model.DB.First(&after, "id = ?", project.ID).Error)
	require.Equal(t, project.Document, after.Document)
	require.Equal(t, project.Revision, after.Revision)
}
