import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasNodeData } from "@/types/canvas";
import { saveNativeImageLayerMaterials } from "@/services/canvas-native-image-materials";

export function useCanvasImageLayerMaterials({ projectId, enabled, nodes, nodesRef, onReady }: { projectId: string; enabled: boolean; nodes: CanvasNodeData[]; nodesRef: { current: CanvasNodeData[] }; onReady: (ids: string[]) => void }) {
    const jobs = useRef(new Map<string, AbortController>()),
        failures = useRef(new Set<string>());
    const [feedback, setFeedback] = useState<Record<string, { loading: boolean; error?: string }>>({});
    useEffect(() => {
        failures.current.clear();
        setFeedback({});
        return () => {
            for (const job of jobs.current.values()) job.abort();
            jobs.current.clear();
        };
    }, [projectId]);
    const extract = useCallback(
        async (root: CanvasNodeData, observeOnly = false, quiet = false) => {
            if (!enabled || jobs.current.has(root.id)) return;
            const controller = new AbortController();
            jobs.current.set(root.id, controller);
            setFeedback((current) => ({ ...current, [root.id]: { loading: true } }));
            try {
                const ids = await saveNativeImageLayerMaterials(projectId, root, controller.signal, observeOnly);
                if (!controller.signal.aborted) setFeedback((current) => ({ ...current, [root.id]: { loading: false } }));
                if (!controller.signal.aborted && !observeOnly && !quiet) onReady(ids);
            } catch (error) {
                if (controller.signal.aborted) return;
                failures.current.add(`${root.id}:${root.metadata?.imageLayerMaterials?.taskId || "auto"}`);
                // Transport/UI feedback must never overwrite the durable server
                // marker. The worker may have completed after this browser lost
                // its reply or while a local canvas rebase is still pending.
                setFeedback((current) => ({ ...current, [root.id]: { loading: false, error: error instanceof Error ? error.message : "独立素材另存未完成，请稍后重试" } }));
            } finally {
                if (jobs.current.get(root.id) === controller) jobs.current.delete(root.id);
            }
        },
        [enabled, onReady, projectId],
    );
    useEffect(() => {
        if (!enabled) return;
        for (const node of nodes) {
            const material = node.metadata?.imageLayerMaterials;
            if (!material || failures.current.has(`${node.id}:${material.taskId || "auto"}`)) continue;
            if (material.status === "loading" && material.taskId) void extract(node, true);
            else if (
                material.auto &&
                !material.status &&
                node.metadata?.imageLayerGroup?.compositeStatus === "ready" &&
                node.metadata.status !== "loading" &&
                node.metadata.imageLayerGroup.layers.some((layer) => nodesRef.current.some((child) => child.id === layer.nodeId && child.metadata?.imageLayer?.kind === "transparent"))
            )
                void extract(node, false, true);
        }
    }, [enabled, extract, nodes, nodesRef]);
    const extractLayerMaterials = useCallback((node: CanvasNodeData) => extract(node), [extract]);
    return { extractLayerMaterials, imageLayerMaterialFeedback: feedback };
}
