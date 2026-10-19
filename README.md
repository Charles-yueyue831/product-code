# dsh-codebase-insight

面向产品经理的 DeepSeek Harness 代码理解与交互式产品能力地图。版本 **0.1.1**。

从本地代码提取模块、接口与调用线索，用可追溯的图谱探索产品能力。默认离线、只读，不运行目标项目、不安装目标依赖、不执行目标仓库的 Git 操作。

## 安装与调用

要求 Node.js >=22.12，实际宿主验证为 `@deepseek-ai/dsh@0.2.0-rc.2`。使用真实 Cordis 插件接口 `name/inject/apply`、`ctx.tools.register` 及 `dsh.bundle.patch`，不假设通用编辑器插件接口。后续 Harness 版本须复测。

```sh
dsh plugin --profile web add dsh-codebase-insight@0.1.1
```

插件配置在 `cordis.patch.yml`。准备一个工作区，例如：

```text
workspace/
  product/          # 待分析仓库
  insight-output/   # 预先建立的独立输出目录
```

在以 `workspace` 为工作区的 Harness 中，要求调用 `codebase_insight_analyze`，参数：

```json
{"repository":"product","openDashboard":true,"consentRemote":false}
```

也可以直接说：“使用 Codebase Insight 分析 product 目录，保持离线并打开产品能力图谱。”工具返回随机本地 URL 与离线 HTML 路径。没有可写的独立输出目录时会报错，不会偷偷在目标仓库内建目录。

关闭服务：调用 `codebase_insight_stop`；插件卸载也会关闭本插件的服务。

```sh
dsh plugin --profile web remove dsh-codebase-insight
# 更新：
dsh plugin --profile web add dsh-codebase-insight@latest
```

卸载不删除已保存的报告；需要时由用户自行删除。

### 独立命令行（不需要模型）

```sh
npm install -g dsh-codebase-insight@0.1.1
mkdir -p /path/to/insight-output
dsh-codebase-insight analyze /path/to/product /path/to/insight-output --serve
```

`--serve` 默认仅绑定 `127.0.0.1`，Ctrl+C 停止服务。不带 `--serve` 仅生成结果。`dashboard.html` 内嵌图谱、样式和交互代码，可直接在浏览器打开，无需服务器或 CDN。关闭页面不停止 CLI 服务，需 Ctrl+C。

## 如何读图

- **产品全景**：从模块和能力候选了解产品组成。
- **能力地图**：点能力查看问题、价值、机制和证据；关联节点可跳转技术模块。
- **技术架构**：查看推断的逻辑层级，不代表已验证的部署拓扑。
- **业务流程**：查看函数中静态可见调用的源码顺序，条件/循环/异常路径明确标注。不是完整控制流图。
- **模块依赖**：查看解析成功的本地相对导入关系；上游/下游、两级高亮、隐藏无关节点。

默认产品视角，架构和代码视角逐步深入。选中模块后可展开/折叠代码节点。搜索是本地关键词匹配，**不是**通用自然语言问答。默认最多渲染 120 个节点，可继续加载；聚合支持所属模块和逻辑层。没有足够业务证据时，不伪造业务领域分组。

## 分析结论的边界

`confirmed` 已由代码证实、`partial` 部分实现、`inferred` 推断存在、`unknown` 无法确认。当前分析器确认文件、声明和解析到的相对导入；产品能力、模型判断、逻辑分层及名称匹配调用均保留为推断。未经过人工确认，不把自动能力候选升级为事实。

JS/TS 使用 TypeScript AST；其他常见语言只识别文件与模块。未解析别名、动态导入、跨包导出、依赖注入或完整运行时调用关系。路由形态提取并不验证对应框架一定是 HTTP 路由。流程中的函数调用次序不证明调用实际发生。版本 0.1.1 的本地模式偏重技术入口候选，完整的中文业务解释需要可选模型分析和产品人员复核。

## 可选模型增强

管理员在自己的 Harness 覆盖配置中设置 `enableModel: true`，以及已注册的 `provider`、`model`。插件不会读取 API key 文件或自行添加模型路由。启用后，每次工具调用仍须明确 `consentRemote: true`。

发送范围：最多 `modelInputChars` 个字符的**脱敏源码证据片段、相对文件路径、模块名、证据 ID**。默认 12000 字符；不发送整个仓库，但仍可能包含商业源码。必须先说明范围并取得用户同意。代码注释被视作不可信数据，不是执行指令。模型没有工具权限，输出仅接受受约束 JSON；引用必须来自本次发送的数据，结论仍标为推断。引用存在不证明产品语义正确。

所有主要配置（管理员配置，不从源码读取）：

| 参数 | 默认值 | 作用 |
|---|---:|---|
| outputRoot | insight-output | 工作区内、目标仓库外的已存在输出目录 |
| enableModel | false | 是否允许使用宿主模型 |
| maxFiles | 2000 | 文件上限 |
| maxFileBytes | 262144 | 单文件大小上限 |
| maxTotalBytes | 16777216 | 总读取大小上限 |
| timeoutMs | 60000 | 整体分析超时 |
| modelInputChars | 12000 | 模型输入字符上限 |
| maxOutputTokens | 4000 | 模型输出 token 上限 |
| tokenBudget | 50000 | 输入 UTF-8 字节保守上界加输出 token 的总预算 |

固定最大并发 1，每次最多一次模型调用。超限、取消、无效模型结果会报错，不写部分成功结果。源码语法分析是同步有界任务，取消会在阶段检查点生效，不能强制中断单次解析。

## 数据与安全

每次创建独立结果目录，含 metadata.json、knowledge-graph.json、architecture.json、capabilities.json、business-flows.json、evidence.json、analysis-report.md、dashboard.html。证据是分析时的脱敏快照，含相对路径、行号和文件内容哈希，不提供任意文件读取接口。

扫描跳过符号链接、常见密钥文件、node_modules、构建产物和 gitignore 排除路径。内置敏感行及私钥块脱敏并不保证识别所有自定义秘密；开启模型前需自行确认代码适合传输。本插件是应用级边界，不能替代操作系统沙箱，也不防御拥有同一目录写权限的恶意进程并发交换目录。深层 gitignore 的复杂重新包含规则未完整支持。不可将任意不可信图谱文件视为安全输入。

本地 Web 服务只提供生成的页面，随机访问路径并检查 Host；不启用遥测、远程字体或 CDN。结果目录可能包含商业代码片段，分享离线 HTML 前请复核。

## 从源码开发与验证

```sh
npm ci
npm run build
npm test
# 使用实际安装的 Harness，而不是伪造宿主接口：
DSH_TEST_ROOT=/path/to/node_modules/@deepseek-ai/dsh npm run test:host
npx playwright install chromium
npm run test:ui
# 如需复用测试浏览器，可设置 CHROME_PATH=/absolute/path/to/chrome
npm pack
```

验收详情见 [docs/acceptance.md](docs/acceptance.md)，技术方案见 [docs/design.md](docs/design.md)。P1 问答、语义向量搜索、增量、影响预测、状态机和图片导出未实现。真人产品经理体验尚待完成，不将自动测试等同于产品效果验收。

## 参考与许可证

本仓库沿用 Apache-2.0。参考 [Understand Anything](https://github.com/Egonex-AI/Understand-Anything) 的图谱与分层认知设计，以及 [dsh-paper-insight](https://www.npmjs.com/package/dsh-paper-insight) 的真实 Harness 包结构；未复制其业务源码。运行依赖包括 TypeScript（Apache-2.0）、Cytoscape.js（MIT）、Zod（MIT）、ignore（MIT）。打包图形库保留许可证注释。
