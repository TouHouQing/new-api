import { useState } from "react";
import { Alert, Modal, Radio, Select } from "antd";
import type { CanvasNodeData } from "@/types/canvas";

type Props = { node: CanvasNodeData; models: Array<{ value: string; label: string }>; onClose: () => void; onConfirm: (model: string, stems: "pair" | "all") => Promise<void> };

export function CanvasNodeAudioSeparationDialog({ node, models, onClose, onConfirm }: Props) {
    const [stems, setStems] = useState<"pair" | "all">("pair");
    const [selectedModel, setSelectedModel] = useState(models[0]?.value || "");
    const model = models.some((item) => item.value === selectedModel) ? selectedModel : models[0]?.value || "";
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    return (
        <Modal
            open
            title="分离人声与伴奏"
            width={520}
            onCancel={onClose}
            okText="开始分离"
            cancelText="取消"
            confirmLoading={submitting}
            okButtonProps={{ disabled: !model }}
            onOk={async () => {
                if (submitting || !model) return;
                setSubmitting(true);
                setError("");
                try {
                    await onConfirm(model, stems);
                    onClose();
                } catch (failure) {
                    setError(failure instanceof Error ? failure.message : "声音分离未能启动");
                } finally {
                    setSubmitting(false);
                }
            }}
        >
            <div className="space-y-4 py-3">
                <p className="text-sm">将“{node.title || "这段音频"}”拆成独立音轨，方便重新配乐、调节人声或制作纯伴奏。</p>
                <audio controls preload="metadata" src={node.metadata?.content} className="w-full" aria-label="分离前试听原音频" />
                <Radio.Group
                    aria-label="分轨范围"
                    value={stems}
                    onChange={(event) => setStems(event.target.value)}
                    options={[
                        { value: "pair", label: "人声与伴奏" },
                        { value: "all", label: "全部五轨" },
                    ]}
                />
                {stems === "all" ? <p className="text-sm text-muted-foreground">另含鼓点、贝斯和其他乐器。伴奏已包含这些乐器，混音时选择伴奏或单独的乐器分轨，避免重复叠加。源音频没有的声音可能接近静音。</p> : null}
                {models.length > 1 ? <Select aria-label="声音分离模型" className="w-full" value={model} options={models} onChange={setSelectedModel} /> : null}
                <p className="text-xs leading-5 text-muted-foreground">支持0.1秒至10分钟、最大32 MiB。完成后可分别试听、下载或加入剪辑，也可以关闭页面后继续查看任务。</p>
                {!model ? <Alert type="info" showIcon title="声音分离服务尚未启用" description="请联系管理员配置本地分离模型，再回到此处使用。" /> : null}
                {error ? <Alert type="error" showIcon title={error} /> : null}
            </div>
        </Modal>
    );
}
