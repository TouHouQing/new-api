import { useRef, useState } from "react";
import { Radio, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { MAX_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "@/lib/canvas/image-operation-plan";
import { useImageToolSource } from "./use-image-tool-source";

export type CanvasImageUpscaleParams = ImageUpscaleParams;
type UpscaleDialogProps = { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageUpscaleParams) => void | Promise<void> };
const pixelTargets = [512, 1024, 2048, MAX_UPSCALE_LONG_EDGE];

export function CanvasNodeUpscaleDialog(props: UpscaleDialogProps) {
    return props.open && props.dataUrl ? <ResizeEditor key={props.dataUrl} {...props} /> : null;
}

function ResizeEditor({ dataUrl, onClose, onConfirm }: UpscaleDialogProps) {
    const saving = useRef(false);
    const [busy, setBusy] = useState(false);
    const { size, error } = useImageToolSource(dataUrl);
    const [chosen, setChosen] = useState<number | null>(null);
    const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
    const edge = size ? Math.max(size.width, size.height) : 0;
    const target = chosen ?? pixelTargets.find((pixels) => pixels > edge) ?? MAX_UPSCALE_LONG_EDGE;
    const output = size ? resolveUpscaleSize(size.width, size.height, target) : null;
    const ready = Boolean(size && target !== edge);
    return (
        <AppModal
            open
            centered
            title="调整图片尺寸"
            width={760}
            onCancel={() => {
                if (!busy) onClose();
            }}
            okText="保存调整图"
            confirmLoading={busy}
            okButtonProps={{ disabled: !ready || busy }}
            cancelButtonProps={{ disabled: busy }}
            closable={!busy}
            keyboard={!busy}
            mask={{ closable: !busy }}
            onOk={async () => {
                if (!ready || saving.current) return;
                saving.current = true;
                setBusy(true);
                try {
                    await onConfirm({ targetLongEdge: target, algorithm });
                } finally {
                    saving.current = false;
                    setBusy(false);
                }
            }}
        >
            <p className="mb-4 text-sm text-muted-foreground">按比例缩小或插值放大，另存为新图片并保留原图。放大不会生成新的真实细节。</p>
            <div className="grid gap-5 md:grid-cols-2">
                <figure className="m-0 flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-active p-3">
                    <img alt="待调整尺寸的图片" src={dataUrl} draggable={false} className="max-h-[320px] max-w-full object-contain" />
                    <figcaption className="text-sm text-muted-foreground">{size ? `原图 ${size.width} × ${size.height} px` : error || "正在读取图片…"}</figcaption>
                </figure>
                <div className="flex flex-col gap-5">
                    <label className="flex flex-col gap-2 text-sm">
                        目标长边
                        <Select aria-label="目标长边" disabled={busy} value={target} onChange={setChosen} options={pixelTargets.map((pixels) => ({ value: pixels, label: `${pixels} px`, disabled: pixels === edge }))} />
                    </label>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm">插值方式</legend>
                        <Radio.Group value={algorithm} disabled={busy} onChange={(event) => setAlgorithm(event.target.value)} className="flex flex-col gap-2">
                            <Radio value="high">高质量 · 照片与细节图</Radio>
                            <Radio value="bilinear">双线性 · 平滑快速</Radio>
                            <Radio value="nearest">最近邻 · 像素图</Radio>
                        </Radio.Group>
                    </fieldset>
                    <output className="text-sm">{output ? `输出 ${output.width} × ${output.height} px` : "等待读取尺寸"}</output>
                    {error || (size && !ready) ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error || "请选择与原图不同的目标尺寸"}
                        </p>
                    ) : null}
                </div>
            </div>
        </AppModal>
    );
}
