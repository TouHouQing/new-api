package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCanvasCaptionSourceRejectsInvalidSnapshot(t *testing.T) {
	raw := `{"id":"n","type":"video","title":"原片","metadata":{"storageKey":"resource:r","subtitleEntries":[{"index":1,"startMs":0,"endMs":2000,"text":"你好😀"}],"subtitleStyle":{"fontSize":18,"color":"#ffffff"},"subtitleHighlights":[{"entryIndex":1,"start":2,"end":4,"sourceText":"你好😀","highlightText":"😀"}]}}`
	snapshot, hash, err := ParseCanvasCaptionSource(json.RawMessage(raw), "n", "r", "video", 3000)
	if err != nil || len(hash) != 64 || len(snapshot.Captions) != 1 {
		t.Fatal(err)
	}
	for name, bad := range map[string]string{
		"wrong-file":      strings.Replace(raw, "resource:r", "resource:other", 1),
		"too-long":        strings.Replace(raw, `"endMs":2000`, `"endMs":4000`, 1),
		"fractional-cue":  strings.Replace(raw, `"startMs":0`, `"startMs":0.5`, 1),
		"style-url":       strings.Replace(raw, `"color":"#ffffff"`, `"color":"url(https://example.com)"`, 1),
		"style-secrets":   strings.Replace(raw, `"fontSize":18`, `"fontSize":18,"apiKey":"secret"`, 1),
		"stale-highlight": strings.Replace(raw, `"sourceText":"你好😀"`, `"sourceText":"旧文字"`, 1),
		"half-emoji":      strings.Replace(raw, `"start":2`, `"start":3`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, _, err := ParseCanvasCaptionSource(json.RawMessage(bad), "n", "r", "video", 3000); err == nil {
				t.Fatal("invalid snapshot accepted")
			}
		})
	}
}
