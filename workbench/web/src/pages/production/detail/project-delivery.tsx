import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { createProjectDelivery, readProjectDeliverySource, readProjectDeliveryResult, type ProjectDelivery } from "@/services/api/project-delivery";
import { downloadBrowserMedia } from "@/services/browser-download";

export function ProjectDeliveryPanel({ projectId }: { projectId: string }) {
    const [busy, setBusy] = useState(false),
        [result, setResult] = useState<ProjectDelivery>(),
        [error, setError] = useState("");
    const active = useRef(false),
        working = useRef(false);
    const [source, setSource] = useState("");
    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
        };
    }, [projectId]);
    const prepare = async () => {
        if (working.current) return;
        working.current = true;
        setBusy(true);
        setError("");
        setResult(undefined);
        try {
            const digest = source || (await readProjectDeliverySource(projectId)).sha256;
            if (!active.current) return;
            setSource(digest);
            const value = await createProjectDelivery(projectId, digest);
            if (active.current) setResult(value);
        } catch (cause) {
            if (active.current) setError(cause instanceof Error ? cause.message : "打包失败，请核对素材与存储空间后重试");
        } finally {
            working.current = false;
            if (active.current) setBusy(false);
        }
    };
    const download = async () => {
        if (!result) return;
        try {
            await downloadBrowserMedia({ fileName: result.fileName, storageKey: `resource:${result.resourceId}` });
        } catch (cause) {
            if (active.current) setError(cause instanceof Error ? cause.message : "下载失败，可重新下载同一工程包");
        }
    };
    return (
        <details aria-label="工程与素材交付" className="space-y-3 rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-base font-medium">工程与素材交付</summary>
            <p className="text-sm text-muted-foreground">一次打包项目正文、镜头与素材版本、画布历史、剪辑、字幕和审片记录，附带引用的原始素材及 OTIO / SRT 交换文件。</p>
            <p className="text-xs text-muted-foreground">保存当前编辑后再打包。打包免费，不运行生成模型；工程包占用自己的存储空间，同一份内容重试会复用原文件。完整账号、权限和任务回执恢复请使用本地完整备份。</p>
            <div className="flex flex-wrap gap-2">
                <Button loading={busy} disabled={busy} onClick={() => void prepare()}>
                    整理完整素材工程包
                </Button>
                {result && (
                    <Button type="primary" onClick={() => void download()}>
                        下载工程包
                    </Button>
                )}
            </div>
            {source && (
                <div className="flex flex-wrap gap-2">
                    <Button
                        disabled={busy}
                        onClick={() => {
                            if (working.current) return;
                            working.current = true;
                            setBusy(true);
                            void readProjectDeliveryResult(projectId, source)
                                .then((value) => {
                                    if (active.current) {
                                        setResult(value);
                                        setError("");
                                    }
                                })
                                .catch((cause) => {
                                    if (active.current) setError(cause instanceof Error ? cause.message : "尚未找到原工程包，可按相同来源重试整理");
                                })
                                .finally(() => {
                                    working.current = false;
                                    if (active.current) setBusy(false);
                                });
                        }}
                    >
                        核对原工程包
                    </Button>
                    <Button
                        disabled={busy}
                        onClick={() => {
                            setSource("");
                            setResult(undefined);
                            setError("");
                        }}
                    >
                        按当前内容重新整理
                    </Button>
                </div>
            )}
            {busy && (
                <p role="status" className="text-sm">
                    正在校验项目文档与每一份原片，完成前请稍候…
                </p>
            )}
            {result && (
                <p role="status" className="break-all text-xs">
                    已整理 {(result.bytes / 1048576).toFixed(1)} MB · SHA256 {result.sha256}
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}
        </details>
    );
}
