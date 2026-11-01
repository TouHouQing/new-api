# THQ Video 托管工作台修复与本地验收

| 问题 | 修复 |
| --- | --- |
| 个人信息请求 403 | 托管模式通过只读 `host-profile` 获取当前 New API 账号资料，账户修改进入宿主页。 |
| 账户设置打开不存在的 `/settings` | 改为同站 `/profile`；登录与安全管理进入 `/security`。 |
| 工作台品牌仍为影策 | 托管模式统一使用 THQ Video 名称、标识与页面标题，保留上游版权和致谢。 |
| 原 Studio 界面仍可打开 | 移除旧入口；`/studio`、旧查询参数及 `/studio/legacy` 均进入当前工作台。 |
| 灵感 JSON 部署后缺失 | 构建前后校验全部五份懒加载目录，缺失或格式错误阻止部署。 |
| 模型目录与分组不完整 | 按 New API 全部可选分组同步模型；选项展示分组，转发时校验权限并按所选分组结算。 |
| 费用上限误作单价展示 | 模型设置展示 New API 的实际计费说明，不把授权上限当作模型价格。 |

本地验收通过个人信息页面、同站资料跳转、品牌和标识、旧入口跳转、五份灵感资源、模型选择及匿名访问拒绝。已在实际灵感大厅筛选 YouMind 并显示卡片。

通过页面选择 vip 分组并调用本地 Qwen 完成文字生成；New API 用量记录的实际分组为 vip，消耗为零，未创建模型 API Key。复测只查询同一条任务回执，未重复生成。MCP 的 106 个工具枚举、画布打开及跨账号读取拒绝也已复测通过。

验证包括两个前端的生产构建、类型检查与 lint，完整 router 测试、托管后端专项、目录打包回归，以及 3,265 项前端应用检查。上游独立仓库的 12 项镜像发布 CI 用例不属于内置工作台的测试范围；初次全量运行中依赖未随源码迁入的 `.github/scripts`，应用测试复测时明确排除这些发布用例。

线上问题补充复测使用真实 Nginx，故意令所有静态 `.json` 返回 404；五份目录仍经由已登录、无文件扩展名的 API 加载，YouMind 筛选显示 30 张卡片，视频菜单可选择本地 Wan 模型，匿名目录请求仍被拒绝。线上公开的 35 个模型均只标记通用 `openai`，新增识别覆盖其 31 个视频型号和 4 个 Seedream 图片型号；本地目录集成回归覆盖了旧渠道别名与分组。Docker 构建也补齐目录校验脚本。此轮没有提交生成任务或调用付费模型，未将目录可选性当作云端生成验收。

身份只取服务器验证的当前会话；查询参数不能选择他人资料。资料不返回密码、PAT 或会话凭据；独立影策的账号写接口继续关闭。分组权限在目录读取及实际转发时检查。认证与会话设计参考 [OWASP ASVS 5.0.0](https://asvs.owasp.org/)、[Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) 和 [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)，专项验证不代表完成整个 ASVS 审计。

验收范围为本地服务。公网域名需要部署本次源码构建的版本后才能获得这些修复。
