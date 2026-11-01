import { describe, expect, test } from "bun:test";
import { audioFormatOptionsForConfig, isLocalAudioConfig, normalizeAudioVoiceForConfig } from "../src/lib/audio-generation";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { projectLogicalCapability } from "../src/lib/user-session";
import { confirmVoiceReferenceRights } from "../src/services/voice-rights";
import { parseBackendGenerationResult } from "../src/services/api/generation-task";
import { modelCompatibilityError, modelRequestOptions } from "../src/lib/model-selection";
import { createModelChannel, defaultConfig, encodeChannelModel } from "../src/stores/use-config-store";

describe("本地配音的声音与授权", () => {
    const config = { provider: "custom", model: "models/chatterbox-multilingual", channels: [{ models: ["chatterbox-multilingual"], modelCosts: [], interfaceType: "yingce-local-audio", baseUrl: "", apiKey: "" }] } as any;
    test("仅显示安装模型的格式，保留角色固定音色", () => {
        expect(isLocalAudioConfig(config)).toBe(true);
        expect(
            audioFormatOptionsForConfig(config)
                .map((x) => x.value)
                .sort(),
        ).toEqual(["flac", "mp3", "opus", "wav"]);
        expect(normalizeAudioVoiceForConfig(config, "alloy")).toBe("default");
        expect(normalizeAudioVoiceForConfig(config, "sample:owned")).toBe("sample:owned");
    });
    test("角色固定音色按参考模式路由，已安装语速和语言独立校验", () => {
        const audio = defaultModelCapabilityConfig("yingce-local-audio").audio!;
        const spec = {
            version: 1,
            capability: "audio",
            audio,
            inputs: { audio: { min: 0, max: 1 }, image: { min: 0, max: 0 }, video: { min: 0, max: 0 } },
            options: { audioVoice: { values: ["default", "sample"] }, audioFormat: { values: audio.formats }, audioSpeed: { min: 0.5, max: 2 }, audioLanguage: { values: audio.languages } },
        };
        const channel = createModelChannel({
            id: "local-speech",
            scope: "system",
            models: ["chatterbox-multilingual"],
            interfaceType: "yingce-local-audio",
            modelCosts: [{ model: "chatterbox-multilingual", logicalModelId: "speech", logicalCapabilitySpec: spec } as any],
        });
        const selected = encodeChannelModel(channel.id, "chatterbox-multilingual");
        const current = { ...defaultConfig, model: selected, audioModel: selected, channels: [channel], audioVoice: "sample:owned", audioFormat: "wav", audioSpeed: "1.25", audioLanguage: "zh" };
        const options = modelRequestOptions(current, "audio");
        expect(options).toEqual({ audioVoice: "sample:owned", audioFormat: "wav", audioSpeed: 1.25, audioLanguage: "zh" });
        expect(modelCompatibilityError(current, selected, { capability: "audio", options })).toBe("");
        expect(modelCompatibilityError(current, selected, { capability: "audio", options: { ...options, audioVoice: "sample:" } })).not.toBe("");
        expect(modelCompatibilityError(current, selected, { capability: "audio", options: { ...options, audioSpeed: 4 } })).not.toBe("");
        expect(modelCompatibilityError(current, selected, { capability: "audio", options: { ...options, audioLanguage: "invalid" } })).not.toBe("");
        expect(current.audioVoice).toBe("sample:owned");
    });
    test("已确认音频无需重复弹窗，换音频必须重新确认，取消不产生授权", async () => {
        let dialogs = 0;
        const modal = {
            confirm: (options: any) => {
                dialogs++;
                options.onCancel();
            },
        } as any;
        expect(await confirmVoiceReferenceRights(modal, { storageKey: "resource:one" }, "resource:one")).toBe("resource:one");
        expect(dialogs).toBe(0);
        expect(await confirmVoiceReferenceRights(modal, { storageKey: "resource:two" }, "resource:one")).toBeUndefined();
        expect(dialogs).toBe(1);
        const accept = { confirm: (options: any) => options.onOk() } as any;
        expect(await confirmVoiceReferenceRights(accept, { storageKey: "resource:two" }, "resource:one")).toBe("resource:two");
        await expect(confirmVoiceReferenceRights(accept, { storageKey: "resource:" })).rejects.toThrow("上传");
    });
    test("逻辑模型投影保存实际语速和参考限制，独立于调用者修改", () => {
        const audio = defaultModelCapabilityConfig("yingce-local-audio").audio!;
        const spec = { version: 1 as const, capability: "audio" as const, audio };
        const projected = projectLogicalCapability(spec, {});
        expect(projected.audio).toEqual(audio);
        projected.audio!.formats.push("unsupported");
        expect(audio.formats).not.toContain("unsupported");
    });
    test("刷新后沿用已归档的原生音频，不重新上传或生成", () => {
        const audio = { url: "/api/resources/owned/file", storageKey: "resource:owned", durationMs: 4056, bytes: 81644, mimeType: "audio/mpeg" };
        const result = parseBackendGenerationResult({ resultJson: JSON.stringify({ mode: "audio", audio }) } as any);
        expect(result.audio).toEqual({ ...audio, dataUrl: audio.url });
        const original = parseBackendGenerationResult({ resultJson: JSON.stringify({ mode: "audio", audio: { ...audio, dataUrl: "data:audio/mpeg;base64,original" } }) } as any);
        expect(original.audio?.dataUrl).toBe("data:audio/mpeg;base64,original");
        const unowned = parseBackendGenerationResult({ resultJson: JSON.stringify({ mode: "audio", audio: { url: "https://unowned.invalid/audio.mp3" } }) } as any);
        expect(unowned.audio?.dataUrl).toBeUndefined();
        expect(() => parseBackendGenerationResult({ resultJson: "[]" } as any)).toThrow("格式错误");
    });
    test("多音轨重开保留每条原生地址与角色，拒绝畸形输出列表", () => {
        const audios = [
            { url: "/api/resources/voice/file", storageKey: "resource:voice", name: "人声", role: "vocals" },
            { url: "/api/resources/music/file", storageKey: "resource:music", name: "伴奏", role: "instrumental" },
        ];
        const parsed = parseBackendGenerationResult({ resultJson: JSON.stringify({ mode: "audio", audios }) } as any);
        expect(parsed.audios).toEqual(audios.map((audio) => ({ ...audio, dataUrl: audio.url })));
        for (const value of ["invalid", [null], Array.from({ length: 33 }, () => ({}))]) expect(() => parseBackendGenerationResult({ resultJson: JSON.stringify({ mode: "audio", audios: value }) } as any)).toThrow("音轨列表格式错误");
    });
});
