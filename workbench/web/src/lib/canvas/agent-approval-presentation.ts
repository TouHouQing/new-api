import type { AgentApprovalPreview, AgentApprovalPreviewItem, AgentApprovalPreviewOperation } from "@/services/api/agent";

type RecordValue = Record<string, unknown>;

export type AgentApprovalPresentation = AgentApprovalPreview & { source: "server" | "fallback"; productionArguments?: RecordValue };

function record(value: unknown): RecordValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function text(value: unknown, max = 240): string {
    if (typeof value !== "string") return "";
    const compact = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
    return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function approvalArguments(value: unknown): RecordValue | null {
    if (typeof value !== "string") return record(value);
    try {
        return record(JSON.parse(value));
    } catch {
        return null;
    }
}

function shortReference(value: unknown): string {
    const id = text(value, 80);
    if (!id) return "未知目标";
    return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function nodeTypeLabel(value: unknown): string {
    const type = text(value, 32).toLowerCase();
    return ({ text: "文本", markdown: "Markdown", image: "图片", video: "视频", audio: "音频", frame: "画框", script: "脚本", character: "角色卡" } as Record<string, string>)[type] || (type ? "节点" : "");
}

function fieldLabel(key: string, nodeType: string): string {
    if (key === "title") return "节点名称";
    if (key === "content") return ["image", "video", "audio"].includes(nodeType.toLowerCase()) ? "下一版提示词" : "正文";
    return key === "composerContent" ? "下一版提示词" : "已配置字段";
}

function operation(value: unknown): AgentApprovalPreviewOperation | null {
    if (value === "production_action") return value;
    return value === "add_node" ||
        value === "update_node" ||
        value === "connect_nodes" ||
        value === "arrange_nodes" ||
        value === "generate_media" ||
        value === "create_storyboard" ||
        value === "edit_storyboard" ||
        value === "create_character" ||
        value === "adopt_drama_media" ||
        value === "plan_step" ||
        value === "split" ||
        value === "crop" ||
        value === "resize"
        ? value
        : null;
}

function normalizeServerPreview(value: unknown): AgentApprovalPresentation | null {
    const source = record(value);
    if (!source || !Array.isArray(source.items)) return null;
    const rawItems = source.items;
    const items: AgentApprovalPreviewItem[] = [];
    for (const raw of rawItems) {
        const item = record(raw);
        const op = operation(item?.operation);
        const summary = text(item?.summary);
        if (!item || !op || !summary) continue;
        items.push({
            operation: op,
            nodeId: text(item.nodeId, 120) || undefined,
            nodeTitle: text(item.nodeTitle, 120) || undefined,
            resultTitle: text(item.resultTitle, 120) || undefined,
            nodeType: text(item.nodeType, 32) || undefined,
            nodeTypeLabel: text(item.nodeTypeLabel, 48) || undefined,
            targetNodeId: text(item.targetNodeId, 120) || undefined,
            targetNodeTitle: text(item.targetNodeTitle, 120) || undefined,
            targetNodeType: text(item.targetNodeType, 32) || undefined,
            fields: Array.isArray(item.fields)
                ? item.fields
                      .map((field) => text(field, 64))
                      .filter(Boolean)
                      .slice(0, 12)
                : undefined,
            details: Array.isArray(item.details)
                ? item.details
                      .map((detail) => text(detail, 180))
                      .filter(Boolean)
                      .slice(0, 12)
                : undefined,
            summary,
        });
    }
    const title = text(source.title, 120);
    const description = text(source.description, 500);
    if (!title || !description || !items.length) return null;
    return { kind: text(source.kind, 64) || "agent_approval", title, description, items, source: "server" };
}

function canvasFallback(args: RecordValue | null): AgentApprovalPresentation {
    const rawOps = Array.isArray(args?.ops) ? args.ops : [];
    const items: AgentApprovalPreviewItem[] = [];
    for (const raw of rawOps) {
        const op = record(raw);
        const kind = operation(op?.type);
        if (!op || !kind || kind === "generate_media") continue;
        const type = text(op.nodeType, 32).toLowerCase();
        const label = nodeTypeLabel(type);
        if (kind === "add_node") {
            const title = text(op.title, 120) || `未命名${label || "节点"}`;
            items.push({
                operation: kind,
                nodeTitle: title,
                nodeType: type || undefined,
                nodeTypeLabel: label || undefined,
                fields: ["节点名称", label === "文本" || label === "Markdown" ? "正文" : "初始内容"],
                summary: `新增${label || "节点"}《${title}》`,
            });
            continue;
        }
        if (kind === "update_node") {
            const patch = record(op.patch);
            const id = shortReference(op.id);
            const fields = patch
                ? Object.keys(patch)
                      .map((key) => fieldLabel(key, type))
                      .filter(Boolean)
                : [];
            const resultTitle = text(patch?.title, 120);
            const target = `目标节点（引用 ${id}）`;
            items.push({
                operation: kind,
                nodeTitle: target,
                nodeType: type || undefined,
                nodeTypeLabel: label || undefined,
                resultTitle: resultTitle || undefined,
                fields: fields.length ? [...new Set(fields)] : ["已配置字段"],
                summary: `修改${label || "节点"}《${target}》的${fields.length ? [...new Set(fields)].join("、") : "已配置字段"}${resultTitle ? `，名称改为《${resultTitle}》` : ""}`,
            });
            continue;
        }
        const from = shortReference(op.fromNodeId);
        const to = shortReference(op.toNodeId);
        items.push({ operation: kind, nodeTitle: `来源（引用 ${from}）`, targetNodeTitle: `目标（引用 ${to}）`, summary: `建立来源（引用 ${from}）→目标（引用 ${to}）的引用连线` });
    }
    const counts = items.reduce<Record<string, number>>((out, item) => {
        out[item.operation] = (out[item.operation] || 0) + 1;
        return out;
    }, {});
    const parts = [counts.add_node ? `新增 ${counts.add_node} 个节点` : "", counts.update_node ? `修改 ${counts.update_node} 个节点` : "", counts.connect_nodes ? `建立 ${counts.connect_nodes} 条引用连线` : ""].filter(Boolean);
    return {
        source: "fallback",
        kind: "canvas_mutation",
        title: "确认画布修改",
        description: parts.length ? `Agent 准备${parts.join("，")}。历史审批缺少画布快照，以下目标使用安全引用标识；无法确认具体目标时不会代替当前画布。` : "审批参数不完整，无法确认具体修改目标，请重新读取画布后再申请审批。",
        items,
    };
}

function mediaFallback(args: RecordValue | null, payload: RecordValue | null): AgentApprovalPresentation {
    const mode = text(args?.mode, 32).toLowerCase();
    const type = mode === "video" ? "视频" : mode === "image" ? "图片" : mode === "audio" ? "音频" : "媒体";
    const references = Array.isArray(args?.referenceNodeIds) ? args.referenceNodeIds.filter((id) => typeof id === "string") : [];
    const title = text(args?.title, 120) || `未命名${type}`;
    const details = [
        text(payload?.modelName) ? `模型：${text(payload?.modelName)}` : text(args?.channelModelKey) || text(args?.logicalModelId) ? `模型：${text(args?.channelModelKey) || text(args?.logicalModelId)}` : "",
        references.length ? `引用 ${references.length} 个画布资产，并建立连线` : "不引用画布媒体资产",
        typeof args?.durationSeconds === "number" && args.durationSeconds > 0 ? `时长：${args.durationSeconds} 秒` : "",
        text(args?.size) ? `画幅：${text(args?.size, 40)}` : "",
        text(args?.quality) ? `质量：${text(args?.quality, 40)}` : "",
        typeof args?.videoGenerateAudio === "boolean" ? `音频：${args.videoGenerateAudio ? "开启" : "关闭"}` : "",
    ].filter(Boolean);
    return {
        source: "fallback",
        kind: "media_generation",
        title: `确认生成${type}`,
        description: `${type}草稿节点和引用连线已创建，尚未提交生成。确认规格后批准才会提交收费任务；拒绝则保留草稿，结果自动回写画布。`,
        items: [{ operation: "generate_media", nodeTitle: title, nodeType: mode || undefined, nodeTypeLabel: type, details, summary: `生成${type}《${title}》` }],
    };
}

export function agentApprovalPresentation(detail: unknown): AgentApprovalPresentation {
    const payload = record(detail);
    const call = record(payload?.call);
    const fn = record(call?.function);
    const name = text(fn?.name) || text(payload?.toolName);
    const args = approvalArguments(fn?.arguments ?? payload?.arguments);
    const rawPreview = record(payload?.preview);
    if (name === "production_edit" && rawPreview?.kind === "production" && text(rawPreview.title) && text(rawPreview.description) && typeof args?.action === "string" && record(args.arguments)) {
        const values = record(args.arguments)!,
            request = record(values.request);
        const action = args.action,
            group = action.split(".")[0];
        const subject =
            (
                {
                    project: "项目",
                    unit: "章节",
                    units: "章节",
                    shot: "镜头",
                    shot_plan: "分镜方案",
                    assets: "项目素材",
                    timeline: "剪辑",
                    cut: "成片版本",
                    transcript: "文字稿",
                    analysis: "素材分析",
                    review: "审片",
                    video_rework: "视频返工",
                    workflow: "制作步骤",
                } as Record<string, string>
            )[group] || "项目制作";
        const verb = action.endsWith(".create") ? "新建" : action.endsWith(".update") ? "修改" : "执行";
        const target = text(request?.title || request?.name, 120);
        const source = text(request?.sourceText, 12000)
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const id = text(values.unitId || values.shotId || values.cutId || values.reviewId || values.id, 120);
        const summary = `${verb}${subject}${target ? `《${target}》` : ""}`;
        const details = [
            target ? `名称：${target}` : "",
            source ? `正文：${text(source, 180)}` : "",
            id ? `目标引用：${shortReference(id)}` : "",
            text(request?.expectedUpdatedAt) ? `依据章节版本：${text(request?.expectedUpdatedAt, 64)}` : "",
            typeof request?.expectedRevision === "number" ? `依据版本：${request.expectedRevision}` : "",
        ].filter(Boolean);
        if (typeof request?.status === "string") details.push(`状态：${({ approved: "通过审片", changes_requested: "需要修改", draft: "草稿", ready: "待制作", completed: "已完成" } as Record<string, string>)[request.status] || text(request.status, 64)}`);
        return { source: "server", kind: "production", title: `确认${subject}操作`, description: text(rawPreview.description, 500), items: [{ operation: "production_action", summary, nodeTitle: target || subject, details }], productionArguments: values };
    }
    const serverPreview = normalizeServerPreview(payload?.preview);
    if (serverPreview) return serverPreview;
    if (name === "canvas_apply_ops") return canvasFallback(args);
    if (name === "generate_media") return mediaFallback(args, payload);
    return { source: "fallback", kind: "agent_approval", title: "确认执行操作", description: "Agent 请求执行一项操作，但审批参数无法识别；请重新读取画布后再申请审批。", items: [] };
}
