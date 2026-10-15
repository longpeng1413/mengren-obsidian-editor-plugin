# Contributing / 开发贡献指南

欢迎提交匿名最小复现、文档改进和 Pull Request。请先阅读 [README](README.md)、[架构](docs/ARCHITECTURE.md) 与 [测试记录](TESTING.md)。

## Environment

- Node.js 22+，pnpm 9（CI 使用 9.15.9）。
- Obsidian 1.13.x 是主要实机验收目标；`manifest.minAppVersion` 是安装下限，并不代表每个旧版本都已测试。
- 开发时使用独立空白测试库，不在真实工作库里批量格式化。

```sh
git clone https://github.com/longpeng1413/mengren-obsidian-editor-plugin.git
cd mengren-obsidian-editor-plugin
pnpm install --frozen-lockfile
pnpm build
pnpm test:core
```

## Browser tests

Windows 默认使用已安装的 Edge；其他系统或隔离 Chromium：

```sh
pnpm exec playwright install chromium
```

设置 `TET_BROWSER` 为 Playwright 的 `chromium.executablePath()`，再运行 `pnpm test`。POSIX 示例：

```sh
export TET_BROWSER="$(node -e "console.log(require('playwright').chromium.executablePath())")"
pnpm test
```

PowerShell 示例：

```powershell
$env:TET_BROWSER = node -e "console.log(require('playwright').chromium.executablePath())"
pnpm test
```

测试截图在 `.test-artifacts/`，不提交个人截图。浏览器夹具真实使用 CM6；Obsidian API 和绘图 SVG 为模拟，不等于原生端到端验收。

## Native checks

将构建后的 `manifest.json`、`main.js`、`styles.css` 复制到独立库 `.obsidian/plugins/trader-editor-tools/`，启用插件。可把 `examples/` 的公开示例复制进测试库的 `Trader Editor Tools 验收/`。安装 Excalidraw 为可选兼容测试。

原生诊断脚本要求显式测试库名称，并校验当前笔记目录，不默认选中用户的当前库：

```powershell
$env:OBSIDIAN_CLI = 'PATH_TO_OBSIDIAN/Obsidian.com'
node scripts/native-diagnostics.cjs TEST_VAULT
```

不要提交诊断输出中的个人路径、原笔记正文或备份。PDF 与 Android/iOS 检查要分别记录真实环境，不用浏览器测试替代声称。

## Change requirements

- 所有改写都需用户操作；禁止启动/打开文件时自动格式化、禁止默认改写整个库。
- 保持正文/顶层列表每侧 0.28em 的单一留白模型；不能叠加原生 margin/gap。
- 源码修改通过偏移和原文一致性校验；表格必须校验转义与列数。
- 处理不明确的 HTML/嵌入时安全拒绝，而不是猜测写回。
- 保持运行包不依赖 Node.js、远程请求或硬编码 vault 路径。
- 修复需包含回归测试；不要只加 CSS 绕过错误的 Markdown 结构识别。
- 修改源码后运行 `pnpm build`，提交更新的 `main.js`，使 GitHub checkout 可以直接安装。
- 普通贡献 PR 不擅自改版本；正式发布由维护者按 [RELEASING](docs/RELEASING.md) 执行。

## Issues and reviews

先搜索已有问题。描述现象、预期、最小 Markdown、系统/Obsidian/插件版本、Live Preview 或阅读模式，以及同类 CSS 是否启用。公开问题中不放凭据、私人笔记、备份或完整库压缩包。

PR 应说明行为变化、测试结果和未测边界。CI 必须通过；涉及格式化、尺寸写回或主题适配时，需要追加独立库实机验证记录。
