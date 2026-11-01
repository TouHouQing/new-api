// AI 编辑命令的边界层：同一份注册表同时约束模型输出和宿主执行，避免提示词与真实能力列表分叉。
// 本文件只负责 JSON 结构解析、批量预检和提示词契约生成；命令的参数合法性仍由编辑命令注册表统一判定。
// 预检使用与正式执行相同的纯函数注册表，保证“模型看见的能力”和“宿主实际允许的能力”一致。

import { getEditorCommandRegistry, type EditCommand } from "@/lib/timeline/editor-commands";
import type { TimelineProject } from "@/types/timeline";

/** LLM 输出 JSON 结构：reasoning 可选，commands 至少一条。 */
export type AiCommandPlan = {
    reasoning?: string;
    commands: EditCommand[];
};

export type AiCommandBatchVerdict = { ok: true } | { ok: false; index: number; op: string; error: string };

export class AiCommandPlanError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AiCommandPlanError";
    }
}

/** 从 LLM 回复中提取首个 JSON 对象（容忍 markdown fence / 前后缀杂讯）。 */
function extractFirstJsonObject(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    if (start < 0) throw new AiCommandPlanError("输出中未找到 JSON 对象（需要 { commands: [...] }）");
    // 从首个 { 起逐字符数括号，找配对的收尾 }（字符串内括号不计）。
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
        const ch = candidate[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
        } else if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) return candidate.slice(start, i + 1);
        }
    }
    throw new AiCommandPlanError("JSON 对象未闭合（缺少收尾 }）");
}

function assertPlanShape(raw: unknown): asserts raw is AiCommandPlan {
    if (typeof raw !== "object" || raw === null) throw new AiCommandPlanError("输出必须是 JSON 对象");
    const plan = raw as Record<string, unknown>;
    if (plan.reasoning !== undefined && typeof plan.reasoning !== "string") {
        throw new AiCommandPlanError("reasoning 必须是字符串");
    }
    if (!Array.isArray(plan.commands)) throw new AiCommandPlanError("缺少 commands 数组");
    if (plan.commands.length > AI_EDITING_MAX_COMMANDS) {
        throw new AiCommandPlanError(`commands 超过 ${AI_EDITING_MAX_COMMANDS} 条上限`);
    }
    // commands 为空数组 = 只读问答 / 无可用命令，合法终态
    plan.commands.forEach((cmd, i) => {
        if (typeof cmd !== "object" || cmd === null) throw new AiCommandPlanError(`commands[${i}] 必须是对象`);
        const c = cmd as Record<string, unknown>;
        if (typeof c.op !== "string" || c.op.length === 0) throw new AiCommandPlanError(`commands[${i}].op 必须是非空字符串`);
        if (typeof c.payload !== "object" || c.payload === null || Array.isArray(c.payload)) {
            throw new AiCommandPlanError(`commands[${i}].op=${c.op} 缺少对象 payload`);
        }
    });
}

/**
 * 解析模型文本为 AiCommandPlan；结构非法时抛 AiCommandPlanError，调用方可将明确原因展示给用户或回传模型修正。
 * commands 为空数组表示只读问答或当前能力无法完成，调用方不应把它当成“执行成功的空修改”。
 */
export function parseAiCommandPlan(text: string): AiCommandPlan {
    let raw: unknown;
    try {
        raw = JSON.parse(extractFirstJsonObject(text));
    } catch (error) {
        if (error instanceof AiCommandPlanError) throw error;
        throw new AiCommandPlanError(`JSON 解析失败：${(error as Error).message}`);
    }
    assertPlanShape(raw);
    return raw;
}

/**
 * 批级预检：把整批命令按序 dry-run 到当前时间线（immutable 纯函数，无副作用）。
 * 任何一条触发注册表的拒绝规则（未知 op、非法 payload 或引用不存在）即整批拒绝，
 * 返回首个失败命令的位置和原因；正式执行不得绕过这一步或只提交部分命令。
 */
export function validateAiCommandBatch(project: TimelineProject, plan: AiCommandPlan): AiCommandBatchVerdict {
    const registry = getEditorCommandRegistry();
    let state = project;
    for (let i = 0; i < plan.commands.length; i += 1) {
        const cmd = plan.commands[i];
        try {
            state = registry.apply(state, cmd);
        } catch (error) {
            return { ok: false, index: i, op: cmd.op, error: (error as Error).message };
        }
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// 模型提示词契约：schema 同时用于宿主校验与模型输出约束，具体交互决策见 ADR-0007。
// ---------------------------------------------------------------------------

/** AI 命令 schema 版本；提示词契约或解析规则变化时递增，用于 golden 测试和缓存失效对齐。 */
export const AI_COMMAND_SCHEMA_VERSION = 6;

/** 单次 AI 编辑最多允许的命令条数，防止一次模型输出造成不可控的大范围变更。 */
export const AI_EDITING_MAX_COMMANDS = 8;

/** LLM 可读 payload 契约；op 集合与注册表黄金同步（见测试）。 */
export const AI_EDITING_OP_CATALOG: ReadonlyArray<{
    op: string;
    desc: string;
    payload: string;
}> = [
    { op: "setOutput", desc: "设置当前剪辑的成片画幅、帧率和画面适配，保留片段、声音和字幕", payload: "{ output: { width:64..4096偶数, height:64..4096偶数, fps:12..60整数, fit?:letterbox|crop|blur } }" },
    {
        op: "addGraphic",
        desc: "新增可编辑标题、图标、形状或图片叠层，原子创建所需文字轨道",
        payload:
            "{ id:新唯一编号,startMs:非负整数,durationMs:正整数,text:文字或名称,trackId?:已有未锁定文字轨,graphic:{version:1,kind:text|icon|shape|image,x:0..1,y:0..1,size:12..300整数,color:#RRGGBB,fontFamily?:sans|serif,icon?:spark|play|heart|check|arrow,shape?:square|circle,resourceId?:已拥有图片ID,animation:none|fade|slide|pulse|bounce|rotate|morph,bpm:30..240整数,phaseOffsetMs?:0..3600000整数,phaseDurationMs:1..3600000整数}}；图片必须固定资源，morph仅用于形状",
    },
    { op: "setGraphic", desc: "修改现有叠层的完整设置；restart=true明确重置动画，让其覆盖当前片段，其他片段保留", payload: "{ id:现有叠层ID,graphic:完整设定同addGraphic,restart?:boolean }" },
    {
        op: "addClip",
        desc: "新增媒体/文本片段到已存在轨道",
        payload: "{ clip: { id(新唯一), kind: video|audio|image|text, trackId(必须存在), nodeId(源素材), startMs≥0, durationMs>0, title?, volume?, fadeInMs?, fadeOutMs? } }",
    },
    {
        op: "moveClip",
        desc: "移动片段（时间点/跨轨）",
        payload: "{ id, startMs≥0, trackId?(可选, 必须存在) }",
    },
    {
        op: "trimClip",
        desc: "裁剪片段（时间线位置/时长/源内起点）",
        payload: "{ id, startMs?(≥0), durationMs?(>0), sourceStartMs?(≥0，sourceStartMs + durationMs * playbackRate 不超过源时长) }",
    },
    {
        op: "splitClip",
        desc: "在片段内部切一刀成两段",
        payload: "{ id, splitAtMs(严格大于 startMs 且小于 startMs+durationMs) }",
    },
    {
        op: "setClipPlaybackRate",
        desc: "改变当前音视频片段速度，保留源裁剪范围并对齐关联字幕；其他片段位置保留",
        payload: "{ id, playbackRate: 0.25..4 }",
    },
    {
        op: "setAudioLink",
        desc: "把声音绑定到具体视频使用实例；source 随画面变速，clip 保持语速；删除 sourceClipId 则解除跟随。绑定的声音必须位于镜头内",
        payload: "{ id: 声音片段ID, sourceClipId?: 视频片段ID, mode?: source | clip }",
    },
    {
        op: "setCaptionLink",
        desc: "把普通字幕跟随具体视频或声音实例；省略 sourceClipId 解除跟随。字幕须位于来源片段内，文字稿字幕保留其版本来源",
        payload: "{ id: 字幕片段ID, sourceClipId?: 视频或声音片段ID }",
    },
    {
        op: "removeClip",
        desc: "删除片段",
        payload: "{ id }",
    },
    {
        op: "setClipProperty",
        desc: "修改片段属性（白名单）",
        payload:
            "{ id, patch: { title? | text? | volume? | fadeInMs? | fadeOutMs? | subtitleEntryIndex? | captionPresentation? }（至少一项）；字幕外观为 {version:1,fontSize:12..144,color:#RRGGBB或#RRGGBBAA,position:top|center|bottom,backgroundColor,padding:0..72,highlights?:[{start,end,sourceText,color,backgroundColor,paddingX,paddingY,radius,animation:none|pop|wipe}]}，像素按短边1080换算，范围是当前台词UTF16索引；改文字会清除当前重点",
    },
    {
        op: "addSubtitle",
        desc: "新增字幕片段",
        payload: "{ clip: { kind: subtitle, trackId(字幕轨), id/nodeId/startMs/durationMs/text } }",
    },
    {
        op: "removeSubtitle",
        desc: "删除字幕片段",
        payload: "{ id }",
    },
    {
        op: "rebuildSubtitleClips",
        desc: "按节点字幕条目重建字幕片段",
        payload: "{ nodeId, entries: [{ index≥0(唯一), startMs≥0, endMs>startMs, text }], trackId?(字幕轨) }",
    },
    {
        op: "addTrack",
        desc: "新增轨道（id/label 由系统生成，勿传）",
        payload: "{ kind: video|image|text|audio|subtitle }",
    },
    {
        op: "removeTrack",
        desc: "删除整条轨道及片段（每种轨道至少保留一条）",
        payload: "{ trackId }",
    },
    {
        op: "setTrackFlag",
        desc: "轨道开关",
        payload: "{ trackId, flag: visible|muted, value: boolean }",
    },
];

/** LLM 输出结构说明（追加到系统提示词，约束其为纯 JSON）。 */
export const AI_EDITING_OUTPUT_FORMAT = `输出要求：
- 只输出一个 JSON 对象，不要任何解释文字或 markdown。
- 结构：{ "reasoning": "一句话说明意图", "commands": [ { "op": "命令名", "payload": { ... } } ] }
- commands：能执行时 1-8 条；用户只是提问或无法用现有命令完成时为空数组 []，此时 reasoning 直接回答用户。
- payload 字段严格按命令契约；时间一律毫秒；文本用简体中文。
- 编辑已有对象时，id（clip/track/nodeId）必须来自时间线摘要；新增片段或叠层时按契约创建未使用的唯一编号。图片叠层的 resourceId 必须来自已授权素材，不能编造。`;

/** 示例（示意完整 JSON 输出，加入 system prompt）。 */
const AI_EDITING_OUTPUT_EXAMPLE = `示例：
{ "reasoning": "把第一个视频片段移到第 5 秒", "commands": [ { "op": "moveClip", "payload": { "id": "clip-a", "startMs": 5000 } } ] }`;

/** 组装 AI 编辑系统提示词：时间线摘要、可用 op 契约和输出约束必须来自同一份注册表。 */
export function buildAiEditingSystemPrompt(timelineSummary: string): string {
    const catalogLines = AI_EDITING_OP_CATALOG.map((entry) => `- ${entry.op}：${entry.desc}。payload：${entry.payload}`).join("\n");
    return [
        "你是 THQ Video 视频剪辑工作台的 AI 剪辑助手。根据用户指令对时间线输出受约束的编辑命令 JSON。",
        "时间线当前状态：",
        timelineSummary,
        "可用命令契约（与编辑器同源，非法命令会被整批拒绝）：",
        catalogLines,
        AI_EDITING_OUTPUT_FORMAT,
        AI_EDITING_OUTPUT_EXAMPLE,
        "若用户指令无法用现有命令完成（如要转场、滤镜、模板），输出 commands: [] 并在 reasoning 说明缺什么能力。",
    ].join("\n");
}
