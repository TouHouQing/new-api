package buildinfo

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
)

type brokenVersionWriter struct{}

func (brokenVersionWriter) Write([]byte) (int, error) { return 0, errors.New("output closed") }

func TestVersionProbeOutputsBuildInfoAndHandlesWriterFailure(t *testing.T) {
	var output bytes.Buffer
	handled, err := PrintVersion([]string{"--version"}, &output)
	if !handled || err != nil {
		t.Fatalf("handled=%v error=%v", handled, err)
	}
	var info Info
	if err := json.Unmarshal(output.Bytes(), &info); err != nil || info.Version == "" || info.GoVersion == "" {
		t.Fatalf("version=%+v error=%v", info, err)
	}
	handled, err = PrintVersion([]string{"--version"}, brokenVersionWriter{})
	if !handled || err == nil {
		t.Fatal("failed output must still stop normal startup")
	}
}

func TestVersionProbeDoesNotConsumeMigrationCommands(t *testing.T) {
	for _, args := range [][]string{nil, {"up"}, {"repair-asset-bytes"}, {"--version", "up"}} {
		var output bytes.Buffer
		handled, err := PrintVersion(args, &output)
		if handled || err != nil || output.Len() != 0 {
			t.Fatalf("args=%v handled=%v output=%s error=%v", args, handled, &output, err)
		}
	}
}
