package model

// The project owns its brief. Shot intentions and reference states belong to
// immutable ShotRevision records, alongside the prompts they helped produce.
type ProjectCreativeBrief struct {
	Version          int                     `json:"version"`
	Goal             string                  `json:"goal"`
	Audience         string                  `json:"audience"`
	KeyMessage       string                  `json:"keyMessage"`
	TargetDurationMs int64                   `json:"targetDurationMs"`
	Language         string                  `json:"language"`
	Tone             string                  `json:"tone"`
	Constraints      []string                `json:"constraints"`
	TemplateOrigin   *CreativeTemplateOrigin `json:"templateOrigin,omitempty"`
}
type CreativeTemplateOrigin struct {
	ID        string `json:"id"`
	Version   int    `json:"version"`
	InputHash string `json:"inputHash"`
}
type ShotNarrative struct {
	Purpose         string `json:"purpose"`
	Information     string `json:"information"`
	Emotion         string `json:"emotion"`
	VisualBeat      string `json:"visualBeat"`
	ContinuityNeeds string `json:"continuityNeeds"`
}
type ShotReferenceState struct {
	AssetVersionID       string   `json:"assetVersionId"`
	Stage                string   `json:"stage,omitempty"`
	Wardrobe             string   `json:"wardrobe"`
	Emotion              string   `json:"emotion"`
	PropState            string   `json:"propState"`
	Note                 string   `json:"note"`
	ReferenceResourceIDs []string `json:"referenceResourceIds"`
}
