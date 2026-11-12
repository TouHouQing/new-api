import { modelCapabilityConfigFor, normalizeVideoValue } from "@/lib/model-capabilities";
import { delegatesVideoCapabilityToUpstream, resolveModelVideoBooleanOptions } from "@/lib/model-selection";
import type { AiConfig } from "@/stores/use-config-store";
import type { CreationSettings } from "./creation-types";

// 内部模型按声明能力归一化；New API 视频模型保留用户参数，由上游判断。
export function creationVideoConfig(config: AiConfig, model: string, settings: Pick<CreationSettings, "ratio" | "seconds" | "videoQuality">): AiConfig {
    const profile = modelCapabilityConfigFor(config, model).video!;
    const delegated = delegatesVideoCapabilityToUpstream(config, model);
    const normalized = delegated
        ? {
              ratio: settings.ratio,
              seconds: settings.seconds,
              resolution: settings.videoQuality,
          }
        : normalizeVideoValue(profile, {
              ratio: settings.ratio,
              seconds: settings.seconds,
              resolution: settings.videoQuality,
          });
    const videoBooleans = delegated
        ? {
              videoGenerateAudio: config.videoGenerateAudio || "false",
              videoWatermark: config.videoWatermark || "false",
          }
        : resolveModelVideoBooleanOptions(
              config,
              model,
              {},
              {
                  videoGenerateAudio: config.videoGenerateAudio,
                  videoWatermark: config.videoWatermark,
              },
          );
    return {
        ...config,
        model,
        videoModel: model,
        size: normalized.ratio,
        videoSeconds: normalized.seconds,
        vquality: normalized.resolution.replace(/p$/i, ""),
        ...videoBooleans,
    };
}
