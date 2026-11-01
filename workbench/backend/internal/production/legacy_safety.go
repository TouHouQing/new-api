// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"net/url"
	"strings"
)

func validateLegacyDocumentSafety(document map[string]any) error {
	var visit func(any) error
	visit = func(value any) error {
		switch object := value.(type) {
		case []any:
			for _, child := range object {
				if err := visit(child); err != nil {
					return err
				}
			}
		case map[string]any:
			for key, child := range object {
				if legacyCredentialKey(key) && child != nil && child != "" {
					return ErrLegacyBundle
				}
				if text, ok := child.(string); ok {
					if strings.HasSuffix(strings.ToLower(key), "snapshot") {
						var snapshot any
						if json.Unmarshal([]byte(text), &snapshot) == nil {
							if err := visit(snapshot); err != nil {
								return err
							}
						}
					}
					if strings.HasSuffix(strings.ToLower(key), "url") {
						if parsed, err := url.Parse(text); err == nil {
							if parsed.User != nil {
								return ErrLegacyBundle
							}
							for parameter := range parsed.Query() {
								if legacyCredentialKey(parameter) {
									return ErrLegacyBundle
								}
							}
						}
					}
				}
				if err := visit(child); err != nil {
					return err
				}
			}
		}
		return nil
	}
	return visit(document)
}

func legacyCredentialKey(key string) bool {
	key = strings.ToLower(strings.NewReplacer("-", "", "_", "", " ", "").Replace(key))
	switch key {
	case "apikey", "authorization", "cookie", "setcookie", "password", "accesstoken", "refreshtoken", "accesskeysecret", "clientsecret", "sessioncookie":
		return true
	}
	return false
}
