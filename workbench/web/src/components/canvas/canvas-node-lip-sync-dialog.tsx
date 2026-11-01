import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Alert, Button, Checkbox, InputNumber, Radio, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { readLipSyncDraft, validateLipSyncPlan, type LipSyncPlan, type LipSyncRegion } from "@/lib/canvas/canvas-lip-sync";

type Props = {
    source: CanvasNodeData;
    nodes: readonly CanvasNodeData[];
    models: Array<{ value: string; label: string }>;
    onSaveDraft: (plan: LipSyncPlan) => void;
    onFlush: () => Promise<void>;
    onClose: () => void;
    onConfirm: (plan: LipSyncPlan, model: string) => Promise<unknown>;
};
export function CanvasNodeLipSyncDialog({ source, nodes, models, onSaveDraft, onFlush, onClose, onConfirm }: Props) {
    const saved = useRef(readLipSyncDraft(source)),
        audios = nodes.filter((node) => node.type === CanvasNodeType.Audio && node.metadata?.content && node.metadata.storageKey?.startsWith("resource:"));
    const initialAudio = audios.find((n) => n.id === saved.current?.audioNodeId && n.metadata?.storageKey === saved.current.audioStorageKey) || audios[0];
    const [audioId, setAudioId] = useState(initialAudio?.id || ""),
        [model, setModel] = useState(models[0]?.value || ""),
        [error, setError] = useState(""),
        [working, setWorking] = useState(false);
    const [start, setStart] = useState((saved.current?.selection.startMs || 0) / 1000),
        [end, setEnd] = useState((saved.current?.selection.endMs || Math.min(3000, initialAudio?.metadata?.durationMs || 3000, source.type === CanvasNodeType.Video ? source.metadata?.durationMs || 3000 : 3000)) / 1000),
        [audioStart, setAudioStart] = useState((saved.current?.selection.audioStartMs || 0) / 1000);
    const [region, setRegion] = useState<LipSyncRegion | undefined>(saved.current?.selection.region),
        [manual, setManual] = useState(Boolean(saved.current?.selection.region));
    const [rights, setRights] = useState(Boolean(initialAudio && saved.current?.rightsConfirmedFor[0] === source.metadata?.storageKey && saved.current?.rightsConfirmedFor[1] === initialAudio.metadata?.storageKey));
    const [natural, setNatural] = useState({ width: source.metadata?.naturalWidth || 0, height: source.metadata?.naturalHeight || 0 });
    const [previewTime, setPreviewTime] = useState(start),
        videoRef = useRef<HTMLVideoElement>(null),
        drag = useRef<{ x: number; y: number } | null>(null),
        dirty = useRef(false),
        latest = useRef<LipSyncPlan | null>(null);
    const audio = audios.find((node) => node.id === audioId),
        photo = source.type === CanvasNodeType.Image;
    const makePlan = (): LipSyncPlan => ({
        version: 1,
        sourceNodeId: source.id,
        audioNodeId: audioId,
        sourceStorageKey: source.metadata?.storageKey || "",
        audioStorageKey: audio?.metadata?.storageKey || "",
        sourceKind: photo ? "image" : "video",
        selection: { version: 1, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), audioStartMs: Math.round(audioStart * 1000), ...(manual && region ? { region } : {}) },
        rightsConfirmedFor: rights && audio ? [source.metadata?.storageKey || "", audio.metadata?.storageKey || ""] : [],
    });
    const plan = makePlan();
    latest.current = plan;
    const change = (callback: () => void) => {
        dirty.current = true;
        setError("");
        callback();
    };
    useEffect(() => {
        if (!dirty.current) return;
        const timer = setTimeout(() => {
            if (latest.current) onSaveDraft(latest.current);
        }, 300);
        return () => clearTimeout(timer);
    }, [start, end, audioStart, audioId, rights, manual, region, onSaveDraft]);
    const save = async () => {
        if (latest.current) onSaveDraft(latest.current);
        await onFlush();
        dirty.current = false;
    };
    const close = async () => {
        setWorking(true);
        setError("");
        try {
            await save();
            onClose();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "设置未能保存，请稍后重试");
        } finally {
            setWorking(false);
        }
    };
    const point = (event: PointerEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        return { x: Math.max(0, Math.min(natural.width, Math.round(((event.clientX - bounds.left) / bounds.width) * natural.width))), y: Math.max(0, Math.min(natural.height, Math.round(((event.clientY - bounds.top) / bounds.height) * natural.height))) };
    };
    const draw = (event: PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const p = point(event),
            a = drag.current;
        change(() => setRegion({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y) }));
    };
    const actualModel = models.some((item) => item.value === model) ? model : models[0]?.value || "";
    return (
        <AppModal
            open
            title={photo ? "让照片开口说话" : "制作口型片段"}
            width={920}
            onCancel={() => {
                if (!working) void close();
            }}
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button disabled={working} onClick={() => void close()}>
                        保存设置并关闭
                    </Button>
                    <Button
                        type="primary"
                        loading={working}
                        disabled={!actualModel || !audio || !rights || (manual && (!region || region.width < 48 || region.height < 48))}
                        onClick={async () => {
                            setWorking(true);
                            setError("");
                            try {
                                validateLipSyncPlan(plan, source, audio);
                                await save();
                                await onConfirm(plan, actualModel);
                                onClose();
                            } catch (failure) {
                                setError(failure instanceof Error ? failure.message : "口型任务未能启动");
                            } finally {
                                setWorking(false);
                            }
                        }}
                    >
                        制作口型片段
                    </Button>
                </div>
            }
        >
            <div className="grid gap-5 py-2 md:grid-cols-[minmax(0,1.25fr)_minmax(240px,1fr)]" data-canvas-no-zoom>
                <div className="min-w-0 space-y-3">
                    <p className="text-sm font-medium">1. 选择说话的人物</p>
                    <div
                        className="relative overflow-hidden rounded-lg bg-muted"
                        style={{ aspectRatio: natural.width && natural.height ? `${natural.width}/${natural.height}` : "16/9", touchAction: manual ? "none" : "auto" }}
                        role="group"
                        aria-label="框选说话人物"
                        onPointerDown={(event) => {
                            if (!manual || !natural.width) return;
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            drag.current = point(event);
                            change(() => setRegion(undefined));
                        }}
                        onPointerMove={draw}
                        onPointerUp={(event) => {
                            draw(event);
                            drag.current = null;
                            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                        }}
                        onPointerCancel={() => {
                            drag.current = null;
                        }}
                    >
                        {photo ? (
                            <img
                                src={source.metadata?.content}
                                alt={source.title || "口型原照片"}
                                draggable={false}
                                className="h-full w-full select-none object-contain"
                                onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                src={source.metadata?.content}
                                preload="metadata"
                                controls={!manual}
                                className="h-full w-full object-contain"
                                onLoadedMetadata={(event) => {
                                    const v = event.currentTarget;
                                    setNatural({ width: v.videoWidth, height: v.videoHeight });
                                    v.currentTime = previewTime;
                                }}
                            />
                        )}
                        {manual && region && natural.width ? (
                            <div
                                className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                                style={{ left: `${(region.x / natural.width) * 100}%`, top: `${(region.y / natural.height) * 100}%`, width: `${(region.width / natural.width) * 100}%`, height: `${(region.height / natural.height) * 100}%` }}
                            />
                        ) : null}
                    </div>
                    {!photo ? (
                        <label className="flex items-center justify-between gap-3 text-sm">
                            画面预览时间
                            <InputNumber
                                aria-label="画面预览时间"
                                value={previewTime}
                                min={0}
                                max={(source.metadata?.durationMs || 3600000) / 1000}
                                step={0.1}
                                onChange={(value) => {
                                    const n = Number(value) || 0;
                                    setPreviewTime(n);
                                    if (videoRef.current) videoRef.current.currentTime = n;
                                }}
                                suffix="秒"
                            />
                        </label>
                    ) : null}
                    <Radio.Group
                        aria-label="人物选取方式"
                        value={manual ? "manual" : "auto"}
                        onChange={(event) => change(() => setManual(event.target.value === "manual"))}
                        options={[
                            { value: "auto", label: "单人自动识别" },
                            { value: "manual", label: "框选人物" },
                        ]}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">请选择清晰的正面人物。多人画面请框出完整脸部；自动识别有歧义时会停止，请重新选区。</p>
                    {manual ? (
                        <div className="grid grid-cols-2 gap-2">
                            {(
                                [
                                    ["x", "左边"],
                                    ["y", "上边"],
                                    ["width", "宽度"],
                                    ["height", "高度"],
                                ] as const
                            ).map(([key, label]) => (
                                <label key={key} className="flex items-center justify-between gap-1 text-xs">
                                    {label}
                                    <InputNumber
                                        aria-label={`人物区域${label}`}
                                        min={key === "width" || key === "height" ? 48 : 0}
                                        max={1280}
                                        precision={0}
                                        value={region?.[key]}
                                        onChange={(value) => change(() => setRegion((current) => ({ ...{ x: 0, y: 0, width: 48, height: 48 }, ...current, [key]: Number(value) || 0 })))}
                                        className="!w-24"
                                    />
                                </label>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="min-w-0 space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">2. 选择要说的对白</p>
                        <Select
                            aria-label="口型对白音频"
                            className="w-full"
                            placeholder="选择画布上的对白音频"
                            value={audio?.id}
                            options={audios.map((n) => ({ value: n.id, label: n.title || "未命名音频" }))}
                            onChange={(value) =>
                                change(() => {
                                    setAudioId(value);
                                    setRights(false);
                                })
                            }
                        />
                        {audio ? <audio controls preload="metadata" src={audio.metadata?.content} className="w-full" aria-label="口型对白试听" /> : <p className="text-sm text-muted-foreground">先上传音频或完成角色配音，再回到这里选择。</p>}
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium">3. 确认片段范围</p>
                        {!photo ? <TimeField label="画面开始" value={start} onChange={(value) => change(() => setStart(value))} /> : null}
                        <TimeField label={photo ? "片段时长" : "画面结束"} value={end} onChange={(value) => change(() => setEnd(value))} />
                        <TimeField label="对白开始" value={audioStart} onChange={(value) => change(() => setAudioStart(value))} />
                        <p className="text-xs text-muted-foreground">将制作 {Math.max(0, end - start).toFixed(2)} 秒的新候选。原画面和对白保留。</p>
                    </div>
                    {models.length > 1 ? <Select aria-label="口型模型" className="w-full" value={actualModel} options={models} onChange={setModel} /> : null}
                    <Checkbox checked={rights} onChange={(event) => change(() => setRights(event.target.checked))}>
                        我有权使用所选画面与对白
                    </Checkbox>
                    <p className="text-xs leading-5 text-muted-foreground">本地处理可能较慢，建议先试2–3秒。可关闭页面，完成后试听、比较新候选，再加入剪辑。支持0.1–30秒，画面最长边1280像素；嘴型效果需要人工预览。</p>
                    {!actualModel ? <Alert type="info" showIcon title="口型服务尚未启用" description="请联系管理员配置已安装的本地口型模型。设置可以先保存。" /> : null}
                    {error ? <Alert type="error" showIcon title={error} /> : null}
                </div>
            </div>
        </AppModal>
    );
}
function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <label className="flex items-center justify-between gap-3 text-sm">
            {label}
            <InputNumber aria-label={label} value={value} min={0} max={3600} precision={3} step={0.1} onChange={(v) => onChange(Number(v) || 0)} suffix="秒" />
        </label>
    );
}
