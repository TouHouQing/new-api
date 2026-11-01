import * as z from 'zod/v4';
const id = z.string().min(1).max(128).regex(/^[\p{L}\p{N}_:.-]+$/u);
const clipId = z.string().min(1).max(128).regex(/^[^\u0000\r\n]+$/u);
const resourceId = id.max(80), sha = z.string().regex(/^[a-f0-9]{64}$/), time = z.number().int().min(0).max(86400000);
const requestId = z.string().min(16).max(128).regex(/^[!-~]+$/);
const region = z.strictObject({ x: z.number().int().min(0).max(4094), y: z.number().int().min(0).max(4094), width: z.number().int().min(2).max(4096), height: z.number().int().min(2).max(4096) }).refine(r => r.x + r.width <= 4096 && r.y + r.height <= 4096);
const edit = z.strictObject({ clipId, clipSha256: sha, sourceResourceId: resourceId, sourceSha256: sha, sourceStartMs: time, sourceEndMs: time, candidateResourceId: resourceId, candidateSha256: sha, candidateStartMs: time, audio: z.enum(['original', 'candidate', 'mute']), region: region.optional() }).refine(r => r.sourceResourceId !== r.candidateResourceId && r.sourceEndMs - r.sourceStartMs >= 100 && r.sourceEndMs - r.sourceStartMs <= 30000, { message: '原片与候选须不同，源范围为0.1–30秒。' });
const base = projectId => '/api/projects/' + encodeURIComponent(projectId) + '/video-reworks';
export function registerVideoReworkTools(tool, client) {
    if (!client.workspace) return;
    tool('yingce_video_rework_history', '从服务端找回具体片段的修复历史。按nextCursor继续加载；跨片段游标无效。读取不提交任务，用taskId读取完整固定输入并继续比较或预览采用。', { projectId: id, clipId, cursor: z.string().max(1024).optional(), limit: z.number().int().min(1).max(50).default(10) }, true,
        ({ projectId, ...query }, signal) => client.request('GET', base(projectId) + '/history?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])), undefined, { signal }));
    tool('yingce_video_rework_source', '读取某个已保存视频片段使用实例及原片实际SHA、尺寸和时长。修复绑定clipId/clipSha256和源时间；不能用同一素材的另一次使用替代。', { projectId: id, clipId }, true,
        ({ projectId, clipId }, signal) => client.request('GET', base(projectId) + '/source?' + new URLSearchParams({ clipId }), undefined, { signal }));
    tool('yingce_video_rework_media', '检查已有候选视频的实际资源SHA、尺寸、时长和音轨。候选须与原片像素尺寸一致并覆盖所选源时长；只读，不运行模型。', { projectId: id, resourceId }, true,
        ({ projectId, resourceId }, signal) => client.request('GET', base(projectId) + '/media?' + new URLSearchParams({ resourceId }), undefined, { signal }));
    tool('yingce_create_video_rework', '按明确授权，用本地FFmpeg将已有候选合成所选时间/像素区域，另存候选，不改变剪辑。无生成模型费用。提交前持久保存完整正文及requestId；未知回复查原编号，不换编号。采用/撤销另走timeline edits预览确认。', { projectId: id, requestId, expectedRevision: z.number().int().min(0), edit, confirmCompose: z.literal(true) }, false,
        ({ projectId, confirmCompose, ...body }, signal) => { if (!confirmCompose) throw new Error('需要明确授权合成所选范围。'); return client.request('POST', base(projectId), body, { signal }); });
    tool('yingce_video_rework_status', '按原修复请求编号核对唯一原生任务。关闭页面或响应丢失后先查这里；不再次合成，不修改剪辑。', { projectId: id, requestId }, true,
        ({ projectId, requestId }, signal) => client.request('GET', base(projectId) + '/by-request?' + new URLSearchParams({ requestId }), undefined, { signal }));
}
