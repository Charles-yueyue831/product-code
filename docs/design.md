# Codebase Insight v0.1.1 技术方案

以产品经理从能力追溯技术实现为目标。v0.1.1 实现 P0 的五视图、只读扫描、统一证据图、归档及 Harness 工具。P1 问答、增量缓存、影响预测不作为本版完成承诺。

## 已核实的接口与取舍

- 实际 npm 包 dsh-paper-insight@0.2.3：ESM `name/inject/apply`、`ctx.tools.register`、`dsh.bundle.patch`、`cordis.patch.yml`。本机 @deepseek-ai/dsh@0.2.0-rc.2 可用于真实工具生命周期验证。
- Understand Anything（MIT）：读取 core/schema.ts、fingerprint.ts、domain-analyzer.md、understand-chat.ts 和 Dashboard 依赖。它以 Tree-sitter 静态结构、分批 Agent 语义分析、合并校验形成图谱；业务域采用 domain/flow/step；问答用图谱上下文；指纹支持增量；React Flow/ELK 构建交互界面。借鉴数据视图分离、证据、层级与按需展开，自行实现产品能力模型，不复制其整个 Agent/宿主依赖链。P1 增量与问答留待后续。
- 选用 TypeScript Compiler API 提取 JS/TS 声明、导入及调用语法；Cytoscape 提供拖拽、缩放、布局与关系高亮；Zod 验证数据；ignore 遵循 gitignore。保留依赖许可证，不复用参考项目源代码。
- 相较直接移植 Understand Anything，独立轻量实现降低安装复杂度。纯正则或纯模型方案均不能作为可确认关系的依据。

## 数据流

`授权根目录 → 有界扫描 → AST/结构提取 → 本地能力候选 → 可选 Harness LLM 语义增强 → 引用校验 → JSON/Markdown/离线 HTML → 本地 Dashboard`。

Node: id/type/name/summary/status/evidence/moduleId/layer/userProblem/value/mechanism。Edge: id/source/target/type/status/evidence/basis。Evidence: id/file/line/endLine/snippet/hash。状态为 confirmed/partial/inferred/unknown；模型只能生成 inferred，源码片段存在也不自动证明产品语义。静态调用语法不等于运行时已执行；逻辑分层不等于部署架构。缺失证据则明确缺口。

## 分析支持范围

JS/TS 为 AST 深度支持；其余常见源码语言提供文件/模块清单，语义增强可补充有证据的推断。HTTP 路由候选从 AST 中的方法调用与字符串路径提取，明确未验证框架运行语义。函数内调用按源码顺序展示，分支标注条件上下文，不声称精确控制流。所有能力候选默认 inferred；空仓库不生成演示能力。

## UI

中文默认产品层级。左侧五视图与搜索，中部交互图，右侧证据详情。蓝灰 #eef3f8 为工作区，白色 #ffffff 为阅读区，深蓝 #183550 为正文，蓝 #2864b4 为模块，青 #167c80 为能力，琥珀 #a36b11 为推断。系统中文无衬线字体，18/26/36 字级。避免营销卡片，以图与证据构成主层级。Level 1 能力/模块，Level 2 架构与流程，Level 3 按模块展开文件/符号。默认最多 120 节点，主动增加加载量。键盘可用的节点列表与搜索作为画布替代入口。

## 安全与预算

不执行目标代码、脚本、Git 或依赖安装。不跟随符号链接；排除密钥路径与 gitignore；敏感行脱敏。原始源码只在扫描内存中使用，不持久化全量源码。模型默认禁用，只有管理员配置开启并且本次调用明确 consentRemote 才发送脱敏证据；说明不保证识别任意自定义秘密。默认上限：2000 文件、256KiB/文件、16MiB 总量、60 秒扫描、1 并发、单次模型 12000 输入字符/4000 输出 token；使用保守字节上界限制模型预算。所有输出写到授权输出根的新目录，不覆写目标仓库。127.0.0.1 服务只提供生成页面，随机访问路径，校验 Host，不提供任意文件读取 API。取消和卸载清理服务。

## 验证与发布

三个固定夹具（单体、多模块、分层），人工预先定义模块/能力参考答案；测试证据、依赖、误识别、遗漏、路径/密钥/取消/只读。使用实际 Cordis/tools 包验证注册/执行/卸载；Playwright 验证五视图、详情、搜索、关联跳转、展开、缩放。大图固定 1000 模块，默认渲染 120，记录机器与耗时。产品经理真人体验由用户完成，不冒充自动化覆盖。

通过测试后提交并 push，创建 v0.1.1 Release，然后 npm publish 同版本包。npm 认证或真人验收不可由代码测试替代。
