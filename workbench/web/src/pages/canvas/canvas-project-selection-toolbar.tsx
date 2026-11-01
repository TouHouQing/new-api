import type { RefObject } from "react";
import { Layers3 } from "lucide-react";

import { CanvasSelectionToolbar } from "@/components/canvas/canvas-workspace-overlays";
import { FloatingDock } from "@/components/ui/aceternity/floating-dock";
import { canvasThemes } from "@/lib/canvas-theme";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import { defaultToolbarPrefs, readToolbarPrefs, resolveToolbarEntries, type ToolContext, type ToolbarHandlers } from "@/lib/canvas/tool-registry";
import type { CanvasAlignmentMode } from "@/lib/canvas/canvas-layout";
import { useCanvasThemeStore } from "@/stores/canvas/use-canvas-theme-store";

type CanvasProjectSelectionToolbarProps = {
    anchorRef: RefObject<HTMLDivElement | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    count: number;
    selectedVideoCount: number;
    selectedImageCount: number;
    groupingImages: boolean;
    onCreateImageLayerGroup: () => void;
    mergingVideos: boolean;
    onAlign: (mode: CanvasAlignmentMode) => void;
    onArrange: (mode: "row" | "column" | "grid" | "flow") => void;
    onCreateStoryboard: () => void;
    onCreateReferenceGroup: () => void;
    onBatchConnect: () => void;
    onMergeVideos: () => void;
    onSendSelectionToAgent: () => void;
};

export function CanvasProjectSelectionToolbar({ anchorRef, containerRef, count, selectedVideoCount, selectedImageCount, groupingImages, onCreateImageLayerGroup, mergingVideos, onAlign, onArrange, onCreateStoryboard, onCreateReferenceGroup, onBatchConnect, onMergeVideos, onSendSelectionToAgent }: CanvasProjectSelectionToolbarProps) {
    const theme = canvasThemes[useCanvasThemeStore((state) => state.theme)];

    const handlers = {
        onAlign, onArrange, onCreateStoryboard, onCreateReferenceGroup, onBatchConnect, onMergeVideos, onSendSelectionToAgent,
    } as Partial<ToolbarHandlers> as ToolbarHandlers;

    const ctx: ToolContext = {
        selectedCount: count,
        selectedNodeTypes: new Set(),
        selectedVideoCount,
        canvasTool: "move",
        workspaceMode: "professional",
        isProjectLinked: false,
        canUndo: false,
        canRedo: false,
        extractingVideoFrames: false,
        extractingAudio: false,
        trimmingVideo: false,
        mergingVideos,
        addPanelOpen: false,
        appearancePanelOpen: false,
        settingsPanelOpen: false,
        handlers,
    };

    const prefs = readToolbarPrefs("selection") ?? defaultToolbarPrefs("selection");
    const items = resolveToolbarEntries("selection", ctx, prefs);
    if (selectedImageCount === count && count > 0 && count <= 32) items.push({ id: "create-image-layer-group", label: groupingImages ? "正在创建图层组" : "合成图层组（免费）", icon: <Layers3 className="size-4" />, onClick: onCreateImageLayerGroup, disabled: groupingImages });

    return (
        <CanvasSelectionToolbar anchorRef={anchorRef} containerRef={containerRef} count={count}>
            <FloatingDock items={items} size="compact" className="canvas-floating-dock" style={canvasDockStyle(theme)} ariaLabel="多选节点布局工具" />
        </CanvasSelectionToolbar>
    );
}
