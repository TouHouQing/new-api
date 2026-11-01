package app

type timelineRenderOutput struct {
	timelineRenderResult
	Fit     string               `json:"fit"`
	AIGC    string               `json:"aigc"`
	Sources []renderSourceRecord `json:"sources"`
}
