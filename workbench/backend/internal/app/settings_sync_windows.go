//go:build windows

package app

// Windows does not support FlushFileBuffers on an ordinary directory handle.
// Both published-key paths already flush the complete file before returning;
// do not turn a successful first key publication into ERROR_ACCESS_DENIED.
func syncSettingsDirectory(string) error { return nil }
