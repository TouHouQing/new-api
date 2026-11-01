package imageops

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"io"
)

const maxColorProfileBytes = 4 << 20

type pngColorChunk struct {
	kind string
	body []byte
}

type colorMetadata struct {
	gray   bool
	chunks []pngColorChunk
}

func colorMetadataError() error {
	return errors.New("图片色彩配置无效或不受支持，请保留原图并先转换为RGB或灰度PNG")
}

func validateICC(profile []byte, gray bool) error {
	if len(profile) < 132 || len(profile) > maxColorProfileBytes || int64(binary.BigEndian.Uint32(profile)) != int64(len(profile)) || string(profile[36:40]) != "acsp" {
		return colorMetadataError()
	}
	space := "RGB "
	if gray {
		space = "GRAY"
	}
	if string(profile[16:20]) != space || (string(profile[20:24]) != "XYZ " && string(profile[20:24]) != "Lab ") {
		return colorMetadataError()
	}
	count := uint64(binary.BigEndian.Uint32(profile[128:132]))
	end := uint64(132) + count*12
	if end > uint64(len(profile)) {
		return colorMetadataError()
	}
	for offset := uint64(132); offset < end; offset += 12 {
		start := uint64(binary.BigEndian.Uint32(profile[offset+4 : offset+8]))
		size := uint64(binary.BigEndian.Uint32(profile[offset+8 : offset+12]))
		if start < end || start%4 != 0 || size < 8 || start+size > uint64(len(profile)) {
			return colorMetadataError()
		}
	}
	return nil
}

func compressedICC(body []byte, gray bool) error {
	nameEnd := bytes.IndexByte(body, 0)
	if nameEnd < 1 || nameEnd > 79 || nameEnd+2 >= len(body) || body[nameEnd+1] != 0 {
		return colorMetadataError()
	}
	for _, value := range body[:nameEnd] {
		if value < 32 || (value >= 127 && value <= 160) {
			return colorMetadataError()
		}
	}
	if body[0] == ' ' || body[nameEnd-1] == ' ' || bytes.Contains(body[:nameEnd], []byte("  ")) {
		return colorMetadataError()
	}
	input := bytes.NewReader(body[nameEnd+2:])
	reader, err := zlib.NewReader(input)
	if err != nil {
		return colorMetadataError()
	}
	profile, readErr := io.ReadAll(io.LimitReader(reader, maxColorProfileBytes+1))
	closeErr := reader.Close()
	if readErr != nil || closeErr != nil || input.Len() != 0 {
		return colorMetadataError()
	}
	return validateICC(profile, gray)
}

// Keep color descriptions, not geometry, orientation, thumbnails or arbitrary
// metadata. PNG chunks are re-emitted before IDAT with new CRCs.
func pngColorMetadata(data []byte) (colorMetadata, error) {
	if len(data) < 33 {
		return colorMetadata{}, colorMetadataError()
	}
	metadata := colorMetadata{gray: data[25] == 0 || data[25] == 4}
	seen := make(map[string]bool)
	idat := false
	for offset := 8; offset+12 <= len(data); {
		length := uint64(binary.BigEndian.Uint32(data[offset : offset+4]))
		if length > uint64(len(data)-offset-12) {
			return colorMetadata{}, colorMetadataError()
		}
		end := offset + 12 + int(length)
		kind := string(data[offset+4 : offset+8])
		body := data[offset+8 : end-4]
		if crc32.ChecksumIEEE(data[offset+4:end-4]) != binary.BigEndian.Uint32(data[end-4:end]) {
			return colorMetadata{}, colorMetadataError()
		}
		preserve := true
		switch kind {
		case "iCCP":
			if err := compressedICC(body, metadata.gray); err != nil {
				return colorMetadata{}, err
			}
		case "sRGB":
			if len(body) != 1 || body[0] > 3 {
				return colorMetadata{}, colorMetadataError()
			}
		case "gAMA":
			if len(body) != 4 || binary.BigEndian.Uint32(body) == 0 {
				return colorMetadata{}, colorMetadataError()
			}
		case "cHRM":
			if len(body) != 32 {
				return colorMetadata{}, colorMetadataError()
			}
		case "cICP":
			if len(body) != 4 || body[2] != 0 || body[3] != 1 {
				return colorMetadata{}, colorMetadataError()
			}
		case "mDCV":
			if len(body) != 24 {
				return colorMetadata{}, colorMetadataError()
			}
		case "cLLI":
			if len(body) != 8 {
				return colorMetadata{}, colorMetadataError()
			}
		case "IDAT":
			idat, preserve = true, false
		case "IEND":
			if len(body) != 0 || !idat || end != len(data) {
				return colorMetadata{}, colorMetadataError()
			}
			if seen["iCCP"] && seen["sRGB"] {
				return colorMetadata{}, colorMetadataError()
			}
			return metadata, nil
		default:
			preserve = false
		}
		if preserve {
			if idat || seen[kind] || len(body) > maxColorProfileBytes {
				return colorMetadata{}, colorMetadataError()
			}
			seen[kind] = true
			metadata.chunks = append(metadata.chunks, pngColorChunk{kind, bytes.Clone(body)})
		}
		offset = end
	}
	return colorMetadata{}, colorMetadataError()
}

func profileMetadata(profile []byte, gray bool) (colorMetadata, error) {
	metadata := colorMetadata{gray: gray}
	if len(profile) == 0 {
		return metadata, nil
	}
	if err := validateICC(profile, gray); err != nil {
		return colorMetadata{}, err
	}
	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	if _, err := writer.Write(profile); err != nil {
		return colorMetadata{}, err
	}
	if err := writer.Close(); err != nil {
		return colorMetadata{}, err
	}
	body := append([]byte("ICC profile\x00\x00"), compressed.Bytes()...)
	metadata.chunks = []pngColorChunk{{"iCCP", body}}
	return metadata, nil
}

func jpegColorMetadata(data []byte) (colorMetadata, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.ColorModel == color.CMYKModel {
		return colorMetadata{}, colorMetadataError()
	}
	gray := config.ColorModel == color.GrayModel
	var fragments [256][]byte
	count, total := 0, 0
	for offset := 2; offset+2 <= len(data); {
		if data[offset] != 0xff {
			return colorMetadata{}, colorMetadataError()
		}
		marker := data[offset+1]
		offset += 2
		if marker == 0xff {
			offset--
			continue
		}
		if marker == 0xda || marker == 0xd9 {
			break
		}
		if marker == 1 || (marker >= 0xd0 && marker <= 0xd7) {
			continue
		}
		if offset+2 > len(data) {
			return colorMetadata{}, colorMetadataError()
		}
		length := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		if length < 2 || length > len(data)-offset {
			return colorMetadata{}, colorMetadataError()
		}
		body := data[offset+2 : offset+length]
		if marker == 0xe2 && bytes.HasPrefix(body, []byte("ICC_PROFILE\x00")) {
			if len(body) < 15 || body[12] == 0 || body[13] == 0 || body[12] > body[13] || fragments[body[12]] != nil || (count != 0 && count != int(body[13])) {
				return colorMetadata{}, colorMetadataError()
			}
			count, fragments[body[12]] = int(body[13]), body[14:]
			total += len(body) - 14
			if total > maxColorProfileBytes {
				return colorMetadata{}, colorMetadataError()
			}
		}
		offset += length
	}
	profile := make([]byte, 0, total)
	for index := 1; index <= count; index++ {
		if fragments[index] == nil {
			return colorMetadata{}, colorMetadataError()
		}
		profile = append(profile, fragments[index]...)
	}
	return profileMetadata(profile, gray)
}

func readColorMetadata(data []byte, format string) (colorMetadata, error) {
	switch format {
	case "png":
		return pngColorMetadata(data)
	case "jpeg":
		return jpegColorMetadata(data)
	case "webp":
		if len(data) < 20 || uint64(binary.LittleEndian.Uint32(data[4:8]))+8 != uint64(len(data)) {
			return colorMetadata{}, colorMetadataError()
		}
		var profile []byte
		iccFlag, pixelsSeen := false, false
		offset := 12
		for offset+8 <= len(data) {
			length := uint64(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
			if length > uint64(len(data)-offset-8) {
				return colorMetadata{}, colorMetadataError()
			}
			kind := string(data[offset : offset+4])
			if kind == "VP8X" && length == 10 {
				iccFlag = data[offset+8]&0x20 != 0
			}
			if kind == "VP8 " || kind == "VP8L" {
				pixelsSeen = true
			}
			if kind == "ICCP" {
				if !iccFlag || pixelsSeen || profile != nil || length == 0 || length > maxColorProfileBytes {
					return colorMetadata{}, colorMetadataError()
				}
				profile = data[offset+8 : offset+8+int(length)]
			}
			offset += 8 + int(length) + (int(length) & 1)
		}
		if offset != len(data) || iccFlag != (profile != nil) {
			return colorMetadata{}, colorMetadataError()
		}
		return profileMetadata(profile, false)
	default:
		return colorMetadata{}, colorMetadataError()
	}
}

func appendColorMetadata(data []byte, metadata colorMetadata) ([]byte, error) {
	if len(metadata.chunks) == 0 {
		return data, nil
	}
	if len(data) < 33 {
		return nil, colorMetadataError()
	}
	gray := data[25] == 0 || data[25] == 4
	if gray != metadata.gray {
		return nil, colorMetadataError()
	}
	var buffer bytes.Buffer
	buffer.Grow(len(data) + 1024)
	buffer.Write(data[:33])
	for _, chunk := range metadata.chunks {
		writePNGChunk(&buffer, chunk.kind, chunk.body)
	}
	buffer.Write(data[33:])
	return buffer.Bytes(), nil
}
