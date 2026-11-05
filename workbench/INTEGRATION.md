# New API 内置影策工作台

`workbench/` 是完整源码目录，不是子模块或运行时下载页面。上游提交与逐项取舍见 [UPSTREAM-REVIEW.md](UPSTREAM-REVIEW.md)。影策的短剧工作流、自由画布与预演界面为主，既有制作中心和图片工具保留为补充。

| 入口 | 用途 |
| --- | --- |
| `/studio` | 进入影策工作台 |
| `/workbench/` | 快速创作与全局 Agent |
| `/workbench/projects` | 上游短剧制作流水线 |
| `/workbench/production` | 原生制作、时间线、返工和交付 |
| `/workbench/canvas` | 自由画布、媒体版本、角色和预演 |
| `/studio/legacy` | 旧书签统一重定向到 THQ Video 工作台 |
| `/api/workbench` | 复用 New API 有效浏览器会话的业务 API |
| `/api/workbench-agent` | 用户显式配置个人访问令牌的 MCP 入口 |

## 构建与运行

托管灵感目录使用无文件扩展名的 `/api/workbench/inspirations/{name}`，避开 Nginx 对 `.json` 的磁盘静态文件规则；仍须完整打包五份灵感目录。反向代理应将 `/workbench/` 和 `/api/workbench/` 全部转发给 New API，并优先使用 `location ^~`，避免图片、脚本等同样被全站静态规则截获。

OpenAI 兼容渠道在 New API 价格目录中可能只声明通用 `openai` 端点。工作台对已知 Wan、Seedance、Sora、Veo、MiniMax-H3 视频系列及 Seedream 等图片系列补充识别；显式图片/视频端点优先，本地模型仍须通过能力就绪检查。视频沿用 New API `/v1/videos` 任务协议。目录分类不等于供应商接口验证：供应商仅提供聊天生成视频时，需要匹配的协议适配，不能将它伪装为视频任务接口。

根目录执行 `go mod download`。前端执行 `cd web && bun install --frozen-lockfile && bun run build`，同时构建 New API、影策及账号桥接模块；随后根目录执行 `go build .`。源码启动 Agent 前在 `workbench/backend/agent-runtime/pi` 执行 `npm ci --omit=dev --ignore-scripts`，需要 Node 22.19 及以上。生产镜像的根 Dockerfile 自动安装这些运行依赖、FFmpeg 和官方协议插件。

嵌入构建 `VITE_NEW_API_WORKBENCH=true` 默认将业务请求固定到同站 `/api/workbench`，避免漏设后端地址时认证恢复失败、短剧页面反复跳回登录页。独立工作台继续使用 `VITE_CANVAS_BACKEND_URL` 配置。

默认 `WORKBENCH_ENABLED=true`、`WORKBENCH_DATA_DIR=/data/workbench`（容器）。将 `/data` 持久挂载。工作台默认单独 SQLite；MySQL/PostgreSQL 配置 `WORKBENCH_DATABASE_DRIVER` 和 `WORKBENCH_DATABASE_DSN`，必须使用独立库或独立 PostgreSQL Schema。启动在迁移前检查数据库身份，拒绝连接到 New API 同一个账号库。多个工作台实例应使用共享数据库、受支持的共享媒体存储和队列协调配置，不能共享一个跨网络 SQLite 文件。

部署继续配置 New API 的 Session 密钥、HTTPS、可信来源、管理员和模型渠道。内置工作台不提供第二套注册或支付入口。Node 镜像仓库可通过 `STUDIO_NODE_BUILD_IMAGE` 指定可信镜像源；默认使用官方 Node 22.19 bookworm slim。镜像构建排除本地数据、账号文件、缓存、媒体输出和开发机依赖。

本地存储的参考素材自动沿用 New API 配置的服务器地址签发限时链接，无须重复设置 `CANVAS_PUBLIC_BASE_URL`；显式的工作台存储访问地址和环境配置仍优先。站点服务器地址应为模型能访问的公网 HTTPS 根地址。单张本地参考图直接使用一个 `input_reference` 文件字段；多张图片及音视频参考使用完整的签名 HTTPS URL 数组，保留资源归属、有效期和签名校验。

Docker 构建使用临时内存目录存放工作台依赖和 Go 编译缓存，建议为构建器提供至少 8 GB 可用内存；内存紧张时可用 `--build-arg GO_BUILD_PROCS=1` 降低编译并行数。`NPM_REGISTRY` 构建参数同时用于前端和 Agent 依赖安装，保留锁文件及完整性校验。

## 模型与计费

用户只能看到其 New API 分组中可用的模型。普通渠道按配置的端点类型分类，Responses 专用文本模型保留相应协议；本地模型通过运营方配置的 `STUDIO_LOCAL_MODEL_URL` 和 `STUDIO_LOCAL_CAPABILITY_MODELS` 获取真实能力，避免将图片、视频和专用工具错误归为文本。

OpenAI Images 默认能力明确指定像素尺寸档位：模型名以 `-2k`、`-4k` 结尾时使用对应档位，其余默认 1K，画幅按声明的预设表转换成像素。普通图片质量不会改变尺寸档位。短剧角色、场景、道具参考图与其他图片任务使用同一尺寸校验；剧情段任务使用 `metadata.dramaSegmentId`，避免被误当作普通项目镜头并要求其镜头修订编号。

本地模型服务离线时，外部 New API 视频渠道仍保留原比例或尺寸并按供应商协议提交；显式配置在 `STUDIO_LOCAL_CAPABILITY_MODELS` 的本地模型继续要求能力就绪与尺寸验证。

视频、图片、文本、Agent 及默认模型设置共用分组选择器：先选择当前用户获准使用的 New API 分组，再选择该分组中支持当前用途的模型。相同模型在不同分组保留独立选择，保存后按对应分组调用；没有对应模型的分组会解释原因并保留原选择。模型可用性与 New API 的分组模型接口一致，以渠道启用列表为准，不再因模型未展示在公开价格目录中而遗漏。缺失价格不会被解释为免费，托管菜单直接展示 New API 计费说明，不调用独立影策的报价接口。Agent 图片理解的模型替换限制在用户已选分组内。

模型描述直接使用 New API 模型配置中的内容，包括匹配前缀、后缀等规则的描述；清空后不显示固定计费提示。视频时长使用数字输入，默认 5 秒，不统一假定模型最多生成 15 秒；实际支持时长由所选服务决定，New API 请求安全边界及已验证的本地模型限制继续生效。

每用户基础文件存储容量默认为 1 GB，个人有效扩容在基础容量上叠加。已有运行策略中显式配置的容量优先于源码默认值。

工作流直接进入 New API 内部转发，不创建、启用或保存新的模型 API Key。New API 仍负责渠道权限、余额、预授权、实际用量和退款。工作台金额规范为美元；费用上限与实际费用分别显示，工作台只镜像账单，不重复维护可消费积分。当前单次授权上限为 $5；已确认零价的模型保留零费用授权，不把零解释成无限额度。

任务、租约、原始幂等编号、上游任务回执、素材和账单关联持久保存。文本原请求重放返回已保存响应；视频回查仅接受本任务自己的上游回执。取消或关闭页面后仍核对迟到的结算，未知结果先查原任务，避免重复调用。模型生成失败不代表一定没有费用。

## 账号、分享与迁移

影策账户采用 `newapi:<用户编号>` 的稳定投影，不按邮箱或昵称自动合并独立账户。每次私有请求检查有效 New API 身份，浏览器不能传用户编号伪造授权。播放资源使用短时 HttpOnly 只读 Session Cookie；写入始终需要有效认证请求，撤销 Session 后资源读取也失效。

画布分享、签名资源和审片链接保留原生过期、撤销、版本绑定与评论权限。项目所有者在 New API 被停用后，公开资源同样不可访问。MCP 使用用户自行配置的 New API 个人访问令牌，连接合同见 `integrations/yingce-agent/skills/yingce-canvas/SKILL.md`；浏览器 API 不接受它替代浏览器会话。

工作台产品名称与标识统一为 THQ Video。`/studio` 及 `/studio/legacy` 的旧入口均进入当前工作台，不再显示原 Studio 页面；历史数据保留。独立影策的作品可通过原生项目包导出、导入，在目标账号重建素材引用。迁移前保留数据库与媒体备份；不会自动覆盖独立部署或猜测账号对应关系。

个人信息通过只读 `/api/workbench/host-profile` 读取当前 New API 账号的安全字段；账户资料及安全管理分别进入同站 `/profile`、`/security`。原影策修改账号的接口继续关闭。模型目录覆盖 New API 授予当前用户的全部可选分组，模型选项标明分组；选择冻结到模型编号，转发时重新校验当前分组权限并使用该分组倍率。灵感目录在构建前后校验，缺失或格式错误会阻止部署。

## 验证记录

短剧回归使用浏览器和本地模拟上游，从开始制作依次完成设定提取、角色/道具/场景三张参考图、分镜、两段视频提示词、两段视频与合成，共 10 个成功任务。成片在浏览器实际播放、下载，验证为 1920×1080、8 秒及 HTTP Range 读取。另验证失败视频可重试且保留已生成参考图和提示词；模型 API Key 数量、令牌查找错误和本次扣费均为 0。模拟上游只验证平台调用链与参数合同，不代表付费供应商的生成质量或线上部署已验收。

已完成：两个前端的生产构建、影策前端全量 3,274 项、MCP 55 项、影策完整后端与 76 项 Chrome 预演测试；New API 前端全量 3,038 项及新增上传回归、后端 router/model/service/controller 全量、类型检查、lint、格式与版权检查。三种真实数据库的新安装及旧部署升级均连续启动两次，覆盖 Session 撤销、Cookie 只读、PAT 分界、同库隔离和账号删除。数据库版本为 SQLite 3.50.4、MySQL 8.4.11、PostgreSQL 17.11。宿主既有数据库只在独立副本和专用测试库上验证。

真实本地链路已验证 Qwen 文本、FLUX 图片、Wan 视频、同一原任务的回执恢复、素材导入、时间线保存与重新打开、中文字幕及 MP4 导出。MCP 客户端通过真实 HTTP 枚举 106 个工具，并验证创建画布、浏览器打开、项目读取与另一账号访问拒绝。画布助手已通过 New API 渠道调用本地 Qwen 完成只读对话；适配器报告实际配置的上下文上限，工作台据此执行预算检查。

最终独立镜像仅挂载 `/data`，程序、官方插件和 Agent SDK 均由镜像提供。已实际执行 Node 22.19.0、FFmpeg 5.1.9、OpenTimelineIO 0.18.1 和 Agent SDK，逐项核对 465 个源码运行文件及 19 个媒体、浏览器系统文件，并通过页面导出带中文字幕的 1080×1920 MP4、下载和浏览器解码。复测账号的模型 API Key 数量仍为 0，原视频任务仅有一条成功回执。

构建期间系统盘写满曾损坏解包缓存，已从源码编译产物和内容校验通过的镜像层恢复，并验证最终运行容器的文件校验值。未配置的外部付费服务、ARM 实机支付插件和 golangci-lint 不属于本地已通过项目。

安全设计参考 OWASP ASVS 5.0.0，以及 Authentication、Session Management、CSRF Cheat Sheet；专项回归不能替代完整 ASVS 审计。
