package kernel

import (
	"errors"
	"strings"
	"sync/atomic"
)

var apiMount atomic.Value

// ConfigureAPIMount is deployment configuration, set before serving requests.
func ConfigureAPIMount(prefix string) error {
	if prefix != "/api" && prefix != "/api/workbench" {
		return errors.New("unsupported workbench API mount")
	}
	apiMount.Store(prefix)
	return nil
}

func APIPath(suffix string) string {
	prefix, _ := apiMount.Load().(string)
	if prefix == "" {
		prefix = "/api"
	}
	return prefix + "/" + strings.TrimPrefix(suffix, "/")
}
