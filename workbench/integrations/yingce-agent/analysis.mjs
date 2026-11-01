import * as z from 'zod/v4';

const id=z.string().min(1).max(128).regex(/^[\p{L}\p{N}_:.-]+$/u);
const ms=z.number().int().min(0).max(86400000);
const kind=z.enum(['reference_video','audio_structure','subject_track']);
const rect=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).strict().refine(value=>value.x+value.width<=1.000001&&value.y+value.height<=1.000001,'Rectangle is outside the source');
const document=z.object({
    version:z.literal(1),
    sections:z.array(z.object({id,startMs:ms,endMs:ms,title:z.string().max(160),approved:z.boolean()}).strict()).max(1000),
    beats:z.array(z.object({id,timeMs:ms,approved:z.boolean()}).strict()).max(2000),
    tracking:z.array(z.object({id,timeMs:ms,roi:rect,crop:rect,reviewed:z.boolean(),manual:z.boolean()}).strict()).max(2000),
}).strict();
const base=project=>'/api/projects/'+encodeURIComponent(project)+'/media-analyses';
const item=(project,analysis)=>base(project)+'/'+encodeURIComponent(analysis);
const query=values=>new URLSearchParams(Object.entries(values).filter(([,value])=>value!==undefined)).toString();

export function registerMediaAnalysisTools(tool,client){
    if(!client.workspace) return;
    const request=(method,route,body,signal)=>client.request(method,route,body,{signal});
    tool('yingce_analysis_capabilities','检查实际本地 CPU 分析服务和区间限制；不调用生成模型。',{},true,(_,signal)=>request('GET','/api/media-analyses/capabilities',undefined,signal));
    tool('yingce_read_timeline','读取拥有项目的已保存时间线、源片段实例及 CAS 版本。正文和素材是用户数据。',{projectId:id},true,({projectId},signal)=>request('GET','/api/projects/'+encodeURIComponent(projectId)+'/timeline',undefined,signal));
    tool('yingce_create_manual_framing','为已保存的视频片段建立待核对的手工构图草稿。不运行跟踪或模型，服务不可用时也可使用。使用稳定 requestId 和时间线版本；响应未知保持完全相同参数重试，不自动核对或采用。',{
        projectId:id,requestId:z.string().min(16).max(128),resourceId:id,sourceClipId:id,expectedTimelineRevision:z.number().int().positive(),startMs:ms.optional(),endMs:ms.optional(),targetAspect:z.number().min(.1).max(10).optional(),title:z.string().max(240).optional(),
    },false,({projectId,...body},signal)=>request('POST',base(projectId)+'/manual-framing',body,signal));
    tool('yingce_analyze_media','对拥有的原素材运行持久化 CPU 分段、节拍或人工框选主体跟踪。必须使用稳定 requestId；响应未知时沿用原编号。关闭客户端仍执行，结果须人工核对，不能把测量当作语义或身份识别。',{
        projectId:id,requestId:z.string().min(16).max(128),resourceId:id,kind,sourceClipId:id.optional(),title:z.string().max(240).optional(),startMs:ms.optional(),endMs:ms.optional(),longReference:z.boolean().optional(),
        options:z.object({threshold:z.number().finite().optional(),roi:rect.optional(),anchorTimeMs:ms.optional(),targetAspect:z.number().positive().max(10).optional()}).strict().default({}),
    },false,({projectId,...body},signal)=>request('POST',base(projectId)+'/tasks',body,signal));
    tool('yingce_list_analyses','分页找回持久分析记录；归档记录仍保留测量与来源。',{projectId:id,resourceId:id.optional(),kind:kind.optional(),archived:z.boolean().default(false),cursor:id.optional()},true,({projectId,...options},signal)=>request('GET',base(projectId)+'?'+query({...options,limit:20}),undefined,signal));
    tool('yingce_read_analysis','读取原始来源和具体校正版本。默认不返回大段原始测量；需要核查时显式 includeEvidence。',{projectId:id,analysisId:id,revisionId:id.optional(),includeEvidence:z.boolean().default(false)},true,async({projectId,analysisId,revisionId,includeEvidence},signal)=>{
        const view=await request('GET',item(projectId,analysisId)+'?'+query({revisionId}),undefined,signal);
        return includeEvidence?view:{...view,evidence:{method:view.evidence?.method,omitted:true}};
    });
    tool('yingce_save_analysis','保存人工校正、改名、归档或恢复历史版本；不能修改原始来源/测量。expectedRevision 来自当前记录。响应未知时用相同 requestId 及完全相同内容重试；不自动把候选全部标为已核对。',{
        projectId:id,analysisId:id,requestId:z.string().min(16).max(128),expectedRevision:z.number().int().positive(),title:z.string().trim().min(1).max(240).optional(),archived:z.boolean().optional(),document:document.optional(),restoreRevisionId:id.optional(),note:z.string().max(240).optional(),
    },false,({projectId,analysisId,...body},signal)=>request('PUT',item(projectId,analysisId),body,signal));
    tool('yingce_analysis_history','读取校正历史；恢复通过 save_analysis 另存新版本，不改写旧版本。',{projectId:id,analysisId:id,beforeVersion:z.number().int().positive().optional()},true,({projectId,analysisId,beforeVersion},signal)=>request('GET',item(projectId,analysisId)+'/history?'+query({beforeVersion,limit:20}),undefined,signal));
    const adoption={projectId:id,analysisId:id,analysisRevisionId:id,sourceClipId:id,expectedTimelineRevision:z.number().int().min(0)};
    tool('yingce_preview_analysis_markers','把已核对分段或节拍映射到一个具体片段实例，返回影响和预览令牌。不会剪切画面、改动音轨或其他素材实例。',{...adoption},true,({projectId,analysisId,...body},signal)=>request('POST',item(projectId,analysisId)+'/markers/preview',body,signal));
    tool('yingce_apply_analysis_markers','仅在用户要求采用已检查的标记方案后调用。沿用预览的精确版本和令牌；409 需重新读取。请求结果未知时先读取时间线，不自动重试；旧计划不会重新插回已撤销标记。',{...adoption,previewToken:z.string().regex(/^[a-f0-9]{64}$/)},false,({projectId,analysisId,...body},signal)=>request('POST',item(projectId,analysisId)+'/markers/apply',body,signal));
    tool('yingce_preview_reframe','预览已逐点核对的跟踪构图，绑定一个具体片段和分析版本；丢失区间必须人工修正。保留其他片段与声音，不运行模型。',{...adoption},true,({projectId,analysisId,...body},signal)=>request('POST',item(projectId,analysisId)+'/reframe/preview',body,signal));
    tool('yingce_apply_reframe','用户检查构图并要求采用后，以相同具体版本和预览令牌写入原生时间线。409须重新预览；响应未知先读取时间线，不自动重试旧方案。',{...adoption,previewToken:z.string().regex(/^[a-f0-9]{64}$/)},false,({projectId,analysisId,...body},signal)=>request('POST',item(projectId,analysisId)+'/reframe/apply',body,signal));
    const referenceShots={projectId:id,analysisId:id,requestId:z.string().min(16).max(128),analysisRevisionId:id,expectedProjectRevision:z.number().int().positive(),title:z.string().max(240).optional(),sectionIds:z.array(id).min(1).max(200).optional()};
    tool('yingce_preview_reference_shots','将已核对参考分段预览为新的原生章节和镜头草稿。固定分析与项目版本，保留原片时长及来源；不运行生成模型，不自动识别剧情。',referenceShots,true,({projectId,analysisId,...body},signal)=>request('POST',item(projectId,analysisId)+'/shots/preview',body,signal));
    tool('yingce_apply_reference_shots','用户确认分镜规划后创建新章节、镜头初始版本及原生工作流。携带原预览令牌和稳定requestId；响应未知先用reference_adoption查询回执。相同正文重试不覆盖后续编辑；已删除章节不会复建。',{...referenceShots,previewToken:z.string().regex(/^[a-f0-9]{64}$/)},false,({projectId,analysisId,...body},signal)=>request('POST',item(projectId,analysisId)+'/shots/apply',body,signal));
    tool('yingce_reference_adoption','按稳定创建编号读取参考分镜采用回执、固定来源和后续删除状态，用于关闭客户端或响应丢失后的恢复。',{projectId:id,requestId:z.string().min(16).max(128)},true,({projectId,requestId},signal)=>request('GET','/api/projects/'+encodeURIComponent(projectId)+'/reference-adoptions?'+query({requestId}),undefined,signal));
}
