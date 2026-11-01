package main

import "os"

// A newly mounted data volume may not yet contain the configured TMPDIR.
// Discover a non-writable location before accepting uploads or render tasks.
func prepareTemporaryDirectory() error {
	directory := os.TempDir()
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return err
	}
	file, err := os.CreateTemp(directory, "yingce-startup-")
	if err != nil {
		return err
	}
	name := file.Name()
	if err := file.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	return os.Remove(name)
}
