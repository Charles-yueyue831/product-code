# 参考实现调研与复用决策

调研日期 2026-10-19。

## Understand Anything

源码读取版本 `f2d0164f72fe678805c34245a6df36acededfebd`，MIT。读取 README、核心 schema.ts、fingerprint.ts、embedding-search.ts、compute-batches.mjs、agents/domain-analyzer.md、src/understand-chat.ts、dashboard/package.json。

- 结构：技能驱动分析、core 解析/图谱/搜索、独立 React Dashboard。Tree-sitter 多语言解析器与注册表生成结构。
- 多 Agent：以导入图社区划分批次，再分批分析并合并/校验，避免全库一次输入。这里借鉴阶段边界，但首版采用单并发、单次可选模型调用，不复制多 Agent 调度。
- 图谱：Node/Edge 类型及别名规范化，避免模型输出类型漂移。本版用严格 Zod 类型与引用校验，不宽松接受未定义关系。
- 业务域：domain/flow/step 三层与入口证据。首版没有足够语义证据时不制造业务域；本地业务路径是 AST 调用线索。
- Dashboard：React Flow、Dagre、ELK、D3、Zustand。首版选择更少依赖的 Cytoscape，独立离线导出，不移植 UI。
- 搜索：词法检索与向量余弦相似度；问答由图谱构造上下文。本版仅关键词搜索，语义问答为 P1。
- 增量：文件内容与函数/导入指纹区分无变化、表面变化、结构变化。本版保留内容哈希用于证据追溯，不声称实现增量。

## dsh-paper-insight

实际下载 npm 发布的 `0.2.3` 包，读取 package.json、cordis.patch.yml、index.js、lib/model.js、lib/storage.js、docs/compatibility.md、scripts/host-smoke.js。ESM 模块导出 name/inject/apply，tools.register 定义参数与输出、ctx.effect 注册卸载资源；bundle.patch 挂载插件。模型经 llm.prepareCall 和 stream 执行，不虚构模型 SDK。独立输出目录、配置上限、宿主策略、取消与生命周期是可借鉴的模式。本版自行编写实现。

## 实际宿主发现

本机 DSH 0.2.0-rc.2：参数 schema 和工具结果必须为无损 JSON；带隐藏属性的 schema 或 undefined 输出会被拒绝。测试发现后已规范化。访问 llm 必须声明 inject，即使只在可选模型分支使用；已加入 llm 注入并用真实 LLM 服务与合成适配器验证。插件安装/卸载通过官方 profile 管理命令，不编辑用户宿主配置文件。
