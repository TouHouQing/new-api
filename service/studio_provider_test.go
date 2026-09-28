package service

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioProviderKeyEncryptedAndBoundToOwner(t *testing.T) {
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x7a}, 32)))
	ciphertext, err := EncryptStudioProviderKey(12, "text", "sk-private-test")
	require.NoError(t, err)
	assert.NotContains(t, ciphertext, "sk-private-test")
	assert.True(t, strings.HasPrefix(ciphertext, "v1:"))

	plaintext, err := DecryptStudioProviderKey(12, "text", ciphertext)
	require.NoError(t, err)
	assert.Equal(t, "sk-private-test", plaintext)
	_, err = DecryptStudioProviderKey(13, "text", ciphertext)
	assert.Error(t, err)
	_, err = DecryptStudioProviderKey(12, "image", ciphertext)
	assert.Error(t, err)
}

func TestStudioProviderKeyRequiresStableServerSecret(t *testing.T) {
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", "")
	_, err := EncryptStudioProviderKey(12, "text", "sk-private-test")
	assert.ErrorContains(t, err, "STUDIO_PROVIDER_ENCRYPTION_KEY")
}

func TestStudioProviderBaseURLRejectsUnsafeTargets(t *testing.T) {
	base, err := NormalizeStudioProviderBaseURL("https://api.example.com/v1/")
	require.NoError(t, err)
	assert.Equal(t, "https://api.example.com/v1", base)
	for _, input := range []string{
		"http://api.example.com/v1",
		"https://127.0.0.1/v1",
		"https://api.example.com/v1?token=secret",
		"https://user:pass@api.example.com/v1",
		"https://api.example.com:8443/v1",
	} {
		_, err := NormalizeStudioProviderBaseURL(input)
		assert.Error(t, err, input)
	}
}

func TestStudioProviderClientKeepsTLSVerificationEnabled(t *testing.T) {
	previous := common.TLSInsecureSkipVerify
	common.TLSInsecureSkipVerify = true
	t.Cleanup(func() { common.TLSInsecureSkipVerify = previous })
	client := NewStudioProviderHTTPClient()
	transport, ok := client.Transport.(*ssrfProtectedRoundTripper)
	require.True(t, ok)
	direct := transport.newTransport(nil)
	assert.True(t, direct.TLSClientConfig == nil || !direct.TLSClientConfig.InsecureSkipVerify)
}

func TestStudioProviderClientBlocksPrivateIPEvenWhenGeneralFetchProtectionIsOff(t *testing.T) {
	fetchSetting := system_setting.GetFetchSetting()
	previous := fetchSetting.EnableSSRFProtection
	fetchSetting.EnableSSRFProtection = false
	t.Cleanup(func() { fetchSetting.EnableSSRFProtection = previous })
	client := NewStudioProviderHTTPClient()
	_, err := client.Get("https://127.0.0.1/v1/models")
	assert.ErrorContains(t, err, "private IP")
}
