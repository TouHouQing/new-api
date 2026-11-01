package buildinfo

import (
	"encoding/json"
	"io"
	"runtime"
	"runtime/debug"
	"strings"
)

// PrintVersion lets container integrity probes execute the linked program
// without opening a database, writing application data or starting workers.
func PrintVersion(args []string, output io.Writer) (bool, error) {
	if len(args) != 1 || args[0] != "--version" {
		return false, nil
	}
	return true, json.NewEncoder(output).Encode(Current())
}

var (
	Version   = "dev"
	Commit    = "unknown"
	BuildTime = "unknown"
)

type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"buildTime"`
	GoVersion string `json:"goVersion"`
}

func Current() Info {
	version := normalized(Version, "dev")
	commit := normalized(Commit, "unknown")
	buildTime := normalized(BuildTime, "unknown")
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				if commit == "unknown" {
					commit = normalized(setting.Value, commit)
				}
			case "vcs.time":
				if buildTime == "unknown" {
					buildTime = normalized(setting.Value, buildTime)
				}
			}
		}
	}
	return Info{Version: version, Commit: commit, BuildTime: buildTime, GoVersion: runtime.Version()}
}

func normalized(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
