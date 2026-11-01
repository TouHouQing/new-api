//go:build !windows && !linux && !darwin && !dragonfly && !freebsd && !netbsd && !openbsd

package service

import (
	"errors"
	"os"
)

func studioTryCacheFileLock(_ *os.File) (bool, error) {
	return false, errors.New("kernel cache locking is unsupported on this operating system")
}

func studioUnlockCacheFile(_ *os.File) error {
	return errors.New("kernel cache locking is unsupported on this operating system")
}
