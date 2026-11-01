package imageops

import "errors"

type Normalize struct {
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Algorithm string `json:"algorithm"`
}

func planNormalization(width, height int, normal Normalize) (Piece, error) {
	if !validSize(width, height) || !validSize(normal.Width, normal.Height) || (normal.Algorithm != "bilinear" && normal.Algorithm != "high") {
		return Piece{}, errors.New("规格整理须使用有效原图尺寸与插值方式")
	}
	// Integer cross-products keep the exact one-percent boundary reproducible
	// for provider dimension rounding, without permitting arbitrary stretching.
	left, right := int64(width)*int64(normal.Height), int64(height)*int64(normal.Width)
	difference := left - right
	if difference < 0 {
		difference = -difference
	}
	if difference*100 > right {
		return Piece{}, errors.New("模型结果比例与原图相差超过1%，请核对构图；不会强行拉伸或裁切")
	}
	return Piece{Width: width, Height: height, OutputWidth: normal.Width, OutputHeight: normal.Height}, nil
}
