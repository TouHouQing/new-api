import { CanvasNodeAnnotationDialog, type CanvasImageAnnotationPayload } from "@/components/canvas/canvas-node-annotation-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeRegionEditDialog, type CanvasImageRegionEditPayload } from "@/components/canvas/canvas-node-region-edit-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import { CanvasNodeImageEditDialog, type CanvasImageEditPayload } from "@/components/canvas/canvas-node-image-edit-dialog";
import { CanvasNodeLayerDecompositionDialog, type CanvasImageLayerDecompositionPayload } from "@/components/canvas/canvas-node-layer-decomposition-dialog";
import { CanvasNodeTextEditDialog, type CanvasImageTextEditPayload } from "@/components/canvas/canvas-node-text-edit-dialog";
import type { CanvasNodeData } from "@/types/canvas";
import type { AiConfig } from "@/stores/use-config-store";
import type { ImageLayerPlan, ImageLayerPlanningOptions } from "@/lib/canvas/canvas-image-layer-plan";
import { readImageLayerPlanningDraft, type ImageLayerPlanningDraft } from "@/lib/canvas/image-layer-planning-draft";

type CanvasProjectMediaDialogsProps = {
    cropNode: CanvasNodeData | null;
    splitNode: CanvasNodeData | null;
    annotationNode: CanvasNodeData | null;
    annotationEditNode: CanvasNodeData | null;
    maskEditNode: CanvasNodeData | null;
    onCloseMaskEdit: () => void;
    regionEditNode: CanvasNodeData | null;
    imageEditNode: CanvasNodeData | null;
    layerDecompositionNode: CanvasNodeData | null;
    textEditNode: CanvasNodeData | null;
    imageEditPreset?: "remove-background" | null;
    upscaleNode: CanvasNodeData | null;
    onCloseCrop: () => void;
    onCloseSplit: () => void;
    onCloseAnnotation: () => void;
    onCloseAnnotationEdit: () => void;
    onCloseRegionEdit: () => void;
    onCloseUpscale: () => void;
    onCloseImageEdit: () => void;
    onCloseLayerDecomposition: () => void;
    onCloseTextEdit: () => void;
    onCrop: (node: CanvasNodeData, crop: CanvasImageCropRect) => Promise<void>;
    onSplit: (node: CanvasNodeData, params: CanvasImageSplitParams) => Promise<void>;
    onAnnotate: (node: CanvasNodeData, dataUrl: string) => void;
    onAnnotationEdit: (node: CanvasNodeData, payload: CanvasImageAnnotationPayload) => void;
    onMaskEdit: (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => Promise<void>;
    onUpscale: (node: CanvasNodeData, params: CanvasImageUpscaleParams) => Promise<void>;
    onRegionEdit: (node: CanvasNodeData, payload: CanvasImageRegionEditPayload) => void;
    onImageOperation: (node: CanvasNodeData, payload: CanvasImageEditPayload) => void;
    onLayerDecomposition: (node: CanvasNodeData, payload: CanvasImageLayerDecompositionPayload) => Promise<void>;
    onLayerPlanning: (node: CanvasNodeData, model: string, prompt: string, signal: AbortSignal, options?: ImageLayerPlanningOptions) => Promise<ImageLayerPlan>;
    onLayerPlanningDraftChange: (node: CanvasNodeData, draft: ImageLayerPlanningDraft | undefined) => void;
    onLayerPlanningDraftFlush: () => Promise<void>;
    onDetectText: () => Promise<import("@/components/canvas/canvas-node-text-edit-dialog").CanvasImageTextLine[]>;
    onTextEdit: (node: CanvasNodeData, payload: CanvasImageTextEditPayload) => void;
    config: AiConfig;
};

export function CanvasProjectMediaDialogs({
    cropNode,
    splitNode,
    annotationNode,
    annotationEditNode,
    maskEditNode,
    onMaskEdit,
    onCloseMaskEdit,
    regionEditNode,
    imageEditNode,
    layerDecompositionNode,
    textEditNode,
    imageEditPreset,
    upscaleNode,
    onCloseCrop,
    onCloseSplit,
    onCloseAnnotation,
    onCloseAnnotationEdit,
    onCloseRegionEdit,
    onCloseUpscale,
    onCloseImageEdit,
    onCloseLayerDecomposition,
    onCloseTextEdit,
    onCrop,
    onSplit,
    onAnnotate,
    onAnnotationEdit,
    onRegionEdit,
    onUpscale,
    onImageOperation,
    onLayerDecomposition,
    onLayerPlanning,
    onLayerPlanningDraftChange,
    onLayerPlanningDraftFlush,
    onDetectText,
    onTextEdit,
    config,
}: CanvasProjectMediaDialogsProps) {
    return (
        <>
            {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open onClose={onCloseCrop} onConfirm={(crop) => onCrop(cropNode, crop)} /> : null}
            {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open onClose={onCloseSplit} onConfirm={(params) => onSplit(splitNode, params)} /> : null}
            {annotationNode?.metadata?.content ? (
                <CanvasNodeAnnotationDialog
                    image={{ url: annotationNode.metadata.content, storageKey: annotationNode.metadata.storageKey }}
                    open
                    onClose={onCloseAnnotation}
                    onConfirm={(dataUrl) => {
                        if (typeof dataUrl === "string") onAnnotate(annotationNode, dataUrl);
                    }}
                />
            ) : null}
            {annotationEditNode?.metadata?.content ? (
                <CanvasNodeAnnotationDialog
                    image={{ url: annotationEditNode.metadata.content, storageKey: annotationEditNode.metadata.storageKey }}
                    editMode
                    open
                    onClose={onCloseAnnotationEdit}
                    onConfirm={(payload) => {
                        if (typeof payload !== "string") onAnnotationEdit(annotationEditNode, payload);
                    }}
                />
            ) : null}
            {maskEditNode?.metadata?.content ? (
                <CanvasNodeMaskEditDialog
                    dataUrl={maskEditNode.metadata.content}
                    sourceStorageKey={maskEditNode.metadata.storageKey}
                    initialDocument={maskEditNode.metadata.imageMaskDocument}
                    config={{
                        ...config,
                        model: maskEditNode.metadata.model || config.model,
                        imageModel: maskEditNode.metadata.model || config.imageModel,
                        size: maskEditNode.metadata.size || config.size,
                        quality: maskEditNode.metadata.quality || config.quality,
                        count: String(maskEditNode.metadata.count || config.count),
                    }}
                    open
                    onClose={onCloseMaskEdit}
                    onConfirm={(payload) => onMaskEdit(maskEditNode, payload)}
                />
            ) : null}
            {regionEditNode?.metadata?.content ? (
                <CanvasNodeRegionEditDialog
                    image={{ url: regionEditNode.metadata.content, storageKey: regionEditNode.metadata.storageKey }}
                    config={{
                        ...config,
                        model: regionEditNode.metadata.model || config.model,
                        imageModel: regionEditNode.metadata.model || config.imageModel,
                        size: regionEditNode.metadata.size || config.size,
                        quality: regionEditNode.metadata.quality || config.quality,
                        count: String(regionEditNode.metadata.count || config.count),
                    }}
                    open
                    onClose={onCloseRegionEdit}
                    onConfirm={(payload) => onRegionEdit(regionEditNode, payload)}
                />
            ) : null}
            {upscaleNode?.metadata?.content ? <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open onClose={onCloseUpscale} onConfirm={(params) => onUpscale(upscaleNode, params)} /> : null}
            {imageEditNode?.metadata?.content ? (
                <CanvasNodeImageEditDialog
                    dataUrl={imageEditNode.metadata.content}
                    preset={imageEditPreset}
                    config={{
                        ...config,
                        model: imageEditNode.metadata.model || config.model,
                        imageModel: imageEditNode.metadata.model || config.imageModel,
                        size: imageEditNode.metadata.size || config.size,
                        quality: imageEditNode.metadata.quality || config.quality,
                    }}
                    open
                    onClose={onCloseImageEdit}
                    onConfirm={(payload) => onImageOperation(imageEditNode, payload)}
                />
            ) : null}
            {layerDecompositionNode?.metadata?.content ? (
                <CanvasNodeLayerDecompositionDialog
                    dataUrl={layerDecompositionNode.metadata.content}
                    savedDraft={readImageLayerPlanningDraft(layerDecompositionNode)}
                    onDraftChange={(draft) => onLayerPlanningDraftChange(layerDecompositionNode, draft)}
                    onDraftFlush={onLayerPlanningDraftFlush}
                    sourceSize={layerDecompositionNode.metadata.naturalWidth && layerDecompositionNode.metadata.naturalHeight ? { width: layerDecompositionNode.metadata.naturalWidth, height: layerDecompositionNode.metadata.naturalHeight } : undefined}
                    config={{
                        ...config,
                        model: layerDecompositionNode.metadata.model || config.model,
                        imageModel: layerDecompositionNode.metadata.model || config.imageModel,
                        size: layerDecompositionNode.metadata.size || config.size,
                        quality: layerDecompositionNode.metadata.quality || config.quality,
                    }}
                    open
                    onPlan={(model, prompt, signal, options) => onLayerPlanning(layerDecompositionNode, model, prompt, signal, options)}
                    onClose={onCloseLayerDecomposition}
                    onConfirm={(payload) => onLayerDecomposition(layerDecompositionNode, payload)}
                />
            ) : null}
            {textEditNode?.metadata?.content ? <CanvasNodeTextEditDialog dataUrl={textEditNode.metadata.content} open onClose={onCloseTextEdit} onDetect={onDetectText} onConfirm={(payload) => onTextEdit(textEditNode, payload)} /> : null}
        </>
    );
}
