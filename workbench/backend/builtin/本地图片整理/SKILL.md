---
name: "本地图片整理"
description: "对现有图片进行网格切分、原像素裁剪或插值缩放，保留原图并保存具体素材版本。适用于无需生成新画面的图片整理；按对象生成透明图层、补画和AI超分使用其他能力。"
metadata:
  version: "1.0.0"
  author: "影策"
  owner: "yingce-system"
  skillId: "yingce-local-image-process"
  tag: creative
  sortWeight: 881
  source: 3
  createdAt: 1792800000000
  updatedAt: 1792800000000
  initialLikeCount: 0
  initialAddedCount: 0
---

# 本地图片整理

使用 `canvas_get_state` 读取当前画布，核对用户指定的已保存源图片节点。多个源图且用户未指定时先询问；不要猜测图片编号。只读模式不能处理图片。

参数已明确时直接调用 `image_process` 提交配方，平台会先显示原尺寸、输出数量和配方，等待用户在审批卡确认。不要以聊天中的“请确认”或 `ask_user` 替代审批卡。批准前不能创建替代任务、改图或写入画布。

配方中的尺寸参数必须放在操作同名对象内：

- 2行3列均分：`{"sourceNodeId":"读取到的节点ID","recipe":{"operation":"split","split":{"rows":2,"columns":3}}}`。省略分割线数组；行列数不放在 `recipe` 根层。非均匀切分仅使用用户给定或界面确认的归一化分割线。
- 原像素裁剪：`recipe={"operation":"crop","crop":{"x":0.1,"y":0.1,"width":0.8,"height":0.8}}`。区域相对于正确朝向的原图；未指定区域时先明确意图，不把示例区域当成用户选择。
- 保持比例缩放：`recipe={"operation":"resize","resize":{"targetLongEdge":1024,"algorithm":"high"}}`。按用户要求选择长边与算法；插值不会补出真实细节，不声称AI超分。

每次只提交一种配方。该工具使用CPU，不调用图片、视频或音频模型；Agent对话的文字模型仍按宿主规则运行。不要转用 `generate_media` 或 `image_layer_split` 完成几何切图。

任务完成后，宿主会保存每张输出的资源、素材版本与来源配方，并添加为新节点连回原图。核对真实工具回执；不要再次用画布写入工具复制节点，也不要仅凭文字声称成功。源图被替换、删除或结果采用已撤销时，明确报告当前情况，保留素材，不覆盖用户修改。

失败时按具体回执处理：参数错误先修正；保存失败恢复原任务；未知提交核对原编号。用户未要求重新制作时，不创建另一轮处理来掩盖失败。完成报告说明实际输出数量、采用状态及仍需用户处理的事项。
