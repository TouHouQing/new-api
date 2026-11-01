import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioSettingsPanel } from "../src/components/audio-settings-panel";
import { canvasThemes } from "../src/lib/canvas-theme";
import { createModelChannel, defaultConfig, encodeChannelModel } from "../src/stores/use-config-store";
import { backendProviderConfig } from "../src/services/api/generation-task";
import { buildNodeConfig } from "../src/components/canvas/canvas-node-prompt-config";
import { readNodeGenerationSpec, synchronizeGenerationSpec } from "../src/lib/canvas/generation-contract";
import { modelGroupReferenceLimits, modelRequestOptions } from "../src/lib/model-selection";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const model = encodeChannelModel("music", "acestep-1.5-turbo");
const config = {
    ...defaultConfig,
    channels: [createModelChannel({ id: "music", models: ["acestep-1.5-turbo"], interfaceType: "yingce-local-music" })],
    model,
    audioModel: model,
    audioMusicMode: "song",
    audioLyrics: "[Verse]\n晚风吹过山坡",
    audioSeconds: "20",
    audioBpm: "86",
    audioLanguage: "zh",
    audioInstructions: "old speech instruction",
    audioVoice: "old-speaker",
    audioSpeed: "1.5",
};

describe("native music", () => {
    test("shows music controls and actual lyrics without speech-only controls", () => {
        const html = renderToStaticMarkup(<AudioSettingsPanel config={config} theme={Object.values(canvasThemes)[0]} onConfigChange={() => {}} />);
        for (const label of ["音乐类型", "音乐时长（秒）", "音乐节拍（BPM）", "歌词语言", "演唱歌词"]) expect(html).toContain(`aria-label="${label}"`);
        expect(html).toContain("晚风吹过山坡");
        expect(html).not.toContain('aria-label="常用语速"');
        expect(html).not.toContain('aria-label="渠道音色 ID"');
    });
    test("preserves draft lyrics when switching to instrumental and explains how to resolve them", () => {
        const html = renderToStaticMarkup(<AudioSettingsPanel config={{ ...config, audioMusicMode: "instrumental" }} theme={Object.values(canvasThemes)[0]} onConfigChange={() => {}} />);
        expect(html).toContain("已保留歌曲草稿");
        expect(html).toContain("清空歌词");
    });
    test("native submission includes exact lyrics and no stale speech options", () => {
        const request = backendProviderConfig(config, "audio");
        expect(request.audioLyrics).toBe(config.audioLyrics);
        expect(request.audioMusicMode).toBe("song");
        expect(request.audioSeconds).toBe("20");
        expect(request.audioBpm).toBe("86");
        expect(request.audioFormat).toBe("flac");
        expect(request.audioVoice).toBe("");
        expect(request.audioSpeed).toBe("");
        expect(request.audioInstructions).toBe("");
    });
    test("routes using music parameters and forbids all reference kinds", () => {
        expect(modelRequestOptions(config, "audio")).toEqual({ audioMusicMode: "song", audioSeconds: 20, audioBpm: 86, audioLanguage: "zh", audioFormat: "flac" });
        expect(modelGroupReferenceLimits(config, model, "audio")).toEqual({ maxImages: 0, maxVideos: 0, maxAudios: 0 });
    });
    test("persists actual music options in the canonical node contract and restores explicit empty lyrics", () => {
        const node = { id: "song", type: CanvasNodeType.Audio, metadata: { model } } as CanvasNodeData;
        const saved = synchronizeGenerationSpec(node, { audioMusicMode: "song", audioLyrics: config.audioLyrics, audioSeconds: "20", audioBpm: "86" });
        expect(readNodeGenerationSpec(saved)?.options.audioLyrics).toBe(config.audioLyrics);
        const reopened = buildNodeConfig(config, JSON.parse(JSON.stringify(saved)), "audio", { capability: "audio" });
        expect(reopened.audioSeconds).toBe("20");
        expect(reopened.audioBpm).toBe("86");
        expect(reopened.audioLyrics).toBe(config.audioLyrics);
        const cleared = synchronizeGenerationSpec(saved, { audioLyrics: "" });
        expect(buildNodeConfig(config, cleared, "audio", { capability: "audio" }).audioLyrics).toBe("");
    });
});
