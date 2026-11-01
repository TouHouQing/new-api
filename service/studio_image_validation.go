package service

import (
	"bufio"
	"encoding/binary"
	"errors"
	"image"
	"image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"strings"

	_ "golang.org/x/image/webp"
)

const StudioMaxImagePixels = 32 * 1024 * 1024
const StudioMaxImageDimension = 16384
const StudioMaxImageFrames = 256

const StudioInvalidImageContent = "This image cannot be decoded. Upload a valid PNG, JPEG, WebP, or GIF."
const StudioImageTypeMismatch = "Image content does not match its declared file type. Upload the original image again."
const StudioUnsupportedImageFormat = "Unsupported image format. Use PNG, JPEG, WebP, or GIF."
const StudioImageDimensionLimit = "Image dimensions exceed the supported image limit. Use a smaller image."
const StudioGIFFrameLimit = "This animated GIF exceeds the supported frame or pixel limit. Use a shorter or smaller GIF."

// ValidateStudioImageContent keeps the uploaded bytes immutable. MIME and a valid
// header alone do not establish that the full image can be used by an editor or
// upstream model. Check dimensions before allocating decoded pixel buffers.
func ValidateStudioImageContent(filePath, mediaType string) error {
	if !strings.HasPrefix(mediaType, "image/") {
		return nil
	}
	format := map[string]string{"image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif"}[mediaType]
	if format == "" {
		return errors.New(StudioUnsupportedImageFormat)
	}
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	config, actual, err := image.DecodeConfig(file)
	if err != nil {
		return errors.New(StudioInvalidImageContent)
	}
	if actual != format {
		return errors.New(StudioImageTypeMismatch)
	}
	if config.Width < 1 || config.Height < 1 || config.Width > StudioMaxImageDimension || config.Height > StudioMaxImageDimension || int64(config.Width)*int64(config.Height) > StudioMaxImagePixels {
		return errors.New(StudioImageDimensionLimit)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if format == "gif" {
		// DecodeAll otherwise allocates every animation frame before the caller
		// can inspect it. Bound aggregate frame pixels and frame count first.
		if err := validateStudioGIFFrameBudget(bufio.NewReader(file)); err != nil {
			return err
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return err
		}
		if _, err := gif.DecodeAll(file); err != nil {
			return errors.New(StudioInvalidImageContent)
		}
		return nil
	}
	decoded, actual, err := image.Decode(file)
	if err != nil {
		return errors.New(StudioInvalidImageContent)
	}
	if actual != format || decoded.Bounds().Dx() != config.Width || decoded.Bounds().Dy() != config.Height {
		return errors.New(StudioImageTypeMismatch)
	}
	return nil
}

// GIF's block structure allows a bounded scan without allocating image pixels.
// Full LZW/pixel validation still belongs to gif.DecodeAll after this preflight.
func validateStudioGIFFrameBudget(reader *bufio.Reader) error {
	invalid := errors.New(StudioInvalidImageContent)
	header := make([]byte, 13)
	if _, err := io.ReadFull(reader, header); err != nil {
		return invalid
	}
	if header[10]&0x80 != 0 {
		if _, err := io.CopyN(io.Discard, reader, int64(3*(1<<((header[10]&7)+1)))); err != nil {
			return invalid
		}
	}
	frames, pixels := 0, int64(0)
	for {
		block, err := reader.ReadByte()
		if err != nil {
			return invalid
		}
		switch block {
		case 0x3b:
			if frames == 0 {
				return invalid
			}
			return nil
		case 0x21:
			if _, err := reader.ReadByte(); err != nil {
				return invalid
			}
		case 0x2c:
			descriptor := make([]byte, 9)
			if _, err := io.ReadFull(reader, descriptor); err != nil {
				return invalid
			}
			width, height := int(binary.LittleEndian.Uint16(descriptor[4:6])), int(binary.LittleEndian.Uint16(descriptor[6:8]))
			if width < 1 || height < 1 {
				return invalid
			}
			frames++
			pixels += int64(width) * int64(height)
			if frames > StudioMaxImageFrames || pixels > StudioMaxImagePixels {
				return errors.New(StudioGIFFrameLimit)
			}
			if descriptor[8]&0x80 != 0 {
				if _, err := io.CopyN(io.Discard, reader, int64(3*(1<<((descriptor[8]&7)+1)))); err != nil {
					return invalid
				}
			}
			if _, err := reader.ReadByte(); err != nil {
				return invalid
			}
		default:
			return invalid
		}
		for {
			size, err := reader.ReadByte()
			if err != nil {
				return invalid
			}
			if size == 0 {
				break
			}
			if _, err := io.CopyN(io.Discard, reader, int64(size)); err != nil {
				return invalid
			}
		}
	}
}
