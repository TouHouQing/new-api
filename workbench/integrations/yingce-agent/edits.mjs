import * as z from 'zod/v4';

const id = z.string().min(1).max(128).regex(/^[\p{L}\p{N}_:.-]+$/u);
const time = z.number().int().min(0).max(86400000);
const captionColor = z.string().regex(/^#[a-f0-9]{6}([a-f0-9]{2})?$/i);
const captionPresentation = z.strictObject({ version: z.literal(1), fontSize: z.number().min(12).max(144), color: captionColor, position: z.enum(['top', 'center', 'bottom']), backgroundColor: captionColor, padding: z.number().min(0).max(72), marginPercent: z.number().min(0).max(25).optional(), highlights: z.array(z.strictObject({ start: z.number().int().min(0), end: z.number().int().positive(), sourceText: z.string().max(2000), color: captionColor, backgroundColor: captionColor, paddingX: z.number().min(0).max(72), paddingY: z.number().min(0).max(72), radius: z.number().min(0).max(72), animation: z.enum(['none', 'pop', 'wipe']) })).max(64).optional() });
const graphic = z.strictObject({ version: z.literal(1), kind: z.enum(['text', 'icon', 'shape', 'image']), x: z.number().min(0).max(1), y: z.number().min(0).max(1), size: z.number().int().min(12).max(300), color: z.string().regex(/^#[a-f0-9]{6}$/i), fontFamily: z.enum(['sans', 'serif']).optional(), icon: z.enum(['spark', 'play', 'heart', 'check', 'arrow']).optional(), shape: z.enum(['square', 'circle']).optional(), resourceId: id.optional(), animation: z.enum(['none', 'fade', 'slide', 'pulse', 'bounce', 'rotate', 'morph']), bpm: z.number().int().min(30).max(240), phaseOffsetMs: z.number().int().min(0).max(3600000).optional(), phaseDurationMs: z.number().int().min(1).max(3600000) }).refine(g => (g.kind === 'image' ? !!g.resourceId : !g.resourceId) && (g.animation !== 'morph' || g.kind === 'shape'), { message: '图片必须使用所属资源，方圆变形仅用于形状。' });
const command = z.union([
    z.strictObject({ op: z.literal('arrangeToBeats'), analysisId: id, analysisRevisionId: id, sourceClipId: id, clipIds: z.array(id).min(2).max(128) }),
    z.strictObject({ op: z.literal('applyVideoRepair'), id, repairTaskId: id }),
    z.strictObject({ op: z.literal('removeVideoRepair'), id, repairTaskId: id, expectedClipSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    z.strictObject({ op: z.literal('addGraphic'), id, startMs: time, durationMs: time.min(1), text: z.string().max(2000), trackId: id.optional(), graphic }),
    z.strictObject({ op: z.literal('setGraphic'), id, graphic, restart: z.boolean().optional() }),
    z.strictObject({ op: z.literal('setOutput'), output: z.strictObject({ width: z.number().int().min(64).max(4096).multipleOf(2), height: z.number().int().min(64).max(4096).multipleOf(2), fps: z.number().int().min(12).max(60), fit: z.enum(['letterbox', 'crop', 'blur']).optional() }) }),
    z.strictObject({ op: z.literal('addResource'), resourceId: id, startMs: time.optional(), durationMs: time.min(1).optional(), trackId: id.optional() }),
    z.strictObject({ op: z.literal('addCanvasNode'), resourceId: id, canvasId: id, nodeId: id, canvasRevision: z.number().int().min(1), nodeSha256: z.string().regex(/^[a-f0-9]{64}$/), startMs: time.optional(), durationMs: time.min(1).optional(), trackId: id.optional() }),
    z.strictObject({ op: z.literal('moveClip'), id, startMs: time, trackId: id.optional() }),
    z.strictObject({ op: z.literal('trimClip'), id, startMs: time.optional(), durationMs: time.min(1).optional(), sourceStartMs: time.optional() }),
    z.strictObject({ op: z.literal('splitClip'), id, splitAtMs: time }),
    z.strictObject({ op: z.literal('setClipPlaybackRate'), id, playbackRate: z.number().min(.25).max(4) }),
    z.strictObject({ op: z.literal('removeClip'), id }),
    z.strictObject({ op: z.literal('setAudioLink'), id, sourceClipId: id.optional(), mode: z.enum(['source', 'clip']).optional() }),
    z.strictObject({ op: z.literal('setCaptionLink'), id, sourceClipId: id.optional() }),
    z.strictObject({ op: z.literal('setCaptionPresentation'), id, captionPresentation }),
    z.strictObject({ op: z.literal('setCaptionText'), id, text: z.string().max(2000) }),
]);
const requestId = z.string().min(16).max(128).regex(/^[!-~]+$/);
const input = { projectId: id, requestId, expectedRevision: z.number().int().min(0), commands: z.array(command).min(1).max(8) };
const base = project => '/api/projects/' + encodeURIComponent(project) + '/timeline';
export function registerTimelineEditTools(tool, client) {
    if (!client.workspace) return;
    const review = { projectId: id, requestId, expectedRevision: z.number().int().min(0), discardFields: z.array(z.string().min(1).max(512)).min(1).max(128) };
    tool('yingce_preview_legacy_settings_review', '只读核对当前工作剪辑中尚未转换的旧版设置，返回放弃字段、来源、当前画面摘要和恢复版本ID。放弃不代表转换成功。用户应优先更新旧版转换；只有明确决定采用当前画面、不要这些旧设置时，才继续确认。', review, true,
        ({ projectId, ...body }, signal) => client.request('POST', base(projectId) + '/legacy-settings/preview', body, { signal }));
    tool('yingce_apply_legacy_settings_review', '仅在用户明确授权放弃预览中全部旧版设置后使用。原子保存核对结果、恢复版本与回执，原工程和旧成片保留。确认令牌绑定来源、画面及字段；409重新预览，响应不明先查原编号回执，不能生成新编号重做。', { ...review, previewToken: z.string().regex(/^[a-f0-9]{64}$/), confirmDiscard: z.literal(true) }, false,
        ({ projectId, confirmDiscard, ...body }, signal) => { if (!confirmDiscard) throw new Error('需要用户明确确认放弃这些旧版设置。'); return client.request('POST', base(projectId) + '/legacy-settings/apply', body, { signal }); });
    tool('yingce_legacy_settings_review_result', '按原编号查询放弃旧版设置的完成回执及恢复版本，不修改工作剪辑。恢复旧版后，其未处理设置会重新进入交付检查。', { projectId: id, requestId }, true,
        ({ projectId, requestId }, signal) => client.request('GET', base(projectId) + '/legacy-settings/results?' + new URLSearchParams({ requestId }), undefined, { signal }));
    tool('yingce_canvas_ingest_source', '读取当前项目所属画布节点的确切原片及字幕快照摘要；返回确认所需的canvasRevision和nodeSha256。addCanvasNode会采用这些字幕并跟随本次具体片段。读取不保存剪辑、不生成模型。', { projectId: id, canvasId: id, nodeId: id, resourceId: id }, true,
        ({ projectId, ...query }, signal) => client.request('GET', base(projectId) + '/canvas-source?' + new URLSearchParams(query), undefined, { signal }));
    tool('yingce_preview_timeline_edits', '只读预览原生资源加入、具体片段移动/裁剪/拆分/变速、声音跟随以及字幕文字/外观。captionPresentation的像素按短边1080换算，重点范围为当前台词的UTF16索引；改台词会清除该片段当前重点。addResource仅传就绪资源ID，source声音随画面变速，clip保持语速。返回具体影响和确认令牌，不生成模型。', input, true,
        ({ projectId, ...body }, signal) => client.request('POST', base(projectId) + '/edits/preview', body, { signal }));
    tool('yingce_apply_timeline_edits', '仅应用已获用户授权且核对过预览的明确编辑。原子保留编辑前后版本、工作剪辑和回执。409重新读取预览；响应未知先查timeline_edit_result，同编号重放不会覆盖后续编辑。', { ...input, previewToken: z.string().regex(/^[a-f0-9]{64}$/), confirmEdit: z.literal(true) }, false,
        ({ projectId, confirmEdit, ...body }, signal) => { if (!confirmEdit) throw new Error('应用编辑需要确认已授权的具体影响。'); return client.request('POST', base(projectId) + '/edits/apply', body, { signal }); });
    tool('yingce_timeline_edit_result', '按原编辑编号查完成回执及编辑前后版本ID，不重新修改剪辑。需要恢复时用原生剪辑版本的预览/载入流程。', { projectId: id, requestId }, true,
        ({ projectId, requestId }, signal) => client.request('GET', base(projectId) + '/edit-results?' + new URLSearchParams({ requestId }), undefined, { signal }));
}
