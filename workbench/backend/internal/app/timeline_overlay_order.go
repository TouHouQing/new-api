package app

import (
	"fmt"
	"sort"
	"strings"
)

// The top timeline track paints last. Equal track orders preserve occurrence
// order; a caption's highlight always follows its own base raster.
func renderOverlayRanks(project renderProject) map[string]int {
	orders := map[string]int{}
	for _, track := range project.Tracks {
		orders[track.ID] = track.Order
	}
	clips := append([]renderClip(nil), project.Clips...)
	sort.SliceStable(clips, func(i, j int) bool { return orders[clips[i].TrackID] > orders[clips[j].TrackID] })
	ranks := map[string]int{}
	for i, clip := range clips {
		ranks[clip.ID] = i + 1
	}
	return ranks
}

func renderOverlayFilters(plan renderPlan, captions []captionRasterLayer, graphics []motionRasterLayer) ([]string, string) {
	type layer struct {
		rank    int
		caption *captionRasterLayer
		graphic *motionRasterLayer
	}
	items := []layer{}
	for i := range captions {
		items = append(items, layer{rank: plan.OverlayRanks[captions[i].clipID], caption: &captions[i]})
	}
	for i := range graphics {
		items = append(items, layer{rank: plan.OverlayRanks[graphics[i].clip.ID], graphic: &graphics[i]})
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].rank < items[j].rank })
	filters, previous := []string{}, "0:v"
	for i, item := range items {
		next := fmt.Sprintf("overlayvideo%d", i)
		var current []string
		var input, output string
		if item.caption != nil {
			current = captionLayerFilters([]captionRasterLayer{*item.caption}, plan.outputFormat().FPS)
			input, output = "caption0", "captionvideo0"
		} else {
			current = motionLayerFilters([]motionRasterLayer{*item.graphic}, plan.outputFormat(), "0:v")
			input, output = "motion0", "motionvideo0"
		}
		replace := strings.NewReplacer("[0:v]", "["+previous+"]", "["+input+"]", fmt.Sprintf("[overlayinput%d]", i), "["+output+"]", "["+next+"]")
		for _, filter := range current {
			filters = append(filters, replace.Replace(filter))
		}
		previous = next
	}
	if len(items) == 0 {
		return filters, "0:v:0"
	}
	return filters, "[" + previous + "]"
}
