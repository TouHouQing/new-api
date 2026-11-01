import type { TimelineProject } from "@/types/timeline";
import type { EditorCommandRegistry } from "./editor-commands";
import { timelineContentSignature } from "./transcript-cut-command";
import { reconcileTimelineMarkers } from "./timeline-markers";

export const MEDIA_ANALYSIS_MARKERS_COMMAND = "mediaAnalysis.applyMarkers";
export const MEDIA_ANALYSIS_REFRAME_COMMAND = "mediaAnalysis.applyReframe";
export const MEDIA_ANALYSIS_REMOVE_REFRAME_COMMAND = "mediaAnalysis.removeReframe";

export function registerMediaAnalysisCommand(registry: EditorCommandRegistry) {
    registry.register(MEDIA_ANALYSIS_REMOVE_REFRAME_COMMAND, (state, payload) => {
        const { clipId } = payload as { clipId: string };
        const target = state.clips.find((clip) => clip.id === clipId);
        if (!target?.reframe || state.tracks.find((track) => track.id === target.trackId)?.locked) throw new Error("请选择一个有构图且未锁定的片段");
        return {
            ...state,
            clips: state.clips.map((clip) => {
                if (clip.id !== clipId) return clip;
                const { reframe: _crop, ...rest } = clip;
                return rest;
            }),
        };
    });
    registry.register(MEDIA_ANALYSIS_REFRAME_COMMAND, (state, payload) => {
        const { before, after } = payload as { before: TimelineProject; after: TimelineProject };
        if (!before || !after || timelineContentSignature(before) !== timelineContentSignature(state)) throw new Error("剪辑已变化，请重新预览构图");
        const content = (timeline: TimelineProject) => ({ ...timeline, clips: timeline.clips.map(({ reframe: _crop, ...clip }) => clip) });
        if (timelineContentSignature(content(before)) !== timelineContentSignature(content(after))) throw new Error("构图采用不能修改片段、轨道或时间");
        const changed = after.clips.filter((clip, index) => JSON.stringify(clip.reframe) !== JSON.stringify(before.clips[index].reframe));
        if (changed.length !== 1 || !changed[0].reframe || before.tracks.find((track) => track.id === changed[0].trackId)?.locked) throw new Error("请选择一个未锁定的视频片段采用构图");
        return structuredClone(after);
    });
    registry.register(MEDIA_ANALYSIS_MARKERS_COMMAND, (state, payload) => {
        const { before, after } = payload as { before: TimelineProject; after: TimelineProject };
        if (!before || !after || timelineContentSignature(before) !== timelineContentSignature(state)) throw new Error("剪辑已变化，请重新检查标记预览");
        // This command can add anchors and markers, never rewrite media, timing,
        // audio or tracks. Server provenance is checked again by normal save.
        const content = (timeline: TimelineProject) => ({ ...timeline, productionMarkers: undefined, clips: timeline.clips.map(({ analysisOccurrenceId: _anchor, ...clip }) => clip) });
        if (timelineContentSignature(content(before)) !== timelineContentSignature(content(after))) throw new Error("分析标记不能修改片段或轨道");
        return reconcileTimelineMarkers(structuredClone(after));
    });
}
