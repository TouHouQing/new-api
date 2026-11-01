package imageops

import (
	"bytes"
	"encoding/binary"
)

// Read only IFD0 orientation. Offsets and chunk lengths are bounded by the
// already limited source buffer; malformed metadata cannot allocate memory.
func tiffOrientation(data []byte) int {
	data = bytes.TrimPrefix(data, []byte("Exif\x00\x00"))
	if len(data) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(data[2:4]) != 42 {
		return 1
	}
	offset := uint64(order.Uint32(data[4:8]))
	if offset+2 > uint64(len(data)) {
		return 1
	}
	count := int(order.Uint16(data[offset : offset+2]))
	offset += 2
	for i := 0; i < count; i++ {
		if offset+12 > uint64(len(data)) {
			return 1
		}
		entry := data[offset : offset+12]
		offset += 12
		if order.Uint16(entry[:2]) == 0x112 && order.Uint16(entry[2:4]) == 3 && order.Uint32(entry[4:8]) == 1 {
			value := int(order.Uint16(entry[8:10]))
			if value >= 1 && value <= 8 {
				return value
			}
			return 1
		}
	}
	return 1
}

func imageMetadata(data []byte, format string) (orientation int, animated bool) {
	orientation = 1
	switch format {
	case "jpeg":
		for offset := 2; offset+4 <= len(data); {
			if data[offset] != 0xff {
				return orientation, false
			}
			marker := data[offset+1]
			offset += 2
			if marker == 0xff {
				offset--
				continue
			}
			if marker == 0xda || marker == 0xd9 {
				return orientation, false
			}
			if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) {
				continue
			}
			if offset+2 > len(data) {
				break
			}
			length := int(binary.BigEndian.Uint16(data[offset : offset+2]))
			if length < 2 || length > len(data)-offset {
				break
			}
			body := data[offset+2 : offset+length]
			if marker == 0xe1 && bytes.HasPrefix(body, []byte("Exif\x00\x00")) {
				orientation = tiffOrientation(body)
			}
			offset += length
		}
	case "png":
		for offset := 8; offset+12 <= len(data); {
			length := uint64(binary.BigEndian.Uint32(data[offset : offset+4]))
			if length > uint64(len(data)-offset-12) {
				break
			}
			kind := string(data[offset+4 : offset+8])
			body := data[offset+8 : offset+8+int(length)]
			if kind == "acTL" {
				animated = true
			}
			if kind == "eXIf" {
				orientation = tiffOrientation(body)
			}
			offset += 12 + int(length)
		}
	case "webp":
		for offset := 12; offset+8 <= len(data); {
			length := uint64(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
			if length > uint64(len(data)-offset-8) {
				break
			}
			kind := string(data[offset : offset+4])
			body := data[offset+8 : offset+8+int(length)]
			if kind == "ANIM" || kind == "ANMF" || (kind == "VP8X" && len(body) > 0 && body[0]&2 != 0) {
				animated = true
			}
			if kind == "EXIF" {
				orientation = tiffOrientation(body)
			}
			offset += 8 + int(length) + (int(length) & 1)
		}
	}
	return orientation, animated
}
