import * as z from 'zod/v4';

const id=z.string().min(1).max(128).regex(/^[\p{L}\p{N}_:.-]+$/u);
const requestId=z.string().min(16).max(128).regex(/^[!-~]+$/);
const ms=z.number().int().min(0).max(86400000);
const anchor=z.strictObject({line:z.number().int().min(0).max(399),startSpanId:id.optional(),endSpanId:id.optional(),startMs:ms.optional(),endMs:ms.optional(),reviewed:z.boolean()});
const input={projectId:id,transcriptId:id,requestId,expectedRevision:z.number().int().positive(),sourceRevisionId:id,lyrics:z.string().min(1).max(65536),anchors:z.array(anchor).max(200)};
const base=project=>'/api/projects/'+encodeURIComponent(project)+'/transcripts';
const item=(project,transcript)=>base(project)+'/'+encodeURIComponent(transcript);

export function registerLyricsTools(tool,client){
    if(!client.workspace)return;
    const request=(method,route,body,signal)=>client.request(method,route,body,{signal});
    tool('yingce_list_transcripts','分页读取拥有项目的原生文字稿；用于寻找歌曲识别和歌词版本，不运行识别。',{projectId:id,resourceId:id.optional(),archived:z.boolean().default(false),cursor:id.optional()},true,
        ({projectId,...query},signal)=>request('GET',base(projectId)+'?'+new URLSearchParams(Object.entries({...query,pageSize:30}).filter(([,v])=>v!==undefined)),undefined,signal));
    tool('yingce_adopt_transcript','将已有成功识别任务登记为原生文字稿；相同来源只登记一次，不再次调用模型。',{projectId:id,taskId:id,title:z.string().max(240).optional()},false,
        ({projectId,...body},signal)=>request('POST',base(projectId),body,signal));
    tool('yingce_read_transcript','读取原生文字稿当前或指定历史版本。歌词时间对齐需读取原识别固定版本及真实词编号，不能均分时间。',{projectId:id,transcriptId:id,revisionId:id.optional()},true,
        ({projectId,transcriptId,revisionId},signal)=>request('GET',item(projectId,transcriptId)+(revisionId?'/versions/'+encodeURIComponent(revisionId):''),undefined,signal));
    tool('yingce_transcript_history','读取原识别、人工校正及歌词固定版本历史。',{projectId:id,transcriptId:id,beforeVersion:z.number().int().positive().optional()},true,
        ({projectId,transcriptId,beforeVersion},signal)=>request('GET',item(projectId,transcriptId)+'/versions?'+new URLSearchParams({pageSize:30,...(beforeVersion?{beforeVersion}:{})}),undefined,signal));
    tool('yingce_preview_lyrics','预览完整歌词与真实原词时间。缺失句子无自动时间，重复副歌要明确原词范围，人工标记独立注明。用户未逐句试听确认不得擅自把 reviewed 全设为 true。',input,true,
        ({projectId,transcriptId,...body},signal)=>request('POST',item(projectId,transcriptId)+'/lyrics-preview',body,signal));
    tool('yingce_apply_lyrics','仅在用户逐句核对时间并明确要求保存后使用。保存原生新版本并保留原识别。请求和预览令牌必须完全一致；响应未知先查原编号，不能新建编号重做。',{...input,previewToken:z.string().regex(/^[a-f0-9]{64}$/),confirmReviewed:z.literal(true)},false,
        ({projectId,transcriptId,confirmReviewed,...body},signal)=>{if(!confirmReviewed)throw new Error('需要用户明确核对。');return request('POST',item(projectId,transcriptId)+'/lyrics-apply',body,signal);});
    tool('yingce_lyrics_result','按原编号找回已保存歌词版本。current=false表示有后续修改，不得把旧回执重新采用覆盖当前版本。',{projectId:id,transcriptId:id,requestId},true,
        ({projectId,transcriptId,requestId},signal)=>request('GET',item(projectId,transcriptId)+'/lyrics-results/'+encodeURIComponent(requestId),undefined,signal));
}
