import { useCallback, useRef, type MutableRefObject } from "react";
import { nanoid } from "nanoid";
import { App } from "antd";
import { lipSyncConfig, validateLipSyncPlan, type LipSyncPlan } from "@/lib/canvas/canvas-lip-sync";
import { canvasGenerationTaskDraft } from "@/lib/canvas/canvas-task-draft";
import { findAvailableGenerationGroupPosition } from "@/lib/canvas/canvas-generation-layout";
import { prepareBackendGenerationTask } from "@/services/api/generation-task";
import { createGenerationTask, type CreateTaskInput } from "@/services/api/task-center";
import { TaskAdmissionUnconfirmedError } from "@/services/api/task-admission";
import { isCanvasGenerationDurableAckError } from "@/services/canvas-generation-consumer";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "@/types/canvas";
import type { AiConfig } from "@/stores/use-config-store";
import type { GenerationTask } from "@/services/api/task-center";

type Props = {
    projectId: string;
    config: AiConfig;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    setNodes: (update: (current: CanvasNodeData[]) => CanvasNodeData[]) => void;
    setConnections: (update: (current: CanvasConnection[]) => CanvasConnection[]) => void;
    setSelectedNodeIds: (ids: Set<string>) => void;
    bindGenerationTask: (nodeId: string, task: GenerationTask) => void;
};
export function useCanvasLipSync({ projectId, config, nodesRef, setNodes, setConnections, setSelectedNodeIds, bindGenerationTask }: Props) {
    const { message } = App.useApp();
    const pending = useRef<{ signature: string; target: CanvasNodeData; connections: CanvasConnection[]; request?: CreateTaskInput } | null>(null);
    const busy = useRef(false);
    const submit = useCallback(
        async (plan: LipSyncPlan, model: string) => {
            if (busy.current) throw Error("正在确认原口型任务，请稍候");
            const source = nodesRef.current.find((node) => node.id === plan.sourceNodeId),
                audio = nodesRef.current.find((node) => node.id === plan.audioNodeId);
            if (!source) throw Error("原画面已移除");
            validateLipSyncPlan(plan, source, audio);
            const selected = lipSyncConfig(config, model, plan),
                signature = JSON.stringify({ plan, model });
            if (pending.current && pending.current.signature !== signature) throw Error("上次提交尚待核对，请保持原参数重试或先在任务中心确认原任务");
            if (!pending.current) {
                if (nodesRef.current.some((node) => node.metadata?.nativeLipSync?.sourceNodeId === plan.sourceNodeId && node.metadata.status === "loading" && !node.metadata.taskId)) throw Error("原口型提交正在核对，请先在任务中心恢复原请求");
                const id = nanoid(),
                    width = 320,
                    height = Math.max(120, Math.min(560, (width * (source.metadata?.naturalHeight || source.height)) / (source.metadata?.naturalWidth || source.width)));
                const target: CanvasNodeData = {
                    id,
                    type: CanvasNodeType.Video,
                    title: `口型片段 · ${source.title || "人物"}`,
                    width,
                    height,
                    position: findAvailableGenerationGroupPosition(nodesRef.current, { x: source.position.x + source.width + 96, y: source.position.y }, { width, height }),
                    metadata: {
                        status: "loading",
                        generationMode: "video",
                        model,
                        seconds: selected.videoSeconds,
                        size: "original",
                        vquality: "original",
                        generateAudio: "true",
                        watermark: "false",
                        prompt: "按所选对白制作口型片段",
                        videoEditOperation: "lip_sync",
                        nativeLipSync: structuredClone(plan),
                    },
                };
                const connections = [source.id, audio!.id].map((fromNodeId) => ({ id: nanoid(), fromNodeId, toNodeId: id }));
                pending.current = { signature, target, connections };
                setNodes((current) => [...current, target]);
                setConnections((current) => [...current, ...connections]);
                setSelectedNodeIds(new Set([id]));
            }
            busy.current = true;
            const own = pending.current;
            const ref = { id: source.id, name: source.title || "原画面", type: source.metadata?.mimeType || (source.type === CanvasNodeType.Image ? "image/png" : "video/mp4"), storageKey: source.metadata?.storageKey, bytes: source.metadata?.bytes };
            try {
                own.request ??= await prepareBackendGenerationTask({
                    projectId,
                    mode: "video",
                    prompt: "按所选对白制作口型片段",
                    config: selected,
                    clientOperationId: `lip-sync:${own.target.id}`,
                    ...(source.type === CanvasNodeType.Image ? { referenceImages: [{ ...ref, dataUrl: source.metadata?.content || "" }] } : { referenceVideos: [{ ...ref, url: source.metadata?.content || "" }] }),
                    referenceAudios: [
                        {
                            id: audio!.id,
                            name: audio!.title || "对白",
                            type: audio!.metadata?.mimeType || "audio/wav",
                            url: audio!.metadata?.content || "",
                            storageKey: audio!.metadata?.storageKey,
                            bytes: audio!.metadata?.bytes,
                            durationMs: audio!.metadata?.durationMs,
                        },
                    ],
                    metadata: { nodeId: own.target.id, sourceNodeId: source.id, videoEditOperation: "lip_sync", nativeLipSync: structuredClone(plan), canvasTaskDraft: canvasGenerationTaskDraft(own.target, own.connections) },
                });
                const task = await createGenerationTask(own.request);
                bindGenerationTask(own.target.id, task);
                pending.current = null;
                message.success("口型任务已开始，可关闭页面，完成后查看新视频候选");
                return task;
            } catch (error) {
                if (!isCanvasGenerationDurableAckError(error) && !(error instanceof TaskAdmissionUnconfirmedError)) {
                    pending.current = null;
                    setNodes((current) => current.map((node) => (node.id === own.target.id ? { ...node, metadata: { ...node.metadata, status: "error", errorDetails: error instanceof Error ? error.message : "口型任务未能启动" } } : node)));
                }
                throw error;
            } finally {
                busy.current = false;
            }
        },
        [bindGenerationTask, config, message, nodesRef, projectId, setConnections, setNodes, setSelectedNodeIds],
    );
    return { submit };
}
