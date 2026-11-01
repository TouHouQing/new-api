import { generationTaskSavingState, generationTaskPhase, generationPhaseStep, generationPhaseLabel, generationPhaseHint } from "@/lib/generation-task-display";
import { describe, expect, test } from "bun:test";
import { canCancelGenerationTask, generationTaskShowsProgress, generationTaskStageLabel, generationTaskStatusLabel, mediaDeliverySummary, formatTaskKind, videoReworkEditorURL } from "@/lib/generation-task-display";
import { resetGenerationTaskMetadata } from "@/lib/canvas/canvas-task-state";

describe("作品保存阶段", () => {
    test("对话存档有明确标签，不能被当成已完成推理或再次取消", () => {
        const record = { status: "text_replay" as const, stage: "文本持久化（前端自管）" };
        expect(generationTaskStatusLabel(record)).toBe("对话记录");
        expect(generationTaskShowsProgress(record)).toBe(false);
        expect(canCancelGenerationTask(record)).toBe(false);
    });
    test("分别表达生成、下载、上传和登记，不把保存失败当成生成失败", () => {
        expect(mediaDeliverySummary("failed", "download")).toBe("生成成功 · 下载失败");
        expect(mediaDeliverySummary("failed", "upload")).toBe("生成成功 · 下载成功 · 上传 OSS失败");
        expect(mediaDeliverySummary("failed", "register")).toBe("生成成功 · 文件保存成功 · 登记素材失败");
        expect(mediaDeliverySummary("failed", "checkpoint")).not.toContain("下载成功");
        expect(mediaDeliverySummary("succeeded", "completed")).toContain("素材登记成功");
    });
    test("恢复中不显示虚假生成进度", () => {
        expect(generationTaskStatusLabel({ status: "running", mediaStage: "upload" })).toBe("保存中");
        expect(generationTaskShowsProgress({ status: "running", mediaStage: "upload" })).toBe(false);
        expect(generationTaskStatusLabel({ status: "failed", mediaStage: "download" })).toBe("保存未完成");
    });
    test("状态标签与阶段说明不再重复同一句“作品已生成，正在保存”", () => {
        const saving = { status: "running" as const, stage: "作品已生成，正在保存", mediaStage: "upload" as const };
        expect(generationTaskStatusLabel(saving)).toBe("保存中");
        expect(generationTaskStageLabel(saving)).toBe("已生成，正在存入素材库");
        expect(generationTaskStageLabel({ ...saving, status: "failed" })).toBe("作品已生成，保存未完成");
    });
    test("保存失败后的自动重试与等待保存不能显示成正常保存", () => {
        const retrying = { status: "running" as const, stage: "作品已生成，保存遇到问题，正在自动恢复", mediaStage: "download" as const };
        expect(generationTaskSavingState(retrying.stage)).toBe("retrying");
        expect(generationTaskStageLabel(retrying)).toBe("保存遇到问题，正在自动重试");
        expect(generationPhaseLabel("saving", "image", retrying.stage)).toBe("保存遇到问题，正在重试");
        expect(generationPhaseHint("saving", "image", retrying.stage)).toBe("作品已生成，正在自动重试保存，不会重新生成");

        const waiting = { status: "running" as const, stage: "作品已生成，等待保存", mediaStage: "download" as const };
        expect(generationTaskSavingState(waiting.stage)).toBe("waiting");
        expect(generationTaskStageLabel(waiting)).toBe("作品已生成，等待保存");
        expect(generationPhaseLabel("saving", "video", waiting.stage)).toBe("等待保存");
    });
    test("重新生成清除旧恢复信息", () => {
        const metadata = resetGenerationTaskMetadata({ taskId: "old", taskMediaStage: "upload", taskCanRecoverMedia: true });
        expect(metadata.taskId).toBeUndefined();
        expect(metadata.taskMediaStage).toBeUndefined();
        expect(metadata.taskCanRecoverMedia).toBeUndefined();
    });
});

describe("生成任务取消边界", () => {
    test("排队和本地准备阶段仍允许取消", () => {
        expect(canCancelGenerationTask({ status: "queued", stage: "等待队列调度" })).toBe(true);
        expect(canCancelGenerationTask({ status: "running", stage: "后端接管任务" })).toBe(true);
    });

    test("进入上游提交阶段后立即隐藏取消入口", () => {
        for (const stage of ["调用生成模型", "正在连接上游", "上游生成中", "后台仍在生成", "等待上游任务同步", "generating", "submitting", "submitted", "submission_unknown"]) {
            expect(canCancelGenerationTask({ status: "running", stage })).toBe(false);
        }
    });

    test("已有上游请求或取消协调状态时不可取消", () => {
        expect(canCancelGenerationTask({ status: "running", stage: "后端接管任务", providerRequestId: "provider-1" })).toBe(false);
        expect(canCancelGenerationTask({ status: "running", stage: "后端接管任务", providerCancelStatus: "requested" })).toBe(false);
    });

    test("作品已生成进入保存阶段或上游返回未知阶段时也不暴露取消入口", () => {
        expect(canCancelGenerationTask({ status: "running", stage: "作品已生成，正在保存", mediaStage: "upload" })).toBe(false);
        expect(canCancelGenerationTask({ status: "running", stage: "provider_processing" })).toBe(false);
        expect(canCancelGenerationTask({ status: "running", stage: "" })).toBe(false);
        expect(canCancelGenerationTask({ status: "queued", stage: "" })).toBe(true);
    });
});

describe("生成任务用户可见阶段", () => {
    test("本地修复在任务中心显示处理和准确返回入口，不暗示再次生成", () => {
        const task = { type: "video_rework", provider: "local", model: "ffmpeg", status: "running" as const, projectId: "production-project", stage: "合成所选区域与时间", inputJson: JSON.stringify({ plan: { request: { clipId: "one-use:2" } } }) };
        expect(canCancelGenerationTask(task)).toBe(true);
        expect(generationTaskStatusLabel(task)).toBe("修复处理中");
        expect(mediaDeliverySummary("succeeded", "completed", task.type)).toBe("修复候选已保存 · 素材已登记");
        expect(videoReworkEditorURL(task)).toBe("/projects/production-project/editor?repairClipId=one-use%3A2");
        expect(videoReworkEditorURL({ ...task, id: "native-task" })).toBe("/projects/production-project/editor?repairClipId=one-use%3A2&repairTaskId=native-task");
        expect(videoReworkEditorURL({ ...task, type: "canvas_video" })).toBeNull();
        expect(formatTaskKind(task as Parameters<typeof formatTaskKind>[0])).toBe("视频片段修复");
    });
    test("服务端支持的本地媒体回执可以取消，保存阶段和第三方规则仍受保护", () => {
        expect(canCancelGenerationTask({ status: "running", stage: "上游生成中", providerRequestId: "local-receipt", canCancelAfterSubmission: true })).toBe(true);
        expect(canCancelGenerationTask({ status: "running", stage: "上游生成中", providerRequestId: "cloud-receipt" })).toBe(false);
        expect(canCancelGenerationTask({ status: "running", stage: "上游生成中", providerRequestId: "local-receipt", canCancelAfterSubmission: true, mediaStage: "download" })).toBe(false);
        expect(canCancelGenerationTask({ status: "cancelled", canCancelAfterSubmission: true, providerRequestId: "local-receipt" })).toBe(false);
        expect(canCancelGenerationTask({ status: "running", type: "timeline_transcription", provider: "local", model: "whisper.cpp", stage: "正在识别" })).toBe(true);
        expect(generationTaskStatusLabel({ status: "cancelled", providerCancelStatus: "requested" })).toBe("取消确认中");
        expect(generationTaskStatusLabel({ status: "cancelled", providerCancelStatus: "confirmed" })).toBe("已取消");
    });
    test("不向用户暴露参考素材准备和上游连接等技术阶段", () => {
        expect(generationTaskStageLabel({ status: "running", stage: "正在准备参考素材" })).toBe("作品创作中");
        expect(generationTaskStageLabel({ status: "running", stage: "正在连接上游" })).toBe("作品创作中");
    });

    test("供应商自定义英文阶段按任务状态兜底", () => {
        expect(generationTaskStageLabel({ status: "running", stage: "provider_processing" })).toBe("作品创作中");
        expect(generationTaskStageLabel({ status: "running", stage: "submitting" })).toBe("正在提交创作");
        expect(generationTaskStageLabel({ status: "running", stage: "后台仍在生成图片" })).toBe("作品创作中");
    });
});

describe("按班次出片的上游阶段", () => {
    test("候车时显示上游阶段、不显示上游百分比", () => {
        const boarding = { status: "running" as const, stage: "候车 · 前面 407 条", progress: 13 };
        expect(generationTaskPhase(boarding)).toBe("queued");
        expect(generationPhaseLabel(generationTaskPhase(boarding), "video", boarding.stage)).toBe("候车 · 前面 407 条");
        expect(generationTaskShowsProgress(boarding)).toBe(false);
        expect(generationTaskStageLabel(boarding)).toBe("候车 · 前面 407 条");
    });
    test("发车后显示上游阶段并恢复百分比", () => {
        const running = { status: "running" as const, stage: "出片中", progress: 40 };
        expect(generationTaskPhase(running)).toBe("generating");
        expect(generationPhaseLabel("generating", "video", running.stage)).toBe("出片中");
        expect(generationTaskShowsProgress(running)).toBe(true);
    });
});

describe("画布与首页共用的生成阶段", () => {
    test("后端阶段映射成排队、准备、生成、保存、载入五段", () => {
        expect(generationTaskPhase(undefined)).toBe("submitting");
        expect(generationTaskPhase({ status: "queued", stage: "等待队列调度" })).toBe("queued");
        expect(generationTaskPhase({ status: "running", stage: "后端接管任务" })).toBe("preparing");
        expect(generationTaskPhase({ status: "running", stage: "上游生成中" })).toBe("generating");
        expect(generationTaskPhase({ status: "running", stage: "provider_processing" })).toBe("generating");
        expect(generationTaskPhase({ status: "running", stage: "作品已生成，正在保存", mediaStage: "register" })).toBe("saving");
        expect(generationTaskPhase({ status: "succeeded", stage: "任务完成" })).toBe("finalizing");
        expect(generationTaskPhase({ status: "running", stage: "submission_unknown" })).toBe("uncertain");
    });

    test("三段进度：排队 → 生成 → 保存，载入结果时全部完成", () => {
        expect(generationPhaseStep("queued")).toBe(0);
        expect(generationPhaseStep("generating")).toBe(1);
        expect(generationPhaseStep("saving")).toBe(2);
        expect(generationPhaseStep("finalizing")).toBe(3);
    });

    test("文案按媒体类型说人话，只在有新信息时给提示", () => {
        expect(generationPhaseLabel("generating", "video")).toBe("正在生成视频");
        expect(generationPhaseLabel("generating", "video", "作品创作中")).toBe("正在生成视频");
        expect(generationPhaseLabel("generating", "video", "provider_processing")).toBe("正在生成视频");
        expect(generationPhaseLabel("saving", "image")).toBe("正在保存图片");
        expect(generationPhaseHint("generating", "video")).toBe("离开页面也会继续生成");
        expect(generationPhaseHint("generating", "image")).toBe("");
        expect(generationPhaseHint("saving", "image")).toBe("作品已生成，正在存入素材库");
    });
});
