import { creativeBriefPrompt, parseCreativeBrief, shotIntentionsFromRevision, shotIntentionPrompt } from "@/lib/project-creative-brief";
import { resourceFileUrl } from "@/services/api/resources";
import type { ShotRevision } from "@/services/api/projects";

export function ShotPlanBriefPreview({ raw, description }: { raw: string; description: string }) {
    const brief = parseCreativeBrief(raw);
    return (
        <details className="text-sm">
            <summary className="cursor-pointer">方案中的创作目标与简介</summary>
            {raw && !brief && <p role="alert">原创作目标无法读取，请核对原始记录。</p>}
            {brief && <p className="mt-2 whitespace-pre-wrap">{creativeBriefPrompt(brief)}</p>}
            {description && <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap">{description}</p>}
            {!raw && !description && <p className="mt-2 text-foreground/60">此方案未设置创作目标与简介。</p>}
        </details>
    );
}

export function ShotPlanRevisionPreview({ revision }: { revision?: ShotRevision }) {
    if (!revision) return <p role="alert">此镜头的原脚本暂不可读，请核对记录。</p>;
    let intentions: ReturnType<typeof shotIntentionsFromRevision>;
    try {
        intentions = shotIntentionsFromRevision(revision);
    } catch {
        return <p role="alert">此镜头的意图或接戏设定无法读取，原记录已保留。</p>;
    }
    const lines = shotIntentionPrompt(intentions.narrative, intentions.referenceStates);
    return (
        <details className="mt-2">
            <summary className="cursor-pointer">核对提示词、镜头意图与固定参考</summary>
            <div className="mt-2 space-y-2">
                {revision.imagePrompt && <p className="whitespace-pre-wrap">图片要求：{revision.imagePrompt}</p>}
                {revision.videoPrompt && <p className="whitespace-pre-wrap">视频要求：{revision.videoPrompt}</p>}
                {lines.map((line, index) => (
                    <p className="whitespace-pre-wrap" key={index}>
                        {line}
                    </p>
                ))}
                {intentions.referenceStates?.map((state, index) => (
                    <div key={`${state.assetVersionId}:${state.stage || ""}`}>
                        <p>
                            固定参考 {index + 1}
                            {state.stage ? `（${state.stage === "image" ? "图片" : "视频"}阶段）` : ""} · {state.referenceResourceIds?.length || 0} 张图
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                            {state.referenceResourceIds?.map((id) => (
                                <a key={id} href={resourceFileUrl(id)} target="_blank" rel="noreferrer">
                                    <img src={resourceFileUrl(id)} loading="lazy" alt={`固定参考 ${index + 1} 的原图`} className="h-16 w-20 rounded object-contain" />
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </details>
    );
}
