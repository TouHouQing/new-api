//go:build linux || darwin || dragonfly || freebsd || netbsd || openbsd

package service

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

func studioTryCacheFileLock(file *os.File) (bool, error) {
	err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB)
	if errors.Is(err, unix.EWOULDBLOCK) || errors.Is(err, unix.EAGAIN) || errors.Is(err, unix.EINTR) {
		return false, nil
	}
	return err == nil, err
}

func studioUnlockCacheFile(file *os.File) error {
	return unix.Flock(int(file.Fd()), unix.LOCK_UN)
}
