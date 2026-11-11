//go:build !windows

package app

func isPlatformTransientTransportError(error) bool { return false }
