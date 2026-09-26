package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const studioProviderKeyVersion = "v1:"

func studioProviderMasterKey() ([]byte, error) {
	encoded := strings.TrimSpace(os.Getenv("STUDIO_PROVIDER_ENCRYPTION_KEY"))
	if encoded == "" {
		return nil, errors.New("STUDIO_PROVIDER_ENCRYPTION_KEY must be configured before saving Studio provider keys")
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, errors.New("STUDIO_PROVIDER_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
	}
	return key, nil
}

func studioProviderAAD(userID int, kind string) ([]byte, error) {
	if userID <= 0 || (kind != "text" && kind != "image") {
		return nil, errors.New("invalid Studio provider owner or kind")
	}
	return []byte(fmt.Sprintf("new-api:studio-provider:v1:%d:%s", userID, kind)), nil
}

func EncryptStudioProviderKey(userID int, kind, plaintext string) (string, error) {
	aad, err := studioProviderAAD(userID, kind)
	if err != nil {
		return "", err
	}
	if len(plaintext) == 0 || len(plaintext) > 4096 {
		return "", errors.New("Studio provider key must be 1-4096 bytes")
	}
	key, err := studioProviderMasterKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), aad)
	return studioProviderKeyVersion + base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

func DecryptStudioProviderKey(userID int, kind, encrypted string) (string, error) {
	aad, err := studioProviderAAD(userID, kind)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(encrypted, studioProviderKeyVersion) {
		return "", errors.New("invalid Studio provider key envelope")
	}
	key, err := studioProviderMasterKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(encrypted, studioProviderKeyVersion))
	if err != nil || len(data) < gcm.NonceSize()+gcm.Overhead() {
		return "", errors.New("invalid Studio provider key envelope")
	}
	plaintext, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], aad)
	if err != nil {
		return "", errors.New("Studio provider key cannot be decrypted")
	}
	return string(plaintext), nil
}

var strictStudioProviderProtection = func() *common.SSRFProtection {
	protection, err := common.NewSSRFProtectionFromFetchSetting(false, false, false, nil, nil, []string{"443"}, true)
	if err != nil {
		panic(err)
	}
	return protection
}()

// NormalizeStudioProviderBaseURL accepts an HTTPS OpenAI-compatible API root,
// such as https://api.example.com/v1. The outbound client rechecks resolved
// IPs immediately before dialing to block DNS rebinding and private networks.
func NormalizeStudioProviderBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2048 || strings.ContainsAny(raw, "\\\r\n\t") {
		return "", errors.New("invalid Studio provider base URL")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Opaque != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || parsed.RawPath != "" {
		return "", errors.New("Studio provider base URL must be HTTPS without credentials, query or fragment")
	}
	if parsed.Port() != "" && parsed.Port() != "443" {
		return "", errors.New("Studio provider base URL must use port 443")
	}
	host := parsed.Hostname()
	if host == "" || (!strings.Contains(host, ".") && net.ParseIP(host) == nil) {
		return "", errors.New("invalid Studio provider host")
	}
	if err := strictStudioProviderProtection.ValidateNetworkTarget(host, 443); err != nil {
		return "", errors.New("Studio provider target is not public")
	}
	for _, segment := range strings.Split(parsed.Path, "/") {
		if segment == ".." || segment == "." {
			return "", errors.New("invalid Studio provider base path")
		}
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return parsed.String(), nil
}

// NewStudioProviderHTTPClient never uses environment proxies and always checks
// the dialed IP, independent of the site's configurable general fetch policy.
func NewStudioProviderHTTPClient() *http.Client {
	client := newProtectedFetchHTTPClientWithProxy(
		nil,
		nil,
		func() (*common.SSRFProtection, bool, error) { return strictStudioProviderProtection, true, nil },
		func(*http.Request) (*url.URL, error) { return nil, nil },
	)
	client.Timeout = 3 * time.Minute
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	if transport, ok := client.Transport.(*ssrfProtectedRoundTripper); ok {
		transport.forceTLSVerification = true
	}
	return client
}
