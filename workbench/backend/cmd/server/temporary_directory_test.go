package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTemporaryDirectoryFreshVolumeAndInvalidPath(t *testing.T) {
	t.Run("new volume", func(t *testing.T) {
		directory := filepath.Join(t.TempDir(), "data", "tmp")
		t.Setenv("TMPDIR", directory)
		t.Setenv("TMP", directory)
		t.Setenv("TEMP", directory)
		if err := prepareTemporaryDirectory(); err != nil {
			t.Fatal(err)
		}
		files, err := os.ReadDir(directory)
		if err != nil || len(files) != 0 {
			t.Fatal("startup left temporary files", err)
		}
	})
	t.Run("file blocks directory", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "blocked")
		if err := os.WriteFile(file, []byte("retain"), 0o600); err != nil {
			t.Fatal(err)
		}
		t.Setenv("TMPDIR", file)
		t.Setenv("TMP", file)
		t.Setenv("TEMP", file)
		if err := prepareTemporaryDirectory(); err == nil {
			t.Fatal("invalid temporary storage admitted")
		}
		bytes, _ := os.ReadFile(file)
		if string(bytes) != "retain" {
			t.Fatal("unrelated file changed")
		}
	})
}
