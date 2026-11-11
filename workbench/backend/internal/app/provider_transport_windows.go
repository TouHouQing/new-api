//go:build windows

package app

import (
	"errors"
	"syscall"
)

// Winsock errors differ from the portable application-error constants.
func isPlatformTransientTransportError(err error) bool {
	return errors.Is(err, syscall.WSAECONNRESET) || errors.Is(err, syscall.WSAECONNABORTED)
}
