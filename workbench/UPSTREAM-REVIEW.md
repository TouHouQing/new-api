# 影策上游 158 项提交整合记录

上游主线：`ddcat-ai/open-ai-canvas:main`，固定提交 `82fc5c03233c33380a5335146c50bb507deb5692`。共同基线 `9fdebd07841b71caf4fa5e116b8a3b8af3a959ea`。整合前自有分支 `6fb619af8d7c46364ee8e9e0da06f137ef7c8bb2`。

采用真实合并保留全部 158 项提交历史，以其最终源码和界面为主。短剧流水线、全局 Agent、文档记忆、技能发现、多版本媒体、预演双模式、素材与进度修复均已纳入。原有原生制作项目、剪辑时间线、局部返工、CPU 图片工具、MCP 和恢复回执继续保留。此表说明源码取舍，不等同于每项功能已完成人工验收。

## 合并边界

- 上游短剧制作保留 `/projects`，原扩展制作中心迁至 `/production`；旧项目编号由归属校验后兼容打开。
- 原 Schema 1–71 不改名、不改校验和；上游新迁移按 72–91 追加，保留 SQLite、MySQL、PostgreSQL。
- 上游工具采用统一注册；保留原生制作、图片处理和历史读取工具，写操作仍检查授权和审批。
- New API 是内置部署的账号、模型渠道、分组权限和账单来源；独立影策的管理和支付源码保留，内置模式统一进入宿主管理。
- 保留可执行的官方 `.yingce-plugin` 插件包；仅排除下列 36 个可从源码重建的散落程序，避免把平台和开发机架构产物混入仓库。

## 逐项记录

| # | 提交 | 内容 | 处理 |
| --- | --- | --- | --- |
| 1 | [6c6fbcee](https://github.com/ddcat-ai/open-ai-canvas/commit/6c6fbceee3b836c0daaaf0e9372f179cddf3f32b) | feat(agent): 预演台 Agent - 新增扇巴掌/牵手/被打动作与落地规则 | 采用上游最终实现，保留自有制作扩展 |
| 2 | [91f00e77](https://github.com/ddcat-ai/open-ai-canvas/commit/91f00e77e363965e26c86d8115c22488fb34fe6a) | feat(previs): 预演台 - 重构为摆场/动画双模式并新增带预览的添加弹窗 | 采用上游最终实现，保留自有制作扩展 |
| 3 | [d17da6cd](https://github.com/ddcat-ai/open-ai-canvas/commit/d17da6cd64f0bce9c564f3927af16ae8d09afb6c) | docs(previs): 预演台 - 同步待测试清单 | 保留文档与发行记录 |
| 4 | [8d822260](https://github.com/ddcat-ai/open-ai-canvas/commit/8d82226055260afc698a2c20a10c0c007ba9a142) | fix(agent): 画布写操作 - 更新不存在节点按可恢复参数错误返回 | 采用上游最终实现，保留自有制作扩展 |
| 5 | [8ec43709](https://github.com/ddcat-ai/open-ai-canvas/commit/8ec4370993cbc7294bb32ad10b6228b03fafa6aa) | fix(workspace): 账户菜单 - 修复减少动态效果下 Popover 停留在屏幕外 | 采用上游最终实现，保留自有制作扩展 |
| 6 | [c4c0ba6d](https://github.com/ddcat-ai/open-ai-canvas/commit/c4c0ba6d4f70b69f5fb0d25d2bdba7aa4d467115) | fix(canvas): 自动整理 - 改为按连通分量分层布局并绕开固定节点避免重叠 | 采用上游最终实现，保留自有制作扩展 |
| 7 | [b18af97b](https://github.com/ddcat-ai/open-ai-canvas/commit/b18af97bc6de623b08d0c1bb2f05e4dd16f91a7b) | fix(web): 客户端 ID - 局域网 HTTP 访问时兼容缺失的 crypto.randomUUID | 采用上游最终实现，保留自有制作扩展 |
| 8 | [752b5208](https://github.com/ddcat-ai/open-ai-canvas/commit/752b520808f57c04b97ffcba2b3b32b8f03fd96d) | docs(progress): 待测试 - 同步 Agent 参数错误、账户菜单、自动整理与局域网 UUID 修复 | 保留文档与发行记录 |
| 9 | [754415af](https://github.com/ddcat-ai/open-ai-canvas/commit/754415af2fc455aea1299cb2651995aee7143aeb) | feat(canvas): 画布体验 - 网格跟随视口、Dock 重写、Agent 卡顿修复与空画布入口改版 | 采用上游最终实现，保留自有制作扩展 |
| 10 | [9afdd05b](https://github.com/ddcat-ai/open-ai-canvas/commit/9afdd05b94b5ea77403843414c766c3cd7ae39b6) | feat(billing): 积分运营 - 新增冻结积分自动退回开关，默认关闭 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 11 | [0087d770](https://github.com/ddcat-ai/open-ai-canvas/commit/0087d7707b70b626caf0f614867554f80d8d6ab3) | feat(agent): 平台对话 - 支持全局单面板与可选画布绑定 | 采用上游最终实现，保留自有制作扩展 |
| 12 | [be548eb4](https://github.com/ddcat-ai/open-ai-canvas/commit/be548eb4f1b4a827a43eb79605d05a22b42a8f57) | test(web): 质量门禁 - 修复格式检查与画布回归断言 | 纳入检查与修复；合并后同步相关合同 |
| 13 | [31496b88](https://github.com/ddcat-ai/open-ai-canvas/commit/31496b88f6a69e9a8fb58dcd58714de521564881) | test(previs): 浏览器验收 - 更新 E2E 控件定位与提示验证 | 纳入检查与修复；合并后同步相关合同 |
| 14 | [f1d1f973](https://github.com/ddcat-ai/open-ai-canvas/commit/f1d1f97384411073582513091f099adb005ede13) | feat(feedback): 新增用户意见与反馈插件，支持多媒体附件上传、收件箱式答复与历史归档 | 采用上游最终实现，保留自有制作扩展 |
| 15 | [50a2c14b](https://github.com/ddcat-ai/open-ai-canvas/commit/50a2c14bc8b45e845e2462d02162fe2f8a075075) | refactor(agent): 画布 Agent - 统一工具注册与记忆审批 | 采用上游最终实现，保留自有制作扩展 |
| 16 | [cf90b8a6](https://github.com/ddcat-ai/open-ai-canvas/commit/cf90b8a6ea8a1c9d6ceafdd50c3004bb4fb6feae) | fix(ci): Agent - 修复格式与静态检查 | 采用上游最终实现，保留自有制作扩展 |
| 17 | [70dfaa2e](https://github.com/ddcat-ai/open-ai-canvas/commit/70dfaa2e8a5e0655c0f785db1ce1d1e46d9a1adf) | fix(ci): Agent runtime - 规范错误文本 | 采用上游最终实现，保留自有制作扩展 |
| 18 | [87c6375b](https://github.com/ddcat-ai/open-ai-canvas/commit/87c6375b6a41bdefa3a50aa7e432becee1c804af) | fix(admin): 后台减少动态效果 - 修复 Select 下拉等浮层停留在屏幕外 (#854) | 采用上游最终实现，保留自有制作扩展 |
| 19 | [9511cf3f](https://github.com/ddcat-ai/open-ai-canvas/commit/9511cf3fbb757502e5626e187e845f1e9ad9245a) | fix(assets): 批量上传 - 显示真实进度、收尾不卡住、部分失败不自动关窗 (#851) | 采用上游最终实现，保留自有制作扩展 |
| 20 | [c95d31ef](https://github.com/ddcat-ai/open-ai-canvas/commit/c95d31ef616ba9ed44febdb1622fce6f9716d66f) | fix(admin): 运营总览 - 当天无数据时「较前一日」不再显示 ↓100% / ↓99pp (#853) | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 21 | [33b6e7df](https://github.com/ddcat-ai/open-ai-canvas/commit/33b6e7df6928ec5d067b025d8aa9d987a8fde4b3) | fix(workspace): 图标按钮悬浮 - 上移改用 translate，不再覆盖按钮自身的居中定位 (#850) | 采用上游最终实现，保留自有制作扩展 |
| 22 | [057681af](https://github.com/ddcat-ai/open-ai-canvas/commit/057681af0ef1351206b2c421f6b5db8b0fbd7640) | fix(canvas): 视频节点 - 签名地址续签时不再重建播放器 (#859) | 采用上游最终实现，保留自有制作扩展 |
| 23 | [2934d9c1](https://github.com/ddcat-ai/open-ai-canvas/commit/2934d9c11ad2aaeb38a7a7f712feb0ebc5e4160f) | feat(provider): 非视频异步轮询 - 可选的暂时性错误有限重试（默认关闭） (#861) | 采用上游最终实现，保留自有制作扩展 |
| 24 | [3d03e057](https://github.com/ddcat-ai/open-ai-canvas/commit/3d03e057b418009e505f77b26271aed01c0466e9) | fix(canvas): 画布交互 - 平滑节点比例切换并修复移动浮层定位 (#839) | 采用上游最终实现，保留自有制作扩展 |
| 25 | [4ed8d167](https://github.com/ddcat-ai/open-ai-canvas/commit/4ed8d1676ee96bcfa728d6734a8822d8ec982767) | feat(provider): AI 渠道 - 新增 Cheaper Inference Chat 协议插件 (#865) | 采用上游最终实现，保留自有制作扩展 |
| 26 | [4cbb1134](https://github.com/ddcat-ai/open-ai-canvas/commit/4cbb11347f11a987427ad087982a1641576c8dab) | fix(database): 渠道模型协议 - 扩展协议标识长度至 64 字符 | 采用上游最终实现，保留自有制作扩展 |
| 27 | [4cbe2f93](https://github.com/ddcat-ai/open-ai-canvas/commit/4cbe2f934a8fae181ba56fd453b74cc52c4aba5f) | feat(protocol): MaxForAI 视频 - 新增双入口声明式协议插件 | 采用上游最终实现，保留自有制作扩展 |
| 28 | [1dc4f7cd](https://github.com/ddcat-ai/open-ai-canvas/commit/1dc4f7cdbbce75af8ad19e8cabbba91e712b1de1) | fix(video): NewAPI 素材限制 - 按模型能力动态校验 | 采用上游最终实现，保留自有制作扩展 |
| 29 | [a048f0c8](https://github.com/ddcat-ai/open-ai-canvas/commit/a048f0c838eb898f32b50e9dbb25452acc3d30a5) | feat(assets): 素材库批量上传 - 显示失败原因并支持拖放 | 采用上游最终实现，保留自有制作扩展 |
| 30 | [729ec3c9](https://github.com/ddcat-ai/open-ai-canvas/commit/729ec3c94ce7e0bb0c1760b254b2b4faa446d58f) | fix(agent): 媒体生成 - 单参考图尺寸遵循模型预设 | 采用上游最终实现，保留自有制作扩展 |
| 31 | [c7a0457b](https://github.com/ddcat-ai/open-ai-canvas/commit/c7a0457bc1eebc88fe2503504727176e107dd38c) | fix(agent): 审批恢复 - 清除旧续跑提示并回传本次结果 | 采用上游最终实现，保留自有制作扩展 |
| 32 | [7066f10a](https://github.com/ddcat-ai/open-ai-canvas/commit/7066f10ade889dbfde4a7f4931aa6e655fc8dea5) | fix(agent): Pi 运行 - 按未完成待办催办并说明操作 | 采用上游最终实现，保留自有制作扩展 |
| 33 | [ed8cbee8](https://github.com/ddcat-ai/open-ai-canvas/commit/ed8cbee81ed3398f9dd3692e93148bb8725b185e) | fix(error): 上游失败 - 区分模型服务不可用与网络异常 | 采用上游最终实现，保留自有制作扩展 |
| 34 | [5153c9c3](https://github.com/ddcat-ai/open-ai-canvas/commit/5153c9c3d8b24ba7814d534389d453c411ea0c35) | test(agent): Pi 恢复 - 覆盖催办续跑与审批提示清理 | 纳入检查与修复；合并后同步相关合同 |
| 35 | [2982a9c0](https://github.com/ddcat-ai/open-ai-canvas/commit/2982a9c0c7b74374f558b477d6b72c68577a457d) | feat(canvas): 画布连线 - 增加动态交互反馈并修复目标命中与拖线预览 | 采用上游最终实现，保留自有制作扩展 |
| 36 | [8e8d78a5](https://github.com/ddcat-ai/open-ai-canvas/commit/8e8d78a5b498e1fe0dcc834ae7e4da1d0a58aa6e) | fix(agent): 画布快照哈希 - 不计入节点层 createdAt/updatedAt (#856) | 采用上游最终实现，保留自有制作扩展 |
| 37 | [26072bac](https://github.com/ddcat-ai/open-ai-canvas/commit/26072bac42fc4f9a3cdc7f529d7fb3ececebd73c) | fix(provider): 视频轮询 - 读写阶段连接重置不再判为永久失败 (#855) | 采用上游最终实现，保留自有制作扩展 |
| 38 | [bf9e4056](https://github.com/ddcat-ai/open-ai-canvas/commit/bf9e40561d9791241da61f68618b80eee511bef3) | fix(create): 快速创作结果 - 修复视频先挂历史地址再换签名地址、重开对话先闪空态 (#852) | 采用上游最终实现，保留自有制作扩展 |
| 39 | [a934a655](https://github.com/ddcat-ai/open-ai-canvas/commit/a934a655f175b1bc41af8d92fa8c26493699ef70) | chore(release): 版本发布 - 更新 v1.6.9.1 元数据与日志 | 保留文档与发行记录 |
| 40 | [dc7203a9](https://github.com/ddcat-ai/open-ai-canvas/commit/dc7203a9fdff6e9c082d88f928bd707ab851c0cf) | fix(canvas): 放大编辑 - 修复资产引用菜单焦点和点击 (#872) | 采用上游最终实现，保留自有制作扩展 |
| 41 | [f45e5b41](https://github.com/ddcat-ai/open-ai-canvas/commit/f45e5b41184bf9c25e9b768c510998beb595c374) | fix(provider): 错误分类 - 中文内容安全拒绝不再误报为参数错误 (#878) | 采用上游最终实现，保留自有制作扩展 |
| 42 | [389bd2bc](https://github.com/ddcat-ai/open-ai-canvas/commit/389bd2bcab72d895ca581720124c83dbf9795370) | feat(feedback): 用户反馈 - 合并反馈插件并修复主线冲突与检查 | 采用上游最终实现，保留自有制作扩展 |
| 43 | [bfff29f8](https://github.com/ddcat-ai/open-ai-canvas/commit/bfff29f80f7ad04540760261bc9826a476eb319a) | fix(feedback): 用户反馈 - 修正管理员分页参数并同步接口文档 | 采用上游最终实现，保留自有制作扩展 |
| 44 | [ba21785d](https://github.com/ddcat-ai/open-ai-canvas/commit/ba21785d1c4732535e868c8a949ef125f5d0b205) | fix(create,tooltip): 增强思考与流式按钮激活态视觉高亮，并修复 Tooltip 浮层偶发漂移到屏幕左上角的定位问题 (#846) | 采用上游最终实现，保留自有制作扩展 |
| 45 | [84f9ad58](https://github.com/ddcat-ai/open-ai-canvas/commit/84f9ad58527dcb7d161135898c74e323a772a068) | feat(ui): 统一图片生成张数选择器为四框微调规范 [1][2][3][4▲/▼] (#842) | 采用上游最终实现，保留自有制作扩展 |
| 46 | [eef40ee6](https://github.com/ddcat-ai/open-ai-canvas/commit/eef40ee6e651d0479a45bae4618031af168d5975) | feat(models): 为个人自定义渠道及其模型增加醒目的专属标识标签 (#843) | 采用上游最终实现，保留自有制作扩展 |
| 47 | [5647e6a7](https://github.com/ddcat-ai/open-ai-canvas/commit/5647e6a7e7c8a39a73fdf0b7246a196ca81d2d38) | fix(admin): 系统模型 - 修复渠道代理地址清空后保存不生效 (#835) | 采用上游最终实现，保留自有制作扩展 |
| 48 | [e579e818](https://github.com/ddcat-ai/open-ai-canvas/commit/e579e818ec9a9bf764d10d9ccd8459a3857f3dee) | feat(audio): 画布音频播放器接入 Web Audio 真实波形提取与 60fps 游标渲染 (#845) | 采用上游最终实现，保留自有制作扩展 |
| 49 | [018acdfc](https://github.com/ddcat-ai/open-ai-canvas/commit/018acdfcab6cd400f7e9078a4709fb46b98639c0) | fix(agent): 同步跨设备画布对话并修复图片审批宽高比 (#879) | 采用上游最终实现，保留自有制作扩展 |
| 50 | [526a2b0d](https://github.com/ddcat-ai/open-ai-canvas/commit/526a2b0d403074a8275f6c5871b34faee69c106d) | fix(canvas): 视频画质增强 - 从播放器元数据补齐源时长 | 采用上游最终实现，保留自有制作扩展 |
| 51 | [889bd5d3](https://github.com/ddcat-ai/open-ai-canvas/commit/889bd5d306e169ffdb99d4ec83a6d11f41dc3db5) | test(canvas): 音频播放器 - 同步未知时长显示断言 | 纳入检查与修复；合并后同步相关合同 |
| 52 | [321c18d7](https://github.com/ddcat-ai/open-ai-canvas/commit/321c18d79a5e4b1c73042932ddf2dde81c2217eb) | fix(canvas): 视频元数据 - 修复非正时长 | 采用上游最终实现，保留自有制作扩展 |
| 53 | [19eec9bc](https://github.com/ddcat-ai/open-ai-canvas/commit/19eec9bc4e71cbb5941b9dc4139fd6487fc91015) | fix(*): 版本发布 - 修复短剧入口开关与后端测试编译 | 采用上游最终实现，保留自有制作扩展 |
| 54 | [7f787de1](https://github.com/ddcat-ai/open-ai-canvas/commit/7f787de11aa290471c5c90d9cec420987f616479) | fix(agent): 生成预算 - 明确 0 上限代表不限 | 采用上游最终实现，保留自有制作扩展 |
| 55 | [6bcc4279](https://github.com/ddcat-ai/open-ai-canvas/commit/6bcc4279fbeb6b052f526ff6304dc6764491f6a9) | fix(agent): 图片观察 - 支持批量交付与按需补看 | 采用上游最终实现，保留自有制作扩展 |
| 56 | [bc259609](https://github.com/ddcat-ai/open-ai-canvas/commit/bc2596091bfc77af5c84d54024ddbde8294029ed) | fix(agent): 审批回执 - 区分写入完成、任务提交与操作拒绝 | 采用上游最终实现，保留自有制作扩展 |
| 57 | [4b251408](https://github.com/ddcat-ai/open-ai-canvas/commit/4b251408c218b9a2b8ff590212ba41e5e68732de) | fix(canvas): 模型选择 - 隐藏二级返回标题并恢复渠道名称 | 采用上游最终实现，保留自有制作扩展 |
| 58 | [cd694236](https://github.com/ddcat-ai/open-ai-canvas/commit/cd694236f82e2851393cadc0150ebbde375cdc81) | fix(canvas): 项目资产同步 - 云端处理中断后自动恢复关联 | 采用上游最终实现，保留自有制作扩展 |
| 59 | [0a58468b](https://github.com/ddcat-ai/open-ai-canvas/commit/0a58468b66cdb5275f5a3771cd39421f38059aa8) | fix(media): 作品交付 - 对象存储故障时本地兜底、补传与计费保护 | 采用上游最终实现，保留自有制作扩展 |
| 60 | [02a4d933](https://github.com/ddcat-ai/open-ai-canvas/commit/02a4d9335a567d243359dd2501e8e94959482c13) | feat(skills): 技能工作台 - 技能包文件树编辑与批量保存生成新版本 | 采用上游最终实现，保留自有制作扩展 |
| 61 | [530b1d26](https://github.com/ddcat-ai/open-ai-canvas/commit/530b1d2670126d695ba3fe9bb1a9ccce69344c6d) | fix(agent): 云端 Agent - 媒体规格纠正、工具回执恢复、插话撤回与对话增量同步 | 采用上游最终实现，保留自有制作扩展 |
| 62 | [b4f2ab83](https://github.com/ddcat-ai/open-ai-canvas/commit/b4f2ab8363b5b7ee23e46734449001437afcc23c) | feat(payment): 存储空间 - 存储扩容套餐、容量准入与超额只读 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 63 | [80b68e48](https://github.com/ddcat-ai/open-ai-canvas/commit/80b68e480571f6d25b92a331833190ccd3f99b89) | feat(drama): 短剧流水线 - 上传小说自动拆章、剧情段视频生成与成片合成 | 采用上游最终实现，保留自有制作扩展 |
| 64 | [35f74620](https://github.com/ddcat-ai/open-ai-canvas/commit/35f74620c0227dbb5d22e6576c0a18aefc90f686) | feat(canvas): 媒体版本 - 图片视频音频节点原位重生成与版本历史 | 采用上游最终实现，保留自有制作扩展 |
| 65 | [8e379154](https://github.com/ddcat-ai/open-ai-canvas/commit/8e379154ed1b2ffa215b44d7289fd11145f18f71) | feat(canvas): 图片区域标注 - 多框编号标注替换局部重绘并重组图片工具条 | 采用上游最终实现，保留自有制作扩展 |
| 66 | [5ae9ce9f](https://github.com/ddcat-ai/open-ai-canvas/commit/5ae9ce9f277ca0322d10c5905e026f2b2f3eab57) | fix(canvas): 提示词素材引用 - 打开画布与生成前补拉 @ 素材并统一角色判定 | 采用上游最终实现，保留自有制作扩展 |
| 67 | [7f85e82a](https://github.com/ddcat-ai/open-ai-canvas/commit/7f85e82af48c4cfd0ff841b756dbacdd40c55394) | fix(canvas): 节点拖动 - 未越过拖动阈值前不预览位移，消除点击抖动 | 采用上游最终实现，保留自有制作扩展 |
| 68 | [22c399a5](https://github.com/ddcat-ai/open-ai-canvas/commit/22c399a5b8a6d9341f62dadc4d9f20c52dd7446b) | feat(canvas): Agent 画布聚焦 - Agent 修改画布后镜头跟随改动节点 | 采用上游最终实现，保留自有制作扩展 |
| 69 | [7238505a](https://github.com/ddcat-ai/open-ai-canvas/commit/7238505a5951ec40ee1a365e0d770fc9429fbe15) | perf(canvas): 画布渲染 - 缓冲节点分帧挂载下沉世界层并复用引用对象 | 采用上游最终实现，保留自有制作扩展 |
| 70 | [9e99fe07](https://github.com/ddcat-ai/open-ai-canvas/commit/9e99fe07ac4823f7eb88f052484555316c2e7730) | feat(ui): 内容库 - 我的画布拼图封面卡片与技能库单一导航重设计 | 采用上游最终实现，保留自有制作扩展 |
| 71 | [fdc85a18](https://github.com/ddcat-ai/open-ai-canvas/commit/fdc85a181dfbc4c74e4d3f5eb6be5016fb85ca1b) | refactor(ui): 全站 UI 规范 - 统一圆角动效与阴影、Toast 与 Tooltip、空态和顶栏反馈入口 | 采用上游最终实现，保留自有制作扩展 |
| 72 | [e3939b9f](https://github.com/ddcat-ai/open-ai-canvas/commit/e3939b9fee068044e8a3b92f43edae06d7148f5d) | docs(docs): 专题文档 - 同步短剧、存储套餐、技能工作台、Agent 与 UI 规范的接口表结构和待测清单 | 保留文档与发行记录 |
| 73 | [727eb5b8](https://github.com/ddcat-ai/open-ai-canvas/commit/727eb5b81880ec0215574f073ecca44959ac7803) | chore(web): 代码格式 - 按 Prettier 格式化本次新增与改动的前端文件 | 纳入检查与修复；合并后同步相关合同 |
| 74 | [0f0429db](https://github.com/ddcat-ai/open-ai-canvas/commit/0f0429db88f41466d4d248654c604dd3a4ad8cb9) | test(web): 前端测试 - 同步侧栏分隔、钱包标签与同步桩合同并将 ModelPicker 样式归位 | 纳入检查与修复；合并后同步相关合同 |
| 75 | [ff84f0bf](https://github.com/ddcat-ai/open-ai-canvas/commit/ff84f0bff691fe6f1f1a9b4fdb49689e1a9557e1) | test(web): 素材测试 - 隔离跨文件残留的画布状态，修复 CI 顺序下批量删除用例误发 PATCH | 纳入检查与修复；合并后同步相关合同 |
| 76 | [7fd98e63](https://github.com/ddcat-ai/open-ai-canvas/commit/7fd98e634b056b85ec93add8f8415939a7b050c2) | feat(models): 模型 Logo - 新增用途分类与图标库升级校验 (#902) | 采用上游最终实现，保留自有制作扩展 |
| 77 | [6f7f7769](https://github.com/ddcat-ai/open-ai-canvas/commit/6f7f7769bd98deede73c9eb1d4e3fec9c8e26ada) | chore(release): 版本发布 - v1.7.0 | 保留文档与发行记录 |
| 78 | [54c64ef5](https://github.com/ddcat-ai/open-ai-canvas/commit/54c64ef52d957312db51340adbd766de522faf52) | feat(canvas): 画布资产视图 - 顶栏切换画布/资产，按类型与版本整理节点并支持预览、重命名、设主版本与定位 | 采用上游最终实现，保留自有制作扩展 |
| 79 | [6211ff46](https://github.com/ddcat-ai/open-ai-canvas/commit/6211ff46f9cd1b240a195957e14c49dd7fe0bc8c) | perf(canvas): 画布上传 - 本地预览由磨砂渐显、上传后直接用本地图片显示，多文件并发上传并按大小计算超时 | 采用上游最终实现，保留自有制作扩展 |
| 80 | [b0a87529](https://github.com/ddcat-ai/open-ai-canvas/commit/b0a87529b1b256f6d5d881b117033d5992ddfaed) | fix(drama): 短剧制作 - 修正提示词过期范围、对白密度与台词长度、模型置灰原因、资产图 16:9 与段视频卡住等待 | 采用上游最终实现，保留自有制作扩展 |
| 81 | [c5f52b78](https://github.com/ddcat-ai/open-ai-canvas/commit/c5f52b787278e858b22a139c60f24291ebed18b8) | feat(admin): 管理后台 - 折叠侧栏在图标下显示两字名称 | 采用上游最终实现，保留自有制作扩展 |
| 82 | [bc839b56](https://github.com/ddcat-ai/open-ai-canvas/commit/bc839b56c30717a7ce75cb695e696d5c85b0369f) | feat(canvas): 画布下载 - 框选多个节点后右键批量下载图片、视频与音频 | 采用上游最终实现，保留自有制作扩展 |
| 83 | [981dcd18](https://github.com/ddcat-ai/open-ai-canvas/commit/981dcd1844cb3664d231a5a506fd7c1d47795e46) | fix(canvas): 提示词引用 - @ 素材缩略图签名过期后强刷地址并自动恢复 | 采用上游最终实现，保留自有制作扩展 |
| 84 | [18179ca4](https://github.com/ddcat-ai/open-ai-canvas/commit/18179ca4b9b5e764af7c707f6e4051970a7616d6) | feat(workbench): 创作工作台 - 切换工具时应用新工具预设，改过的提示词先确认替换或追加 | 采用上游最终实现，保留自有制作扩展 |
| 85 | [22a65aee](https://github.com/ddcat-ai/open-ai-canvas/commit/22a65aee59abe5c6dc62674d8f6928469811b869) | fix(agent): Agent 形象 - 多个 Live2D 实例只让一个渲染，悬浮形象支持收起为小圆球 | 采用上游最终实现，保留自有制作扩展 |
| 86 | [0931091b](https://github.com/ddcat-ai/open-ai-canvas/commit/0931091b62a0ed4708a75f254983a6e1c7e8c3eb) | feat(agent): 云端 Agent - 续轮交接帧携带被拒绝的操作与理由，避免重复申请 | 采用上游最终实现，保留自有制作扩展 |
| 87 | [37e49f6c](https://github.com/ddcat-ai/open-ai-canvas/commit/37e49f6c1c806c5784113c3fd35487f1dff80f79) | docs(docs): 专题文档 - 同步短剧模型目录、续轮交接帧接口与待测清单 | 保留文档与发行记录 |
| 88 | [960d6091](https://github.com/ddcat-ai/open-ai-canvas/commit/960d60914d0d3993a9508feb9bcd5e4d0e947139) | feat(drama): 短剧制作 - 段视频后处理失败时可重新处理已有视频，不重新生成也不重复扣费 | 采用上游最终实现，保留自有制作扩展 |
| 89 | [14c39fd4](https://github.com/ddcat-ai/open-ai-canvas/commit/14c39fd48842e6a95fcd684bab217303698f56ae) | docs(docs): 专题文档 - 补充短剧段视频重新处理接口与待测清单 | 保留文档与发行记录 |
| 90 | [09e186f5](https://github.com/ddcat-ai/open-ai-canvas/commit/09e186f5b4d17c34c419de599278d67e1c0331c1) | chore(release): 版本发布 - v1.7.1 | 保留文档与发行记录 |
| 91 | [89fcb53f](https://github.com/ddcat-ai/open-ai-canvas/commit/89fcb53fd65969cb58ae1eba5d18381db51819d1) | chore(web): 代码格式 - 按 Prettier 格式化短剧剧情段相关前端文件 | 纳入检查与修复；合并后同步相关合同 |
| 92 | [e9ce0604](https://github.com/ddcat-ai/open-ai-canvas/commit/e9ce0604f9896e533cd2230b3d2711bf0d3f0e85) | feat(platform): 推广中心 - 支持邀请注册、推广人管理与充值积分返佣 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 93 | [740f316f](https://github.com/ddcat-ai/open-ai-canvas/commit/740f316fc7b1a040bef6fcfceb0cd2292b88ae10) | fix(agent): 技能启用 - 删除技能后剔除失效 ID (#901) | 采用上游最终实现，保留自有制作扩展 |
| 94 | [aac66a57](https://github.com/ddcat-ai/open-ai-canvas/commit/aac66a5753e87250d320d44c81581cf56cf06f33) | fix(canvas): 画布同步 - 已应用目标值幂等收敛，瞬时并发写入原样重放 | 采用上游最终实现，保留自有制作扩展 |
| 95 | [81df6540](https://github.com/ddcat-ai/open-ai-canvas/commit/81df654080a26851ca75611748d502478120b554) | feat(model): AutoDL 视频 - 未声明工作流 ID 原样透传，画面规格支持自定义分辨率 | 采用上游最终实现，保留自有制作扩展 |
| 96 | [de09ca32](https://github.com/ddcat-ai/open-ai-canvas/commit/de09ca32b8e63af37684d2d196426820ecbfeff8) | fix(plugin): 视频插件 - MiniMax H3 与海螺首尾帧可混用参考图 | 采用上游最终实现，保留自有制作扩展 |
| 97 | [671dde59](https://github.com/ddcat-ai/open-ai-canvas/commit/671dde594a88ff5810f6683e38db6452b23c310f) | feat(drama): 短剧制作 - 逐集追加、剧本与分镜导入、台词核对、上传锁定参考图与剧情段参考图指定 | 采用上游最终实现，保留自有制作扩展 |
| 98 | [f50c9665](https://github.com/ddcat-ai/open-ai-canvas/commit/f50c9665ae8ebee836bdb8ff4b4d0942f848c2b4) | feat(web): 短剧制作台 - 逐集追加与原文编辑、镜头内联编辑、参考图调整，弹窗去磨砂减少卡顿 | 采用上游最终实现，保留自有制作扩展 |
| 99 | [e4e3a40c](https://github.com/ddcat-ai/open-ai-canvas/commit/e4e3a40c94242b8845650e4c7090ec7cb6c46ed0) | chore(release): 版本发布 - v1.7.2 | 保留文档与发行记录 |
| 100 | [dd121d79](https://github.com/ddcat-ai/open-ai-canvas/commit/dd121d79aaf8966e7008c183073069eafc324109) | docs(readme): 产品介绍 - 重写产品宣传并补充核心页面截图 | 保留文档与发行记录 |
| 101 | [d77e977a](https://github.com/ddcat-ai/open-ai-canvas/commit/d77e977a914b9758b2e8023c6c34173b9f078e0f) | docs(readme): 产品介绍 - 新增影策世界引擎内测预告 | 保留文档与发行记录 |
| 102 | [02edfcc4](https://github.com/ddcat-ai/open-ai-canvas/commit/02edfcc4dd030b8fa2794c4c403c584c66f40ca9) | feat(database): 数据结构 - Schema 75-77，新增用户分组、分组渠道、记忆文件与技能发现列，补充短剧素材引用与回查进度保留 | 保留迁移内容，顺延至本分支 89–91 |
| 103 | [d3be5724](https://github.com/ddcat-ai/open-ai-canvas/commit/d3be572455e523fc6c75d1576df9c2f035b4c724) | feat(billing): 用户分组 - 分组渠道权限、分组与模型倍率、多币种计价和充值货币 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 104 | [f8d598f3](https://github.com/ddcat-ai/open-ai-canvas/commit/f8d598f3f68cf8d01a5488bf934887229fa14a9e) | feat(plugin): 插件宿主 - 支持素材上传、幂等交单与分离式回查，新增 WAN 3.0 拼车中转官方插件 | 采用上游最终实现，保留自有制作扩展 |
| 105 | [e996fbbf](https://github.com/ddcat-ai/open-ai-canvas/commit/e996fbbfd60bad71a7f585bdfdcae5efcdec4a16) | fix(task): 作品保存 - 结果下载改为持续有进度最长 15 分钟、连续 90 秒无进度才判卡住 | 采用上游最终实现，保留自有制作扩展 |
| 106 | [69366bb1](https://github.com/ddcat-ai/open-ai-canvas/commit/69366bb1a15f8618450c0c7c5d44e686a2e8da4c) | feat(drama): 短剧制作 - 精修画布投送与采用、并行出片、分集方式、提示词参考图引用和参考图尺寸约束 | 采用上游最终实现，保留自有制作扩展 |
| 107 | [8ae4a4a1](https://github.com/ddcat-ai/open-ai-canvas/commit/8ae4a4a1ed149ce71b93fedb7865d59b7d12d2e4) | feat(agent): 云端 Agent - 个人记忆文件、技能目录自动发现与推荐安装 | 采用上游最终实现，保留自有制作扩展 |
| 108 | [3253cb37](https://github.com/ddcat-ai/open-ai-canvas/commit/3253cb373593b0d0612fdc7ac045e2452ad7f2ee) | feat(web): 用户分组 - 后台分组管理、用户分组分配与筛选、货币计价和 VIP/SVIP 徽章 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 109 | [d173f8cf](https://github.com/ddcat-ai/open-ai-canvas/commit/d173f8cfd84df1850622a2adf74d34240817f9e7) | feat(web): 云端 Agent - 记忆文件卡片与设置、回复选项卡、右侧停靠和技能推荐安装 | 采用上游最终实现，保留自有制作扩展 |
| 110 | [ee0663ae](https://github.com/ddcat-ai/open-ai-canvas/commit/ee0663ae89f0603dc6f5097477cd7ae960f6697c) | feat(web): 短剧精修画布 - 画布侧栏投送与采用，制作台并行出片、分集方式、提示词引用与剧情段弹窗重排 | 采用上游最终实现，保留自有制作扩展 |
| 111 | [dd1c4fcf](https://github.com/ddcat-ai/open-ai-canvas/commit/dd1c4fcf49d8faa688eb4f7282e8d237c0a6c358) | feat(web): 生成状态 - 画布与首页创作的阶段进度，等待中断不判失败，图片加载失败占位和动画性能 | 采用上游最终实现，保留自有制作扩展 |
| 112 | [3e8c5811](https://github.com/ddcat-ai/open-ai-canvas/commit/3e8c5811016a4e1b460a16637e4b57c1274fb1e6) | refactor(web): 全站按钮 - 墨色主按钮与实体次要按钮，去掉渐变和发光，魔法棒图标换成语义图标 | 采用上游最终实现，保留自有制作扩展 |
| 113 | [0f56d793](https://github.com/ddcat-ai/open-ai-canvas/commit/0f56d793fd82a5d611fd47499e55891b39b2ba05) | docs(docs): 专题文档 - 同步用户分组、记忆文件、短剧精修画布、并行出片与按钮规范的接口表结构和待测清单 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 114 | [c9646681](https://github.com/ddcat-ai/open-ai-canvas/commit/c9646681e5739a8bca2ce8656b26d8d96abc7eab) | chore(backend): 代码格式 - gofmt 格式化插件清单协议文件 | 纳入检查与修复；合并后同步相关合同 |
| 115 | [86c26133](https://github.com/ddcat-ai/open-ai-canvas/commit/86c2613385dcd4fe92907386fb218732fa0e1b6b) | chore(web): 代码格式 - 按 Prettier 格式化本次新增与改动的前端文件 | 纳入检查与修复；合并后同步相关合同 |
| 116 | [1ee61fd4](https://github.com/ddcat-ai/open-ai-canvas/commit/1ee61fd4cfcf76f37d903c2401e079e062c5260b) | chore(release): 版本发布 - v1.7.3 | 保留文档与发行记录 |
| 117 | [5b0e78a7](https://github.com/ddcat-ai/open-ai-canvas/commit/5b0e78a7edadfa6bf916b78f0dd499860285ed35) | fix(database): 迁移工具 - SQLite 迁移 PostgreSQL 的表清单补入 Agent 记忆文件与修订两张表 | 采用上游最终实现，保留自有制作扩展 |
| 118 | [562637ae](https://github.com/ddcat-ai/open-ai-canvas/commit/562637aef122da7518e5cae180d68162feefe79e) | test(web): 前端测试 - 同步 Agent 活动行、加节点菜单、权限图标与无底板工具条的合同 | 纳入检查与修复；合并后同步相关合同 |
| 119 | [24b5c274](https://github.com/ddcat-ai/open-ai-canvas/commit/24b5c274100c089625e5afa0cc872ac563cf4ef2) | test(agent): 云端 Agent 测试 - PostgreSQL 夹具补建用户，适配用户分组任务准入 | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 120 | [5ab88d4b](https://github.com/ddcat-ai/open-ai-canvas/commit/5ab88d4bf5b90efc4acd270f4a49d8fbada0dd74) | fix(protocol): 支持 xAI 视频协议嵌套 video.url 结果提取 (#916) | 采用上游最终实现，保留自有制作扩展 |
| 121 | [0a6f7c4d](https://github.com/ddcat-ai/open-ai-canvas/commit/0a6f7c4d345d75e9f5f596644c88410e63bb1bc6) | fix(agent): Pi 工具批次 - 普通工具结束后补送已查看图片 (#917) | 采用上游最终实现，保留自有制作扩展 |
| 122 | [87e16b30](https://github.com/ddcat-ai/open-ai-canvas/commit/87e16b30ffcaebe2dfee440d9c4f31cf0e7fdf7c) | feat(drama): 短剧制作 - 画幅按视频模型能力换算、放开视频模型限制并减少兜底 | 采用上游最终实现，保留自有制作扩展 |
| 123 | [6c51dae9](https://github.com/ddcat-ai/open-ai-canvas/commit/6c51dae934bcbb2e5714cafcc2800a85313f1229) | chore(release): 版本发布 - v1.7.3.1 短剧画幅按视频模型能力换算 | 保留文档与发行记录 |
| 124 | [4ae4d328](https://github.com/ddcat-ai/open-ai-canvas/commit/4ae4d328aaad4224410222488d9f01f2b9355fa7) | style(drama): 剧情段弹窗 - 按 Prettier 格式化修复 Web checks | 纳入检查与修复；合并后同步相关合同 |
| 125 | [14d9d31f](https://github.com/ddcat-ai/open-ai-canvas/commit/14d9d31ff11895b1af3650fe1d63e44a9a865651) | ci(quality): 发布流水线 - 后端测试分 5 片并行、tag 复用同 SHA 的 main 检查、并行化最慢用例 | 纳入检查与修复；合并后同步相关合同 |
| 126 | [43ed8625](https://github.com/ddcat-ai/open-ai-canvas/commit/43ed8625de5f05319fa58137f71438197a2c44a1) | fix(payment): 支付确认框 - 金额按订单货币显示，USD 订单不再显示为 ¥ (#922) | 独立部署保留；内置模式由 New API 管理相关账户与账单 |
| 127 | [1a688a65](https://github.com/ddcat-ai/open-ai-canvas/commit/1a688a65a3da828df9052f7915987fd88f19ba70) | style(previs): 预演台检查器 - 属性/姿态标签样式区分 (#920) | 纳入检查与修复；合并后同步相关合同 |
| 128 | [39b0ee17](https://github.com/ddcat-ai/open-ai-canvas/commit/39b0ee1736f975627ee85b53c7de78dbb4518be4) | fix(canvas): 顶栏控件 - 对齐视图切换与在线设备 (#921) | 采用上游最终实现，保留自有制作扩展 |
| 129 | [620196c5](https://github.com/ddcat-ai/open-ai-canvas/commit/620196c5a3b542459e14320806be823bb74c9f0d) | fix(plugin): MiniMax H3 视频协议 - 首帧混用参考图时按请求画幅出片 | 采用上游最终实现，保留自有制作扩展 |
| 130 | [2c174ea6](https://github.com/ddcat-ai/open-ai-canvas/commit/2c174ea6b337bc6376d7b79e7052c7af3e6fb3ac) | feat(admin): 管理后台 - 导航分组、用户调积分、渠道模型稳定性与成本价、报表口径修复 | 采用上游最终实现，保留自有制作扩展 |
| 131 | [a9ec0b44](https://github.com/ddcat-ai/open-ai-canvas/commit/a9ec0b44c4770b6284ea4e5260209cbefef5ecf9) | chore(release): 版本发布 - v1.7.3.2 MiniMax H3 首帧续接按作品画幅出片 | 保留文档与发行记录 |
| 132 | [f83c35b0](https://github.com/ddcat-ai/open-ai-canvas/commit/f83c35b0e8c203a4031f82b00e5652d02c8bd06b) | style(admin): 后台回归测试 - 按 Prettier 格式化修复 Web checks | 纳入检查与修复；合并后同步相关合同 |
| 133 | [50236887](https://github.com/ddcat-ai/open-ai-canvas/commit/50236887ebfd48adcc96fe4230402873bba3fb6d) | fix(canvas): 画布写入回执 - 回执只保存提交摘要并定期清理过期记录 | 采用上游最终实现，保留自有制作扩展 |
| 134 | [469e71ab](https://github.com/ddcat-ai/open-ai-canvas/commit/469e71ab1ed4eba28d5a70034fecf34d93385674) | feat(previs): 预演台 - 画幅比例选择与角色人偶缩略图 | 采用上游最终实现，保留自有制作扩展 |
| 135 | [7d2e70d7](https://github.com/ddcat-ai/open-ai-canvas/commit/7d2e70d70c6d184b3c9ac75df52e9b8008824805) | fix(canvas): 引用编辑器 - 复制剪切保留参考图等引用原文 | 采用上游最终实现，保留自有制作扩展 |
| 136 | [adc64a4e](https://github.com/ddcat-ai/open-ai-canvas/commit/adc64a4e1e91b3d6ab90d7d927c2673555a5502a) | feat(drama): 短剧流水线 - 提示词按模型上限撰写与自动精简、表演运镜与节奏档位、视频分辨率、步骤模型与技能 | 采用上游最终实现，保留自有制作扩展 |
| 137 | [e7cbcb69](https://github.com/ddcat-ai/open-ai-canvas/commit/e7cbcb698f9638e5e44c6b7121e614a340e49aba) | feat(drama): 短剧制作台 - 步骤模型与技能、参考图分模型、视频分辨率、表演运镜与节奏滑杆、素材库选参考图 | 采用上游最终实现，保留自有制作扩展 |
| 138 | [81295a97](https://github.com/ddcat-ai/open-ai-canvas/commit/81295a9758adfb9d27cf9a28768cb8b5c1b09bae) | docs(drama): 短剧文档 - 同步设置字段、提示词上限、流式文本任务与待测试清单 | 保留文档与发行记录 |
| 139 | [c38bbd3b](https://github.com/ddcat-ai/open-ai-canvas/commit/c38bbd3b4b180d2dd906cc6c517ccb5b17d4560d) | docs(readme): 项目说明 - 调整快速开始与文档入口 | 保留文档与发行记录 |
| 140 | [44a0e207](https://github.com/ddcat-ai/open-ai-canvas/commit/44a0e2076f27417d2cfd80593043ed90470d9ea3) | chore(release): 版本发布 - v1.7.3.3 短剧提示词上限、表演运镜与步骤配置 | 保留文档与发行记录 |
| 141 | [ec23e187](https://github.com/ddcat-ai/open-ai-canvas/commit/ec23e187e4a87cb84542ad8e79efd05ebef6b011) | docs(readme): 产品截图 - 更新管理后台渠道与分镜截图 | 保留文档与发行记录 |
| 142 | [b18dee00](https://github.com/ddcat-ai/open-ai-canvas/commit/b18dee00bd86ac5f6831d9a7c2ffdba2fb5302bf) | docs(readme): 致谢 - 3D 预演台赞助用户移至底部并新增 fochaobaby，贡献者改为三列卡片 | 保留文档与发行记录 |
| 143 | [8a836d30](https://github.com/ddcat-ai/open-ai-canvas/commit/8a836d30fcf46d6262eccb81b7773bb6b7c1ce8f) | fix(agent): 角色卡 - 补全设定参数类型与字段错误回执 (#925) | 采用上游最终实现，保留自有制作扩展 |
| 144 | [eeccf718](https://github.com/ddcat-ai/open-ai-canvas/commit/eeccf718e8ad78aee98ca49d142d0594ea7000b2) | fix(agent): 独立运行时 - 按连接状态排队与取消会话 (#926) | 采用上游最终实现，保留自有制作扩展 |
| 145 | [85f6ebc1](https://github.com/ddcat-ai/open-ai-canvas/commit/85f6ebc18a72842b150ac91244123644c20de553) | fix(canvas): 生成结果持久化 - 区分缺失快照与明确删除 (#927) | 采用上游最终实现，保留自有制作扩展 |
| 146 | [74d3f871](https://github.com/ddcat-ai/open-ai-canvas/commit/74d3f87125d71ff58b71e9068ffe1e2f2d814ed2) | fix(assets): 素材包导入 - 重建目标账号的资源引用 (#928) | 采用上游最终实现，保留自有制作扩展 |
| 147 | [0055130f](https://github.com/ddcat-ai/open-ai-canvas/commit/0055130f2d6764ee199b915d63e768024d0f66c9) | fix(assets): 全量操作 - 按服务端完整素材集合导出与清空 (#929) | 采用上游最终实现，保留自有制作扩展 |
| 148 | [a4f468ca](https://github.com/ddcat-ai/open-ai-canvas/commit/a4f468ca364d4339ac5472ca6f4c4f3ee6dfd885) | fix(plugin): 协议发行 - 统一打包来源并同步视频协议源码 (#930) | 采用上游最终实现，保留自有制作扩展 |
| 149 | [2fa2bdde](https://github.com/ddcat-ai/open-ai-canvas/commit/2fa2bddeaf999e408f328d509b40bd850ba1976d) | fix(updater): 升级备份 - 在旧服务停止后保存最终快照 (#931) | 采用上游最终实现，保留自有制作扩展 |
| 150 | [56ca2402](https://github.com/ddcat-ai/open-ai-canvas/commit/56ca240210f52e8bdc845f1f3aa14335fd14d36a) | fix(backend): 演示站反馈 - 作品花费按计费订单汇总、视频真实尺寸、成片裁切适配与 AIGC 标识、切段时长与 Agent 读取时效 | 采用上游最终实现，保留自有制作扩展 |
| 151 | [e55eb114](https://github.com/ddcat-ai/open-ai-canvas/commit/e55eb114ba60166e9d6d49effa242e4f49bbea15) | fix(web): 演示站反馈 - 小影遮挡、弹层贴边、文字识别、报价与费用显示、精剪输出规格、时间线范围、技能说明与窄屏短剧 | 采用上游最终实现，保留自有制作扩展 |
| 152 | [90d82c6f](https://github.com/ddcat-ai/open-ai-canvas/commit/90d82c6f56e0690dd1e29d1ea22c85fadba48d9d) | feat(canvas): 图生图 - 默认跟随参考图比例 | 采用上游最终实现，保留自有制作扩展 |
| 153 | [b3fb0d14](https://github.com/ddcat-ai/open-ai-canvas/commit/b3fb0d145ddf83ca23fdeb8648a9efc8f3a2893d) | fix(canvas): 画布交互 - 新建菜单悬停不跳动、顶栏视图切换改为图标胶囊 | 采用上游最终实现，保留自有制作扩展 |
| 154 | [d0d7ddab](https://github.com/ddcat-ai/open-ai-canvas/commit/d0d7ddabacea900e3ffef0fda3899ba1697e2f19) | feat(canvas): 提示词引用 - @ 引用悬停预览，生成节点标题不显示引用编码 | 采用上游最终实现，保留自有制作扩展 |
| 155 | [b2dc8e15](https://github.com/ddcat-ai/open-ai-canvas/commit/b2dc8e15b369f8ecc2fcf5f5a56af9dfa1fdf4b0) | docs(readme): 赞助商 - 新增源点动力 | 保留文档与发行记录 |
| 156 | [fb047244](https://github.com/ddcat-ai/open-ai-canvas/commit/fb0472445d2335d44bb6dd0ad185d0f3af139098) | fix(web): 代码格式 - 修复 Web checks 格式检查失败的三个文件 | 采用上游最终实现，保留自有制作扩展 |
| 157 | [db7259b6](https://github.com/ddcat-ai/open-ai-canvas/commit/db7259b62d77d84818ecb7d708ebf45e9ff81beb) | ci(repo): 推送前验证 - 新增本地并行验证脚本并写入 AGENTS 推送纪律 | 纳入检查与修复；合并后同步相关合同 |
| 158 | [82fc5c03](https://github.com/ddcat-ai/open-ai-canvas/commit/82fc5c03233c33380a5335146c50bb507deb5692) | feat(workbench): 图片/视频生成 - 电商出品页改版，支持一次生成多张图片和多条视频 | 采用上游最终实现，保留自有制作扩展 |

## 排除的可重建程序

- `backend/server`
- `plugin-packages/official-payment-alipay-page/backend/provider`
- `plugin-packages/official-payment-alipay-page/backend/provider-darwin-amd64`
- `plugin-packages/official-payment-alipay-page/backend/provider-darwin-arm64`
- `plugin-packages/official-payment-alipay-page/backend/provider-linux-amd64`
- `plugin-packages/official-payment-alipay-page/backend/provider-linux-arm64`
- `plugin-packages/official-payment-alipay-page/backend/provider-windows-amd64.exe`
- `plugin-packages/official-payment-alipay-page/backend/provider-windows-arm64.exe`
- `plugin-packages/official-payment-epay/backend/provider`
- `plugin-packages/official-payment-epay/backend/provider-darwin-amd64`
- `plugin-packages/official-payment-epay/backend/provider-darwin-arm64`
- `plugin-packages/official-payment-epay/backend/provider-linux-amd64`
- `plugin-packages/official-payment-epay/backend/provider-linux-arm64`
- `plugin-packages/official-payment-epay/backend/provider-windows-amd64.exe`
- `plugin-packages/official-payment-epay/backend/provider-windows-arm64.exe`
- `plugin-packages/official-payment-wechat-native/backend/provider`
- `plugin-packages/official-payment-wechat-native/backend/provider-darwin-amd64`
- `plugin-packages/official-payment-wechat-native/backend/provider-darwin-arm64`
- `plugin-packages/official-payment-wechat-native/backend/provider-linux-amd64`
- `plugin-packages/official-payment-wechat-native/backend/provider-linux-arm64`
- `plugin-packages/official-payment-wechat-native/backend/provider-windows-amd64.exe`
- `plugin-packages/official-payment-wechat-native/backend/provider-windows-arm64.exe`
- `plugin-packages/official-payment-xunhupay/backend/provider`
- `plugin-packages/official-payment-xunhupay/backend/provider-darwin-amd64`
- `plugin-packages/official-payment-xunhupay/backend/provider-darwin-arm64`
- `plugin-packages/official-payment-xunhupay/backend/provider-linux-amd64`
- `plugin-packages/official-payment-xunhupay/backend/provider-linux-arm64`
- `plugin-packages/official-payment-xunhupay/backend/provider-windows-amd64.exe`
- `plugin-packages/official-payment-xunhupay/backend/provider-windows-arm64.exe`
- `plugin-packages/official-payment-zhifufm/backend/provider`
- `plugin-packages/official-payment-zhifufm/backend/provider-darwin-amd64`
- `plugin-packages/official-payment-zhifufm/backend/provider-darwin-arm64`
- `plugin-packages/official-payment-zhifufm/backend/provider-linux-amd64`
- `plugin-packages/official-payment-zhifufm/backend/provider-linux-arm64`
- `plugin-packages/official-payment-zhifufm/backend/provider-windows-amd64.exe`
- `plugin-packages/official-payment-zhifufm/backend/provider-windows-arm64.exe`
