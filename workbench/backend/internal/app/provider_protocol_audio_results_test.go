package app

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"yingce/backend/internal/protocol"
)

func protocolAudioTestWave(level int16) []byte {
	data := make([]byte, 44+16000)
	copy(data, "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], 8000)
	binary.LittleEndian.PutUint32(data[28:], 16000)
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], 16000)
	for i := 44; i < len(data); i += 2 {
		binary.LittleEndian.PutUint16(data[i:], uint16(level))
		level = -level
	}
	return data
}

func TestProtocolAudioDirectResultRetainsAllNamedTracksAndTheirBytes(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	waves := map[string][]byte{"/vocals.wav": protocolAudioTestWave(4096), "/instrumental.wav": protocolAudioTestWave(6144)}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/wav")
		_, _ = w.Write(waves[r.URL.Path])
	}))
	defer server.Close()
	result, err := finishProtocolResult(context.Background(), providerConfig{BaseURL: server.URL}, "audio", "", &protocol.Result{Audios: []protocol.MediaReference{
		{URL: server.URL + "/vocals.wav", Name: " 人声\n主轨 ", Role: "vocals"},
		{URL: server.URL + "/instrumental.wav", Name: "伴奏", Role: "instrumental"},
	}}, videoPollPolicy{})
	if err != nil {
		t.Fatal(err)
	}
	tracks, ok := result["audios"].([]interface{})
	if !ok || len(tracks) != 2 || !reflect.DeepEqual(result["audio"], tracks[0]) {
		t.Fatal("direct protocol path lost a track or changed the primary", result)
	}
	for index, path := range []string{"/vocals.wav", "/instrumental.wav"} {
		track := tracks[index].(map[string]interface{})
		encoded := strings.TrimPrefix(track["dataUrl"].(string), "data:audio/wav;base64,")
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || !reflect.DeepEqual(decoded, waves[path]) {
			t.Fatal("audio bytes changed in the protocol projection", index, err)
		}
		if track["role"] != []string{"vocals", "instrumental"}[index] || track["name"] != []string{"人声 主轨", "伴奏"}[index] {
			t.Fatal("audio identity was omitted", track)
		}
	}
}
