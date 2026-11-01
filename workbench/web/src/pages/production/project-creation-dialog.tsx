import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, InputNumber, Modal, Segmented, Select } from "antd";
import { creativeGoals, emptyCreativeBrief } from "@/lib/project-creative-brief";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createProject, listProjectStarterPresets, readProjectCreation, type Project, type ProjectCreationInput, type ProjectStarter } from "@/services/api/projects";
import { ApiError } from "@/services/api/request";
import { uploadResourceFile } from "@/services/api/resources";
import { createProjectCreationDraftStore, type ProjectCreationDraft } from "@/services/project-creation-draft";

type Entry = ProjectStarter["entry"];
const entryLabels = [
    { value: "idea", label: "写需求" },
    { value: "upload", label: "上传素材" },
    { value: "template", label: "用模板" },
];
const blankInput = (entry: Entry, text: string): ProjectCreationInput => ({
    name: text.trim().slice(0, 24),
    type: "short-drama",
    aspectRatio: "9:16",
    sourceType: entry,
    idempotencyKey: crypto.randomUUID(),
    creativeBrief: { ...emptyCreativeBrief(), keyMessage: text, targetDurationMs: 15000, language: "zh-CN" },
    starter: { entry },
});

export function ProjectCreationDialog({
    open,
    initialEntry = "idea",
    initialText = "",
    onClose,
    onCreated,
    onLegacyCreate,
}: {
    open: boolean;
    initialEntry?: Entry;
    initialText?: string;
    onClose: () => void;
    onCreated: (project: Project) => void;
    onLegacyCreate: () => void;
}) {
    const [input, setInput] = useState<ProjectCreationInput>(() => blankInput(initialEntry, initialText));
    const [submitted, setSubmitted] = useState<ProjectCreationInput>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadName, setUploadName] = useState("");
    const [progress, setProgress] = useState(0);
    const [recovery, setRecovery] = useState<{ key: string; draft: ProjectCreationDraft }[]>([]);
    const [showRecovery, setShowRecovery] = useState(false);
    const editorId = useRef(crypto.randomUUID()),
        finished = useRef(false),
        active = useRef(false);
    const scope = getActiveUserScope();
    const store = useMemo(() => createProjectCreationDraftStore(localForageStorageForScope(scope), editorId.current), [scope]);
    const presets = useQuery({ queryKey: ["project-starter-presets"], queryFn: ({ signal }) => listProjectStarterPresets(signal), enabled: open });
    const goal = input.creativeBrief!.goal,
        entry = input.starter!.entry,
        readonly = Boolean(submitted) || busy;
    const preset = presets.data?.presets.find((item) => item.goal === goal);
    useEffect(() => {
        if (!open) return;
        finished.current = false;
        active.current = true;
        setInput(blankInput(initialEntry, initialText));
        setSubmitted(undefined);
        setError("");
        setUploadName("");
        setShowRecovery(false);
        void store
            .recover()
            .then((rows) => {
                setRecovery(rows);
                const own = rows.find((row) => row.key === store.key);
                if (own?.draft.submitted) {
                    setInput(own.draft.input);
                    setSubmitted(own.draft.submitted);
                    setUploadName(own.draft.uploadName || "");
                }
            })
            .catch((cause) => setError(cause.message));
        return () => {
            active.current = false;
        };
    }, [open, initialEntry, initialText, store]);
    useEffect(() => {
        if (!open || readonly || finished.current || (!input.name.trim() && !input.creativeBrief?.keyMessage && !uploadName)) return;
        const timer = setTimeout(() => {
            void store.write(input, undefined, uploadName).catch((cause) => setError(cause.message));
        }, 300);
        return () => clearTimeout(timer);
    }, [input, open, readonly, store, uploadName]);
    const patch = (values: Partial<ProjectCreationInput>) => setInput((current) => ({ ...current, ...values }));
    const brief = (values: Partial<NonNullable<ProjectCreationInput["creativeBrief"]>>) => setInput((current) => ({ ...current, creativeBrief: { ...current.creativeBrief!, ...values } }));
    const chooseEntry = (value: Entry) => {
        patch({ sourceType: value, starter: { entry: value } });
        setUploadName("");
        setError("");
    };
    const close = async () => {
        if (busy || uploading) return;
        try {
            if (!finished.current && (input.name.trim() || input.creativeBrief?.keyMessage || uploadName)) await store.write(input, submitted, uploadName);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "草稿尚未保存，请重试关闭");
        }
    };
    const created = async (project: Project) => {
        if (getActiveUserScope() !== scope) throw new DOMException("Aborted", "AbortError");
        finished.current = true;
        await store.clear();
        onCreated(project);
    };
    const submit = async () => {
        if (busy || uploading) return;
        let body = submitted;
        if (!body) {
            if (!input.name.trim()) {
                setError("请填写作品名称");
                return;
            }
            if ((entry === "idea" || entry === "template") && !input.creativeBrief?.keyMessage.trim()) {
                setError("请写下想传达的内容");
                return;
            }
            if (entry === "upload" && !input.starter?.sourceText && !input.starter?.resourceId) {
                setError("请先上传素材或脚本");
                return;
            }
            if (entry === "template" && !preset) {
                setError("模板尚未读取，请稍后重试");
                return;
            }
            body = JSON.parse(JSON.stringify({ ...input, name: input.name.trim(), starter: { ...input.starter, ...(entry === "template" ? { presetKey: preset!.key } : {}) } })) as ProjectCreationInput;
        }
        setBusy(true);
        setError("");
        try {
            await store.write(body, body, uploadName);
            setInput(body);
            setSubmitted(body);
            const result = await createProject(body);
            await created(result.project);
        } catch (cause) {
            if (cause instanceof ApiError && ([400, 413, 422].includes(cause.status || 0) || cause.reason === "project_name_conflict")) {
                setSubmitted(undefined);
                await store.write(body, undefined, uploadName);
            }
            setError(cause instanceof Error ? cause.message : "创建结果尚未确认，请保留原内容并核对");
        } finally {
            if (active.current) setBusy(false);
        }
    };
    const verify = async () => {
        if (!submitted || busy) return;
        setBusy(true);
        setError("");
        try {
            await created((await readProjectCreation(submitted.idempotencyKey!)).project);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "创建结果尚未确认");
        } finally {
            if (active.current) setBusy(false);
        }
    };
    const upload = async (file?: File) => {
        if (!file || readonly || uploading) return;
        setUploading(true);
        setError("");
        setProgress(0);
        try {
            if (/\.(?:txt|md)$/i.test(file.name)) {
                if (file.size > 400000) throw new Error("脚本文件请控制在400KB内，长篇文稿可从小说导入继续");
                const bytes = await file.arrayBuffer();
                let text: string;
                try {
                    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                } catch {
                    text = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
                }
                if (!text.trim() || text.includes("\0") || [...text].length > 100000) throw new Error("脚本须为有效文字，最多10万字");
                if (getActiveUserScope() !== scope) throw new DOMException("Aborted", "AbortError");
                patch({ starter: { entry: "upload", sourceText: text } });
                setUploadName(file.name);
                return;
            }
            const kind =
                file.type.startsWith("image/") || /\.(?:png|jpe?g|webp)$/i.test(file.name)
                    ? "image"
                    : file.type.startsWith("video/") || /\.(?:mp4|mov|webm)$/i.test(file.name)
                      ? "video"
                      : file.type.startsWith("audio/") || /\.(?:wav|mp3|m4a|ogg|flac)$/i.test(file.name)
                        ? "audio"
                        : null;
            if (!kind) throw new Error("请选择图片、视频、声音或TXT/Markdown脚本");
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${file.name}\n${file.size}\n${file.lastModified}`));
            const fingerprint = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
            const meta = { fileName: file.name, idempotencyKey: `starter:${input.idempotencyKey}:${fingerprint}` };
            let measured: { width?: number; height?: number; durationMs?: number } = {};
            if (kind === "image") {
                const image = await createImageBitmap(file);
                measured = { width: image.width, height: image.height };
                image.close();
            } else {
                const url = URL.createObjectURL(file),
                    media = document.createElement(kind);
                try {
                    await new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error("无法读取素材时长，请换用可播放文件")), 15000);
                        media.onloadedmetadata = () => {
                            clearTimeout(timer);
                            resolve();
                        };
                        media.onerror = () => {
                            clearTimeout(timer);
                            reject(new Error("浏览器无法读取这份素材，请检查文件格式"));
                        };
                        media.preload = "metadata";
                        media.src = url;
                    });
                    if (!Number.isFinite(media.duration) || media.duration <= 0) throw new Error("素材没有有效时长");
                    measured = { durationMs: Math.round(media.duration * 1000), ...(media instanceof HTMLVideoElement ? { width: media.videoWidth, height: media.videoHeight } : {}) };
                } finally {
                    media.removeAttribute("src");
                    media.load();
                    URL.revokeObjectURL(url);
                }
            }
            const resource = await uploadResourceFile(file, kind, { ...meta, ...measured }, (done, total) => setProgress(total ? done / total : 0));
            if (getActiveUserScope() !== scope) throw new DOMException("Aborted", "AbortError");
            patch({ starter: { entry: "upload", resourceId: resource.id } });
            setUploadName(file.name);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "素材尚未上传，请重试");
        } finally {
            if (active.current) setUploading(false);
        }
    };
    return (
        <Modal
            open={open}
            onCancel={() => void close()}
            footer={null}
            title="创建视频作品"
            width={680}
            centered
            mask={{ closable: !busy && !uploading }}
            keyboard={!busy && !uploading}
            closable={!busy && !uploading}
            styles={{ body: { maxHeight: "calc(100dvh - 180px)", overflowY: "auto", paddingTop: 12 } }}
        >
            <div className="space-y-5">
                {recovery.length ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span>有 {recovery.length} 份创建草稿</span>
                        <Button size="small" onClick={() => setShowRecovery((value) => !value)} disabled={readonly}>
                            找回草稿
                        </Button>
                    </div>
                ) : null}
                {showRecovery ? (
                    <ul className="space-y-2">
                        {recovery.map((row) => (
                            <li key={row.key}>
                                <Button
                                    block
                                    onClick={() => {
                                        const next = row.draft;
                                        setInput(next.input);
                                        setSubmitted(next.submitted);
                                        setUploadName(next.uploadName || "");
                                        setShowRecovery(false);
                                        setError("");
                                    }}
                                >
                                    {row.draft.input.name || "未命名作品"}
                                    {row.draft.submitted ? " · 待核对创建" : " · 未提交"}
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <div className="space-y-2">
                    <label className="block text-sm font-medium" htmlFor="starter-name">
                        作品名称
                    </label>
                    <Input id="starter-name" aria-label="作品名称" maxLength={100} value={input.name} onChange={(e) => patch({ name: e.target.value })} readOnly={readonly} placeholder="给这次创作起个名字" />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm font-medium" htmlFor="starter-goal">
                        想做哪类视频
                    </label>
                    <Select id="starter-goal" aria-label="想做哪类视频" className="w-full" options={[...creativeGoals]} value={goal} onChange={(value) => brief({ goal: value })} disabled={readonly} />
                </div>
                <Segmented aria-label="创作起点" block options={entryLabels} value={entry} onChange={(value) => chooseEntry(value as Entry)} disabled={readonly || uploading} />
                {entry === "upload" ? (
                    <div className="space-y-2">
                        <label htmlFor="starter-file" className="block text-sm font-medium">
                            选择素材或脚本
                        </label>
                        <input
                            id="starter-file"
                            aria-label="选择素材或脚本"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/*,.txt,.md"
                            className="block w-full min-w-0 text-sm"
                            disabled={readonly || uploading}
                            onChange={(e) => {
                                void upload(e.target.files?.[0]);
                                e.target.value = "";
                            }}
                        />
                        {uploading ? (
                            <progress aria-label="素材上传进度" value={progress} max={1} className="w-full" />
                        ) : uploadName ? (
                            <p className="break-all text-sm" role="status">
                                已选择：{uploadName}
                            </p>
                        ) : (
                            <p className="text-xs text-foreground/60">图片、视频和声音会存到项目画布；TXT/Markdown会成为可编辑脚本。</p>
                        )}
                    </div>
                ) : null}
                {entry === "template" ? (
                    <div className="space-y-2">
                        <p className="text-sm font-medium">{preset?.title || "正在读取模板…"}</p>
                        <p className="text-sm text-foreground/65">{preset?.description}</p>
                        <ol className="list-inside list-decimal space-y-1 text-sm">
                            {preset?.steps.map((step) => (
                                <li key={step}>{step}</li>
                            ))}
                        </ol>
                        <p className="text-xs text-foreground/55">模板先创建脚本和镜头草案，内容可随时修改。</p>
                        {presets.isError ? <Button onClick={() => void presets.refetch()}>重新读取模板</Button> : null}
                    </div>
                ) : null}
                <div className="space-y-2">
                    <label htmlFor="starter-message" className="block text-sm font-medium">
                        {entry === "upload" ? "补充创作要求（可选）" : "想传达什么内容"}
                    </label>
                    <Input.TextArea
                        id="starter-message"
                        aria-label={entry === "upload" ? "补充创作要求（可选）" : "想传达什么内容"}
                        value={input.creativeBrief!.keyMessage}
                        onChange={(e) => brief({ keyMessage: e.target.value })}
                        maxLength={4000}
                        autoSize={{ minRows: 3, maxRows: 6 }}
                        readOnly={readonly}
                        placeholder="主题、给谁看、最想表达的一点。可以先写简单些。"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <label htmlFor="starter-ratio" className="block text-sm font-medium">
                            画幅
                        </label>
                        <Select
                            id="starter-ratio"
                            aria-label="画幅"
                            className="w-full"
                            value={input.aspectRatio}
                            options={[
                                { value: "9:16", label: "竖屏 9:16" },
                                { value: "16:9", label: "横屏 16:9" },
                                { value: "1:1", label: "方形 1:1" },
                            ]}
                            disabled={readonly}
                            onChange={(aspectRatio) => patch({ aspectRatio })}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="starter-duration" className="block text-sm font-medium">
                            目标时长（秒）
                        </label>
                        <InputNumber
                            id="starter-duration"
                            aria-label="目标时长（秒）"
                            className="w-full"
                            min={3}
                            max={3600}
                            precision={0}
                            value={input.creativeBrief!.targetDurationMs / 1000}
                            disabled={readonly}
                            onChange={(seconds) => brief({ targetDurationMs: (seconds || 15) * 1000 })}
                        />
                    </div>
                </div>
                <details>
                    <summary className="cursor-pointer text-sm">观众与语言（可选）</summary>
                    <div className="mt-3 space-y-3">
                        <Input aria-label="目标观众" placeholder="给谁看" value={input.creativeBrief!.audience} readOnly={readonly} onChange={(e) => brief({ audience: e.target.value })} />
                        <Select
                            aria-label="作品语言"
                            className="w-full"
                            value={input.creativeBrief!.language}
                            disabled={readonly}
                            onChange={(language) => brief({ language })}
                            options={[
                                { value: "zh-CN", label: "中文" },
                                { value: "en", label: "English" },
                                { value: "ja", label: "日本語" },
                                { value: "ko", label: "한국어" },
                                { value: "fr", label: "Français" },
                                { value: "es", label: "Español" },
                            ]}
                        />
                        <Input aria-label="整体语气" placeholder="例如 温暖、轻松、克制" value={input.creativeBrief!.tone} readOnly={readonly} onChange={(e) => brief({ tone: e.target.value })} />
                    </div>
                </details>
                {submitted ? (
                    <p role="status" className="text-sm">
                        正在核对上次创建。原内容和请求已保留，可继续核对或按原内容重试。
                    </p>
                ) : (
                    <p className="text-xs text-foreground/60">先保存项目和草稿，生成素材前再确认模型与费用。</p>
                )}
                {error ? (
                    <p role="alert" className="break-words text-sm text-red-600">
                        {error}
                    </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-4">
                    <Button
                        type="text"
                        disabled={busy || uploading || Boolean(submitted)}
                        onClick={() => {
                            void store
                                .write(input, undefined, uploadName)
                                .then(onLegacyCreate)
                                .catch((cause) => setError(cause.message));
                        }}
                    >
                        小说与原有项目工具
                    </Button>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void close()} disabled={busy || uploading}>
                            稍后继续
                        </Button>
                        {submitted ? (
                            <Button onClick={() => void verify()} disabled={busy}>
                                核对创建结果
                            </Button>
                        ) : null}
                        <Button type="primary" onClick={() => void submit()} loading={busy} disabled={uploading}>
                            {submitted ? "按原内容重试" : "创建并开始"}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
