import * as z from 'zod/v4';
import {createHash} from 'node:crypto';

export function registerImageOperationTools(tool, client) {
    if (!client.workspace) return;
    const id = z.string().min(1).max(80).regex(/^[\p{L}\p{N}_:.-]+$/u);
    const requestId = z.string().min(16).max(128).regex(/^[!-~]+$/);
    const nodeId = z.string().min(1).max(128);
    tool('yingce_plan_image_layers','用户明确要求识图并确认独立识图预算后，通过影策普通文本任务规划2至8层。先用yingce_image_alpha_bounds读取原图SHA；从yingce_list_models复制支持图片输入的文本模型选择。原图、实际预览尺寸、独立图层指令和结果由后台保存，关页仍继续。0仅免费模型；不执行拆层、不自动重试模型。回复丢失保持同一idempotencyKey和完整正文，读取返回的taskId与规划历史。',{
        canvasId:id,sourceNodeId:nodeId,resourceId:id,expectedSourceSha256:z.string().regex(/^[a-f0-9]{64}$/),instructions:z.string().min(1).max(6000),purpose:z.enum(['materials','recompose']),input:z.enum(['preview','original']).default('preview'),maxCredits:z.number().finite().min(0).max(1000000),idempotencyKey:requestId,logicalModelId:id.optional(),channelId:id.optional(),channelModelKey:z.string().min(1).max(200).optional(),confirmPlanning:z.literal(true),
    },false,({canvasId,sourceNodeId,resourceId,expectedSourceSha256,instructions,purpose,input,maxCredits,idempotencyKey,logicalModelId,channelId,channelModelKey,confirmPlanning},signal)=>{
        if(!confirmPlanning||Boolean(logicalModelId)===Boolean(channelId&&channelModelKey)||logicalModelId&&(channelId||channelModelKey))throw new Error('请确认识图预算并复制一个完整且唯一的文本模型选择。');
        const clientOperationId='layer-plan:'+createHash('sha256').update(idempotencyKey).digest('hex');
        return client.request('POST','/api/tasks',{projectId:canvasId,type:'canvas_text',operation:'text',prompt:instructions,...(logicalModelId?{logicalModelId}:{model:channelModelKey}),input:{mode:'text',prompt:instructions,config:logicalModelId?{}:{channelId,model:channelModelKey},metadata:{nodeId:sourceNodeId,clientOperationId,nativeLayerPlanning:{version:1,sourceNodeId,resourceId,expectedSourceSha256,instructions,purpose,input,maxCredits}}}},{signal});
    });
    tool('yingce_image_layer_plans','按本人画布与原图分页读取保存的识图规划。包含原任务状态、已验证规划或需要修正的结果；不调用模型。使用nextCursor继续更早记录。',{
        canvasId:id,sourceNodeId:nodeId,resourceId:id,cursor:z.string().max(1024).optional(),limit:z.number().int().min(1).max(50).default(20),
    },true,({canvasId,...query},signal)=>client.request('GET','/api/canvas-projects/'+encodeURIComponent(canvasId)+'/image-layer-plans?'+new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString(),undefined,{signal}));
    const region = z.object({width:z.number().int().min(1).max(16777216),height:z.number().int().min(1).max(16777216),bbox:z.tuple([z.number().finite().min(0).max(1000),z.number().finite().min(0).max(1000),z.number().finite().min(0).max(1000),z.number().finite().min(0).max(1000)]),shape:z.enum(['rect','ellipse','rounded-rect']),radiusRatio:z.number().min(0).max(.5).optional()}).strict();
    const modelSelection=z.object({logicalModelId:id.optional(),model:z.string().max(160).optional(),prompt:z.string().min(1).max(32768),size:z.string().max(40).optional(),quality:z.string().max(40).optional()}).strict();
    tool('yingce_start_image_layer_workflow','用户明确确认完整计划和积分上限后，按2至8层固定来源一次提交原生拆层：可复用原图、免费区域提取或调用平台图片模型。后台完成尺寸整理、最多一次已批准的去背景、局部底图修补、固定素材版本与首次原生合成。关闭页面仍继续；不透明前景会提示检查，不自动付费重试。必须先读取原图alpha-bounds取得实际SHA和尺寸；不得传API key、渠道URL或猜测资源。未知回复保持相同requestId与正文，继续查询返回的原生taskId。',{
        canvasId:id,requestId,resumeTaskId:id.optional().describe('继续已停止的原拆层父任务；先读取原任务固定计划，保留原层参数，重新确认本次积分上限。后台复用已完成文件和提取结果，新建图层组。'),planningTaskId:id.optional(),sourceNodeId:nodeId,resourceId:id,expectedSourceSha256:z.string().regex(/^[a-f0-9]{64}$/),title:z.string().max(80).optional(),maxCredits:z.number().finite().min(0).max(1000000),layers:z.array(z.object({name:z.string().min(1).max(80),method:z.enum(['source','source-region','generate']),region:region.optional(),generation:modelSelection.optional(),removal:modelSelection.optional(),visible:z.boolean().optional()}).strict()).min(2).max(8),backgroundRegions:z.array(region).max(7).optional(),confirmWorkflow:z.literal(true),
    },false,({canvasId,confirmWorkflow,...body},signal)=>{
        if(!confirmWorkflow)throw new Error('请先确认当前图层计划和积分上限。');
        return client.request('POST',`/api/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-workflows`,body,{signal});
    });
    tool('yingce_image_alpha_bounds', '只读检查本人原图的实际SHA、像素尺寸及所有非零透明度的包围区域。包含16位alpha=1的边缘，不调用模型、不创建任务；empty=true时没有可裁剪内容。', {resourceId:id}, true, ({resourceId},signal) => client.request('GET',`/api/images/${encodeURIComponent(resourceId)}/alpha-bounds`,undefined,{signal}));
    tool('yingce_save_image_layer_materials', '用户明确要求后，从刚读取且ready的图层组另存透明前景素材。服务器按每层实际原文件自动裁去透明留白，保留16位像素与ICC；无需裁剪的文件复用，空图层明确跳过。原位图层保留，整批排队与来源标记原子保存，关闭页面或重启后仍完成回写。响应不明必须沿用相同requestId与来源摘要；旧回执不会恢复后来撤销的节点。', {
        canvasId:id,nodeId,requestId,sourceGroupSha256:z.string().regex(/^[a-f0-9]{64}$/),confirmSave:z.literal(true),
    },false,({canvasId,nodeId,confirmSave,...input},signal)=>{
        if(!confirmSave) throw new Error('请确认另存当前透明前景素材。');
        return client.request('POST',`/api/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-groups/${encodeURIComponent(nodeId)}/materials`,input,{signal});
    });
    tool('yingce_read_image_layer_group', '读取本人画布图层的精确资源、像素配方、文件SHA及snapshotSha256。ready仅在当前布局匹配原生合成任务和输出时为true；预览未完成不能用于成片。', {canvasId:id,nodeId}, true, ({canvasId,nodeId},signal) => client.request('GET',`/api/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-groups/${encodeURIComponent(nodeId)}/source`,undefined,{signal}));
    tool('yingce_create_image_layer_group', '用户明确要求后，把画布中1至32张已有图片按sources顺序从底到顶建立独立图层组并原子提交免费CPU合成任务。保留原图和节点，不调用模型。关闭页面仍生成并回写；返回固定nodeId/taskId及去重回执。未知回复必须沿用同一正文和requestId。width/height同时省略时采用第一张原图尺寸。', {
        canvasId:id,requestId,title:z.string().max(80).optional(),width:z.number().int().min(1).max(16777216).optional(),height:z.number().int().min(1).max(16777216).optional(),sources:z.array(z.object({nodeId,resourceId:id}).strict()).min(1).max(32),confirmCompose:z.literal(true),
    }, false, ({canvasId,confirmCompose,...input},signal) => {
        if (!confirmCompose || new Set(input.sources.map(source=>source.nodeId)).size!==input.sources.length || Boolean(input.width)!==Boolean(input.height) || input.width && input.width*input.height>16777216) throw new Error('请确认不重复的图层与有效画面尺寸。');
        return client.request('POST',`/api/canvas-projects/${encodeURIComponent(canvasId)}/image-layer-groups`,input,{signal});
    });
    tool('yingce_compose_image_layer_group', '用户确认当前图层编辑后，根据刚读取的snapshotSha256提交免费原生合成。传精确resourceId和全部compose布局，不得猜测来源；修改源后须重新读取。服务端会回写仍匹配的原图层组，迟到结果留在素材库，不覆盖新版本。未知回复必须保持相同requestId和正文。', {
        requestId,projectId:id,sourceNodeId:nodeId,resourceId:id,sourceGroupSha256:z.string().regex(/^[a-f0-9]{64}$/),confirmCompose:z.literal(true),
        compose:z.object({width:z.number().int().min(1).max(16777216),height:z.number().int().min(1).max(16777216),layers:z.array(z.object({id:nodeId,resourceId:id,x:z.number().finite(),y:z.number().finite(),opacity:z.number().min(0).max(1).default(1),visible:z.boolean().default(true)}).strict()).min(1).max(32)}).strict(),
    },false,({confirmCompose,compose,...input},signal)=>{
        if (!confirmCompose || compose.width*compose.height>16777216 || new Set(compose.layers.map(layer=>layer.id)).size!==compose.layers.length) throw new Error('请确认当前图层与有效画面尺寸。');
        const clientCompositeSignature=JSON.stringify([compose.width,compose.height,compose.layers.map(layer=>[layer.id,layer.x,layer.y,layer.visible,layer.opacity,`resource:${layer.resourceId}`])]);
        return client.request('POST','/api/images/operations',{...input,clientCompositeSignature,recipe:{operation:'compose',compose}},{signal});
    });
    const point = z.tuple([z.number().finite().min(-4096).max(16781312), z.number().finite().min(-4096).max(16781312)]);
    tool('yingce_apply_image_mask', '用户明确要求后，对拥有的原图按原始像素坐标免费提取或擦除选区。保留源RGB、位深和ICC，另存透明PNG；不补绘背景、不运行模型。笔画与真实源SHA随原生任务持久保存；响应不明沿用同一requestId，不可改参数。projectId可为拥有的制作项目或画布，sourceNodeId用于准确采用到原画布。', {
        requestId, resourceId: id, projectId: id.optional(), sourceNodeId: z.string().min(1).max(128).optional(),
        mask: z.object({ width: z.number().int().min(1).max(16777216), height: z.number().int().min(1).max(16777216), mode: z.enum(['keep','remove']), strokes: z.array(z.object({diameter:z.number().finite().min(1).max(4096),erase:z.boolean(),points:z.array(point).min(1).max(8192)}).strict()).min(1).max(256) }).strict(),
        confirmMask: z.literal(true),
    }, false, ({ confirmMask, mask, ...input }, signal) => {
        if (!confirmMask) throw new Error('请先确认原图和选区。');
        if (mask.width * mask.height > 16777216 || mask.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) > 8192) throw new Error('遮罩总像素或采样点超过处理上限。');
        return client.request('POST','/api/images/operations',{...input,recipe:{operation:'mask',mask}},{signal});
    });
    tool('yingce_adopt_image_operation', '用户明确采用已完成的免费图片处理任务到原画布。服务端核对源节点、源文件和结果身份，保存原生历史与去重回执；不会覆盖改过的源节点，不重新生成素材。', {
        taskId: id, requestId, confirmAdopt: z.literal(true),
    }, false, ({taskId, requestId, confirmAdopt}, signal) => {
        if (!confirmAdopt) throw new Error('请先确认采用图片处理结果。');
        return client.request('POST','/api/images/operations/'+encodeURIComponent(taskId)+'/apply',{requestId},{signal});
    });
}
