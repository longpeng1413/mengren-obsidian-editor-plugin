# Mengren Editor

**English** · [中文说明](#中文说明)

Mengren Editor keeps Markdown notes compact and evenly spaced, resizes images by dragging their corners, adds text color, highlight and underline, and reads notes aloud, while leaving Obsidian's native Markdown editing untouched. It was formerly published as 猛人obsidian编辑插件 and was renamed in 0.1.8 to follow the Community directory rules; the internal ID `trader-editor-tools` is unchanged, so existing settings, hotkeys and backups carry over. The interface is primarily Chinese. MIT licensed, maintained by [longpeng1413](https://github.com/longpeng1413).

[Releases](https://github.com/longpeng1413/mengren-obsidian-editor-plugin/releases/latest) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](TESTING.md) · [Issues](https://github.com/longpeng1413/mengren-obsidian-editor-plugin/issues)

## Features

### Consistent block spacing

- Body text uses line-height 1.62. Paragraphs and top-level list items get 0.28em of padding on each side, so every pair of neighbouring blocks is separated by the same gap. Theme paragraph and list margins are not stacked on top.
- Quotes, nested lists, indented list paragraphs and standalone indented code join the same spacing model. Automatic line wrapping inside one paragraph stays at the body line-height.
- Headings keep symmetric padding of their own: H1 0.95em, H2 0.82em, H3 0.70em and H4 to H6 0.58em on each side.
- Painted blocks, meaning fenced code backgrounds, quote bars, Callout boxes, Tab knowledge row backgrounds, table borders, horizontal rules and standalone images or drawings, keep half of the visible prose gap outside their paint (block padding plus half the line leading, about 0.59em). Paint to text and paint to paint therefore look exactly like text to text, about 18.9px at a 16px font size.
- Live Preview, Reading view and PDF export follow the same rule. Only unindented code and quotes count as painted blocks; indented ones inside lists keep list spacing.

### Tab knowledge rows

Standalone indented blocks whose non-blank lines all start with a Tab can be shown as knowledge rows: each physical line gets the same padding as a list item, wrapping stays compact, and the whole run sits on one code-coloured box that looks the same in Live Preview and Reading view. This is an optional display enhancement, enabled by default. Standard Markdown still treats such blocks as code, so turn it off if your Tabs mean program code. Fenced code and space-indented code are never changed.

### Blank lines

One blank line between blocks is a compact paragraph separator. Every additional plain blank line keeps one line of visible space in Live Preview, Reading view and print, so deliberate breathing room survives. Blank rows inside code, YAML, HTML, quotes and Callouts are left alone, and the trailing caret position is not counted.

### Formatting command

The optional formatting command inserts the standard blank lines that Markdown paragraphs, headings, images, lists and tables need. It always shows a before and after preview, can save a local backup first, and applies as a single undo step. Notes are never reformatted automatically. Quotes, Callouts, nested lists, YAML, code and uncertain inline constructs are protected.

### Native editing

The plugin registers no keyboard handlers. Enter, Shift+Enter, Tab and Backspace, as well as list, quote and indentation continuation, are handled entirely by Obsidian. A blank line that holds the caret stays visible and editable, and collapses again when you move away. Source mode stays native.

### Image resizing

Click an image and drag any corner to resize it proportionally; hold Alt for independent width and height, and press Esc to cancel. The size is written once, on release, in Obsidian's native embed or alt syntax. Images inside Markdown tables, with escaped pipes and checked column counts, and Excalidraw drawings are supported. A command also lets you type an exact width and height.

### Text color, highlight and underline

Apply text colors, background highlights and underlines from the editor context menu, the command palette or hotkeys you assign. Each property can be added, changed or cleared on its own; they merge into a single readable HTML span while bold, italic, strikethrough and links keep their native Markdown syntax. Six palette slots are customizable. Inline code, wiki links, escapes and link targets are protected.

### Listening (read aloud)

Select the headphones button at the top right of a note, or run "听书" from the command palette. With text selected, only the selection is read; otherwise reading continues where you left off in that note, or starts at the cursor (in Reading view, at the top of the screen). A floating player offers pause and resume, previous and next sentence, speed from 0.75x to 2x, voice choice, "read from the start" and "read from here". The sentence being read is highlighted in Live Preview and Reading view in a color you choose, and the note scrolls along with it; scrolling by hand pauses the following, which resumes after six quiet seconds or when you tap the locate button. Double-click (double-tap on phones) the highlighted sentence to pause, and again to resume; while the player is open, double-click any other sentence to read from there. Front matter, program code blocks (js, python and so on), math, comments, URLs, embeds and bracketed video timestamps such as [59:10] are skipped, and links are read by their visible text. Plain-text code blocks (no language, text or markdown) are read line by line without tree-drawing glyphs.

Choose the reading source in settings. **System voice** uses your device's speech engine through the standard Web Speech API: offline and free, nothing leaves the device; on Windows the built-in Chinese voices are Huihui, Kangkang and Yaoyao. **Baidu** uses the read-aloud audio of Baidu Translate: free and without an account, but it needs the internet and **each sentence being read is sent to fanyi.baidu.com**; it is not an officially offered service and can stop working if Baidu changes it, in which case the plugin says so. **Automatic** (default) uses the system voice when the device has one, and Baidu otherwise, for example in Obsidian for Android, which provides no system speech engine. Downloaded audio is kept in memory only, at most six sentences, and cleared when listening stops. The reading position of up to 200 notes is remembered for 180 days and can be cleared in settings.

### Reading view and PDF

Reading view and PDF export use the same spacing and styles as Live Preview. Resize handles never appear in print, and colors and highlights are preserved.

## Install

**From Obsidian:** open Settings, then Community plugins, select Browse, search for "Mengren Editor", then install and enable it.

**Manually:** download `manifest.json`, `main.js` and `styles.css` from the latest [release](https://github.com/longpeng1413/mengren-obsidian-editor-plugin/releases/latest) and put them in a `trader-editor-tools` folder inside your vault, not inside the Obsidian program directory:

```text
YOUR-VAULT/.obsidian/plugins/trader-editor-tools/
  manifest.json
  main.js
  styles.css
```

Then enable **Mengren Editor** under Settings, Community plugins. To upgrade manually, disable the plugin, replace the three runtime files, keep `data.json` and `backups/`, and enable it again. Turn off other layout CSS snippets that change paragraph spacing so the two do not stack. Keep Excalidraw installed if you use drawings; this plugin does not replace it.

## Privacy and safety

- No telemetry, accounts, payments or ads. The only network request is optional: when listening uses Baidu (chosen, or automatic on a device without a system voice), the sentence being read is sent to fanyi.baidu.com to get its audio. With the system voice, nothing leaves your device.
- The plugin only reads and writes notes inside your vault, through the Obsidian API, and only after an explicit action: a confirmed formatting preview, a finished image drag, or a style command.
- Before a formatting run or a Reading view image write, it can save the original note in the plugin's own `backups/` folder inside your vault configuration folder. Backups stay local and are never deleted automatically.
- Stale documents, concurrent edits and ambiguous image matches are rejected instead of guessed.

## Compatibility and limits

Tested on Windows with Obsidian 1.13 and 1.14, the default theme and Excalidraw. Other themes, complex HTML and third-party renderers may differ. The plugin can be installed on Android and iOS, but mobile touch and keyboard behavior have not been verified on real devices. The formatting command is deliberately conservative and is not a complete Markdown reflow engine; extra blank lines are not reproduced in PDF export, because the export carries no source positions.

## Mobile

Select text, open the command palette and run a color, highlight or underline command; these commands can also be added to the mobile toolbar. When syncing, include the hidden `.obsidian` folder so the plugin files and, optionally, `data.json` are copied. Excalidraw must be enabled on each device that shows drawings.

## Develop

Node.js 22 or later and pnpm 9 are required:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

Browser tests default to Windows Edge; set `TET_BROWSER` to another Chromium executable if needed. The fixtures use real CodeMirror 6 with a mocked Obsidian API. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/RELEASING.md](docs/RELEASING.md).

## Reporting issues

Please report bugs with anonymized minimal Markdown, your Obsidian and plugin versions, and the editor mode. Do not upload your vault, backups, account details or private attachments.

---

# 中文说明

[English](#mengren-editor) · **中文**

> **Mengren Editor（猛人编辑器）**，原名「猛人obsidian编辑插件」。0.1.8 起为符合 Obsidian 社区目录规则（名称不能含 “Obsidian”），显示名改为 Mengren Editor；内部 ID `trader-editor-tools` 不变，已有设置、快捷键和备份不受影响。

版本 **0.1.15**，MIT 开源。完整可安装插件，不需要安装 Node.js，不需要编译。优先支持 Windows / Obsidian 1.13–1.14 / Live Preview；手机可安装，但尚未真机验收。

[下载发布版](https://github.com/longpeng1413/mengren-obsidian-editor-plugin/releases/latest) · [更新记录](CHANGELOG.md) · [开发指南](CONTRIBUTING.md) · [架构](docs/ARCHITECTURE.md) · [测试记录](TESTING.md) · [问题反馈](https://github.com/longpeng1413/mengren-obsidian-editor-plugin/issues)

0.1.15 听书时双击任意一句话，就从那句开始朗读（播放条打开时生效；双击正在读的句子仍是暂停 / 继续）。

0.1.14 朗读时跳过方括号里的视频时间引用（如 `[59:10]`、`[1:00:29]`），普通时间和其他方括号文字照常朗读。

0.1.13 修复部分安卓手机（如网页内核较旧的华为手机）阅读模式和表格里看不到朗读高亮；百度朗读失败时自动重试并暂停在当前句；新增命令“听书：显示诊断信息”。

0.1.12 听书改进：高亮颜色可选（默认黄色，更醒目）；双击正在读的句子暂停 / 继续；手机上自动跟着滚动；编辑模式下表格、提示框里的句子也有高亮；纯文字代码块也会朗读。

0.1.11 新增 **听书**：笔记右上角耳机按钮朗读笔记，句子高亮并跟随滚动，可调语速、记住读到的位置。电脑默认用离线的系统声音；手机（Obsidian 安卓版没有系统朗读）自动用百度朗读（联网）。

0.1.10 **Tab 知识行、分割线、Excalidraw 绘图** 也按涂色块留出外侧空白：编辑模式的 Tab 行改为与阅读模式相同的整块灰底，分割线上下与正文间距一致，编辑、阅读、导出 PDF 一致。

0.1.9 README 改为中英双语（Obsidian 社区目录要求有英文介绍），发布附件附带 GitHub 构建来源证明。

0.1.8 按 Obsidian 官方社区目录规范整理：英文名称与描述、设置页标题写法、手机兼容的正则写法，官方检查工具零错误。

0.1.7 统一 **代码块、引用、提示框、表格、图片的外侧空白**：它们的背景框、竖线、框线到相邻文字的空白与两段正文之间相同，编辑、阅读、导出 PDF 一致。

0.1.6 重构 **独立叠加文字样式**：颜色、高亮、下划线统一合并到一个视觉 span，分别增加、修改或清除；保留 Markdown 粗体、斜体、删除线和链接语义，并修复 Live Preview 的 HTML 组件不显示外层粗体的问题。继续保留原生回车和连续空行留白；升级不会自动修改旧笔记。

## 安装

**从插件市场安装：** 打开 Obsidian → 设置 → 第三方插件 → 浏览，搜索 “Mengren Editor”，安装并启用。以后在“检查更新”里即可升级。

**手动安装（备用）：**

1. 从 GitHub 最新发布版下载 `manifest.json`、`main.js`、`styles.css` 三个文件。
2. 在**笔记库**的 `.obsidian/plugins/` 下新建 `trader-editor-tools` 文件夹，把三个文件放进去。不是 Obsidian 程序安装目录。例如：`你的笔记库/.obsidian/plugins/trader-editor-tools/main.js`。
3. 打开 Obsidian → 设置 → 第三方插件，允许社区插件后，找到 **Mengren Editor** 并启用。未出现时重启 Obsidian。
4. 设置 → Mengren Editor 调整参数。设置 → 快捷键，搜索 `Mengren`，为需要的命令自行绑定按键。
5. 关闭旧 `wolai-layout.css` 和其他同类排版片段，避免叠加。也不建议同时启用多个拦截图片拖动的插件。

只需要 `manifest.json`、`main.js`、`styles.css` 三个文件；不要套两层同名文件夹。

本插件原名 Trader Editor Tools。0.1.4 起统一使用中文显示名称，菜单和设置以中文为主。内部 ID、安装目录 `trader-editor-tools` 及现有 GitHub 仓库地址保持不变，避免丢失配色、快捷键与备份；升级时不要另建一个同 ID 的插件目录。

升级时先停用插件，覆盖这三个运行文件，保留原来的 `data.json` 和 `backups/`，再启用。

不要安装到 Obsidian 程序目录。Excalidraw 是独立插件，请保留；本插件不会替代绘图编辑器。

## 1. WoLai 段落排版

采用标准 Markdown 空行表达段落，插件仅负责紧凑显示，不会在打开笔记时批量改写内容。

| 参数 | 已验证默认值 |
| --- | --- |
| 同一正文段内自动折行 | line-height 1.62 |
| 正文、一级列表项 | 上下各 0.28em |
| H1 | 上下各 0.95em |
| H2 | 上下各 0.82em |
| H3 | 上下各 0.70em |
| H4–H6 | 上下各 0.58em |
| 代码块、引用、提示框、表格、图片 | 外侧各留半份正文空白（默认约 0.59em） |
| 列表缩进 | 1.8em |

正文↔正文、列表↔列表、正文↔列表、列表↔缩进段落、引用↔正文使用同一套块间距，嵌套列表项也参与。总相邻留白约 0.56em，不再添加额外 margin 或主题列表间距。引用只保留横向边线和缩进，不叠加主题的垂直留白。真正的独立缩进代码块也使用同一外部间距，但代码块内部换行保持紧凑。Live Preview 中结构性空白行（含仅有 `>` 的引用段落分隔行）压缩为零高度；源码模式保留正常空行。

### 代码块、引用、提示框、表格、图片的外侧空白

眼睛看到的“两段正文之间的空白”，是上一段文字底边到下一段文字顶边的距离：两份正文留白（0.28em × 2）加上下两行各自的半份行距，16px 字号时约 18.9px。代码块的灰色背景、引用和提示框的竖线或盒子、表格框线、图片边缘都是硬边，所以它们外侧各留**半份**这样的空白（0.28em + 半份行距 ≈ 0.59em）：硬边到相邻文字、硬边到另一个硬边，看到的空白都和正文到正文一样。标题保留自己更大的上下留白。

编辑模式、阅读模式和导出 PDF 使用同一规则。编辑模式把这些块旁边的分隔空行显示为半份空白（两侧都是这类块时为两份），中间没有空行、文字直接贴着代码块或引用时，给贴着的那一行加同样的空白；阅读和 PDF 按每个块外层的容器补空白，不依赖 Obsidian 阅读模式特有的分区名称。阅读和 PDF 中单独成段的图片按行底对齐，不再在图片下方多留一段文字基线空隙。只处理顶格书写的代码块和引用，列表里缩进的代码、引用保持列表间距。只改变显示，不改笔记源码。

设置项“表格、图片间距跟随正文”默认开启；关闭后可分别设置图片、表格外侧留白（em）。

### Tab 缩进知识行

默认开启“Tab 缩进按知识行显示”。独立缩进块中，所有非空行都以 Tab（允许前面 0–3 个空格）开头时，每个物理行上下各留 0.28em；同一行自动折成两三行只使用 1.62 行高。组内空白分隔行不叠加空洞，正文↔Tab 行、Tab 行↔Tab 行使用相同留白。仅改变显示，不删除 Tab，不写回正文。

标准 Markdown 本来把独立 Tab 缩进识别成代码块，本功能是可选的显示增强，不把它伪称为标准段落。阅读/打印也按相同规则显示；停用插件恢复原生缩进代码显示。围栏代码、空格缩进代码不转换；与真正代码内容完全相同而无法可靠区分时保守不转换。如果 Tab 用于程序代码，请关闭此设置。新建普通段落仍推荐标准空行分段。

旧原型的像素间距设置自动迁移为这套基准；配色、功能开关保留。设置页有“恢复已验证 WoLai 基准”按钮，不修改笔记正文。

### 格式化当前笔记

在编辑模式运行命令 **格式化当前笔记（预览 / 备份）**，比较原文和结果后点击“应用格式化”。未确认前不写入任何笔记。

- 默认“逐行分段”：普通正文的物理换行视为独立段；一级列表后未缩进正文也独立成段。自动折行不是物理换行，不受影响。
- 原笔记用物理软换行手工折行，或将未缩进文本作为列表续行时，请先关闭“逐行分段”，再看预览。
- 默认启用“分隔列表内缩进正文”：给普通缩进正文补段落空行，保留原缩进与嵌套层级；代码、多行强调/HTML、硬换行不拆。可在设置中关闭。缩进段落转回未缩进正文时也补分隔。
- YAML、围栏代码、Markdown 表格、引用/Callout、嵌套列表、缩进续行、图片链接、附件、Excalidraw 嵌入保守保护；只插入空行，不重排、不删除内容。不会格式化 Excalidraw 绘图文件本身。
- 顶层列表项可以用空行分隔。复杂/不确定结构宁可原样保留，用户仍须检查预览。
- 引用紧接外部标题/列表现在能正确识别；格式化会在明确的顶层引用边界补空行，不拆引用内部内容。尚未格式化的软换行/列表续行仍按原 Markdown 结构解释，不能仅靠显示样式把它们变成独立段。
- 一次编辑事务写入，可在当前编辑会话按一次 Ctrl+Z 撤销。原文默认备份在 `.obsidian/plugins/trader-editor-tools/backups/`，文件名含时间和原因。备份不会自动删除。
- 恢复备份：先保存当前文件，再将对应备份的正文复制回原笔记；不要把整个备份文件夹当插件运行文件覆盖。

**旧笔记不必逐处按回车：运行一次格式化命令，检查预览并确认即可。** 没有空行的物理软换行仍属于原来的同一 Markdown 段落；插件不偷偷改写，也不只在 Live Preview 假造段落，让阅读/PDF 仍显示不同结构。

### 原生编辑逻辑与空白输入行

从 0.1.4 开始移除原来的 Enter 分段增强。Enter、Shift+Enter、Tab、Backspace 全部交给 Obsidian 原生编辑器处理；引用/列表延续和退出、缩进续行遵守 Obsidian 的设置，不另写一套规则。旧 `paragraphEnter` 设置被忽略，不再显示该开关。普通正文回车不会自动变成双换行；需要独立段落时使用标准空行，或主动运行格式化预览。

编辑器获得焦点时，光标/选区所在的空白行、仅含 Tab 的行和空引用前缀行保留正常可见行高，可以继续输入和撤销。光标移走或编辑器失焦后，单个结构性空行恢复紧凑显示；空白笔记保持可点击。这个临时输入空间不会写入额外空行。源码模式仍使用原生空行显示。

### 连续回车与主动留白（0.1.5）

默认开启设置“保留连续空行的额外留白”。两个正文块之间：0 个空行仍是同一段的软换行；1 个空行是正常分段，间距约 0.56em；2 个空行增加一行高度；3 个空行增加两行高度，以此类推。段首普通空行完整保留；段尾第一个空行仍作为结构分隔，最后的空光标位置不计入已保存的额外空行。正在输入的光标行另有临时可见空间。

第一个空行是分段用途，不是额外留白。因此从正文末尾开始，按两次 Enter 再写正文是正常段间距；按三次 Enter 再写正文才增加一行留白。折行不增加留白；格式化保留已有连续空行，不自动删除。

增强只改变显示，不插入私有 Markdown 或改写正文。阅读模式依据源码行位置增加临时显示空白块，避免同名段落/重复图片误匹配；关闭设置或停用插件移除这些块。没有可靠源码定位的第三方渲染器保守不添加。连续空行的额外留白依赖本插件：停用插件后，标准 Markdown 阅读通常会合并空行，但文件里的空行仍完整存在。

围栏、空格缩进代码、Tab 知识代码块、HTML、YAML、引用/Callout 内部空行不套用普通正文的连续空行规则，避免改动它们的原生结构或语义。阅读/打印使用相同样式；本版打印由浏览器回归验证，未重新执行完整原生 PDF 导出真机验收。

## 2. 图片拖拽缩放

在 Live Preview 或阅读模式，单击图片，出现边框与四角控制点。拖动任意角默认保持比例；按 Alt 拖动或启用“默认自由宽高”保存宽×高。Esc、窗口失焦或切换文件会取消未完成的操作。Ctrl/Shift 等修饰点击保留 Obsidian 的打开行为。

拖动期间仅移动覆盖层，表格不随每次鼠标移动重排；松开后一次写回，再自然排版。如果新图片确实超出单元格，列宽允许扩展。

写回使用 Obsidian 原生尺寸语法，不使用插件私有图片格式：

```markdown
![[附件/图片.png|320]]
![[附件/绘图.excalidraw.md|320]]
![图片说明|320](<附件/中文 图片.png> "原有标题")
![[附件/图片.png|320x220]]

| 场景 | 图片 |
| --- | --- |
| 普通 | ![[附件/图片.png\|320]] |
| 绘图 | ![[附件/绘图.excalidraw.md\|320]] |
```

表格中的尺寸 `|` 必须转义为 `\|`，插件会自动处理并检查原列数。文件名、中文/空格路径、引用定义、原有 Markdown 标题和 Excalidraw 对齐参数保留。带非尺寸别名的普通 wiki 图片可能转换为原生 Markdown 图片，保留说明和正确的相对路径。

尺寸写入 Markdown，因此重开笔记、重载插件、同步到其他设备后仍存在，停用本插件也不丢尺寸。普通图片由 Obsidian 渲染；Excalidraw 需要另一台设备也安装并启用 Excalidraw。特定绘图片段、HTML 画布或第三方渲染器的自由高度是否生效由该渲染器决定；宽度保持比例是推荐方式。

若存在歧义或源文件在拖动期间变化，插件会拒绝写回并提示。可切到源码模式，把光标放进对应图片语法，运行 **设置光标处图片尺寸**。阅读模式写回没有打开的编辑窗格时，默认先备份，再以原文一致性检查写入。

## 3. 文字颜色、高亮、下划线

编辑模式下选中一个段落内的文字：

- 右键 → “猛人编辑：文字颜色…”或“背景高亮…” → 选颜色。
- 命令面板搜索插件名，运行颜色、高亮、切换下划线、清除样式命令。
- 常用颜色在设置页自定义。前 9 个槽位各有独立颜色/高亮命令，可在 Obsidian 快捷键页绑定，例如 Alt+1。插件不强占默认快捷键。

Markdown 原生格式负责语义，插件只添加视觉层。以粗体同时使用三种样式为例：

```markdown
**<span data-mengren-style="1" style="color: #d64545; background-color: #ffe1bd; text-decoration: underline;">重点</span>**
```

再次改色直接更新 `color`，不再嵌套 span。右键和命令面板分别提供“清除文字颜色”“清除背景高亮”“清除下划线”和“清除全部插件文字样式（保留 Markdown）”；最后一个属性删掉后自动移除 span，以上示例恢复为 `**重点**`。三种属性彼此独立：高亮不再强制修改文字色；深色主题中使用浅色高亮时，请按需自行选择对比清晰的文字色。Hex 值不依赖另一台设备的配色名称。

局部选中粗体内部文字也保留外部 `**`；标准 Markdown / 引用式链接保留目标和标题。跨不同语义或局部改色时，必要地生成多个兄弟 span，不嵌套视觉标签。同一行中相邻同属性片段会合并。

为保护结构，行内代码、wiki 链接/嵌入、转义符和链接目标不插入 HTML；混合选区保留这些字节，只设置普通文字，纯受保护选区会提示拒绝。不要跨物理行、表格单元格或选择不闭合的 HTML。陌生 HTML 属性/CSS 不清除。新版用 `data-mengren-style="1"` 标明归属；旧版精确形状的 color span / mark / `<u>` 仅在执行样式命令时兼容规范化，无法区分与旧生成格式完全相同的手写标签。没有自动批量迁移。

阅读和 PDF 原生解析 Markdown 语义；Live Preview 的 HTML 组件额外读取外层语义以恢复显示，不把粗体/斜体写进视觉 CSS。停用插件后阅读和导出仍保留标准 HTML 与 Markdown，Live Preview 的组件语义补偿随之停止。详见 [文字样式设计](docs/TEXT-STYLES.md)。

## 4. 手机与同步

`isDesktopOnly` 为 false，运行代码不使用 Node.js 文件系统。Android 可以手动将安装文件夹放入同一笔记库的 `.obsidian/plugins/`，或者同步这几个文件；仍需在手机上启用插件。同步工具通常默认不包含隐藏 `.obsidian`，请检查配置。要同步配色和参数，还需同步该插件 `data.json`。

手机编辑颜色：切到编辑模式 → 长按并调整文字选区 → 打开 Obsidian 命令面板 → 搜索 **设置文字颜色** / **设置背景高亮** → 选颜色；下划线和清除样式同理。可以在 Obsidian 手机设置中的移动工具栏添加这些命令。不要在阅读模式选中文字后运行编辑命令。

本版没有专门的悬浮手机工具条。触控拖动使用 Pointer Events，但 Android 真机、软键盘/长按冲突尚未验收；不要把 Windows 鼠标测试当作安卓已测试。手机建议优先用文字命令和图片尺寸命令。

## 5. 听书（朗读笔记）

点笔记右上角的 **耳机按钮**，或在命令面板运行 **听书：朗读 / 暂停当前笔记**：

- 选中了文字：只读选中的部分。
- 没选文字：接着这篇笔记上次读到的地方；没有记录时从光标处开始（阅读模式从当前屏幕顶部开始）。
- 底部播放条：暂停 / 继续、上一句 / 下一句、语速（0.75–2 倍）、选声音；“更多”里可以从头读、从光标处（或当前屏幕）读、打开听书设置。
- 正在读的句子会高亮（颜色可在设置里选），页面自动跟着滚动；自己滑动页面后暂停跟随，停手 6 秒自动恢复，也可以点定位按钮马上回到朗读处。
- 双击正在读的高亮句子即可暂停，再双击继续（手机上双击屏幕）；播放条打开时双击其他任意一句，就从那句开始读。关掉播放条后双击恢复为普通选词。
- 部分手机（如一些华为手机）的网页内核较旧，不支持新式高亮；插件会自动改为在句子上盖一层半透明色块，效果相同。
- 跳过属性区、编程语言代码块（js、python 等）、公式、注释、网址、图片等嵌入，以及方括号里的视频时间引用（如 `[59:10]`）；链接只读显示的文字；Tab 知识行、表格文字、纯文字代码块（没写语言或 text / md）会读，目录树线条 ├── └── 不读。
- 一边听一边改笔记也可以，会从改动后对应的位置接着读。

**朗读来源**在设置里选：

- **系统声音（离线）**：设备自带的朗读，离线、免费，文字不出本机。Windows 自带中文声音是慧慧、康康、瑶瑶，可在“设置 > 时间和语言 > 语音”添加更多。
- **百度朗读（联网）**：用百度翻译网页的朗读声音，免费、不用注册；需要联网，**正在朗读的句子会发送给百度翻译（fanyi.baidu.com）**。它不是百度正式开放的服务，百度改接口时可能失效，失效时会提示。
- **自动（默认）**：有系统声音就用系统声音；没有时（例如 Obsidian 安卓版不提供系统朗读）或读不出声时，自动改用百度朗读。

百度朗读的音频只临时放在内存里，最多 6 句，停止朗读就清空，不写硬盘。每篇笔记读到的位置最多记 200 篇、保存 180 天，可在设置里一键清除。

## 阅读模式、PDF 与主题

阅读模式和 PDF 共享语义块样式；没有另一套“假段落”。图片尺寸和文字色写在内容里。Windows Obsidian 1.13.7、默认主题、Excalidraw 2.27.3 已实机验收，详细范围见 `TESTING.md`。

实际 PDF 导出已检查普通图片、绘图、表格、文字颜色/高亮/下划线及段落间距。分页、页面宽度会改变换行，不能保证屏幕与纸张逐像素相同；过宽表格在 PDF 中允许按页宽约束图片。第三方主题或其他 CSS 可能覆盖字号、特殊容器间距，要先关闭同类片段排除冲突。

## 数据与安全

无遥测、无账号。唯一的联网是可选的：听书使用“百度朗读”时（手动选择，或在没有系统朗读的设备上自动使用），正在朗读的句子会发给百度翻译以取得声音；使用系统声音时不联网。不会自动整理旧笔记；写入仅来自确认格式化、完成图片拖动/保存尺寸、执行文字样式命令。原文备份只保存在本地笔记库的插件目录。卸载插件不会删除笔记中的 HTML 或原生图片尺寸。

## 完整工程与开发

完整源代码在 GitHub 仓库中：`src/`、`tests/`、`scripts/`、锁文件、示例与已编译文件。Obsidian / CodeMirror API 由宿主提供；Markdown 行内解析器 Marked 已编入 `main.js`，无需另外安装。[第三方许可证](THIRD-PARTY-NOTICES.md) 也写在 `main.js` 文件头，其余开发依赖仅用于构建与隔离测试。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

浏览器测试默认使用 Windows Edge；其他环境通过 `TET_BROWSER` 指定已安装 Chromium 浏览器路径。浏览器夹具使用真实 CodeMirror 6，但 Obsidian API 和绘图渲染有模拟，不能取代真机测试。

本地试用：`pnpm deploy:local` 构建后复制到 `.local-vaults.json` 里列出的笔记库，并在 Obsidian 中重新加载、核实（该配置文件含个人路径，不提交，格式见 [开发指南](CONTRIBUTING.md)）。原生诊断：`node scripts/native-diagnostics.cjs TEST_VAULT`，只读当前 `Trader Editor Tools 验收/` 专用目录笔记，必须明确传入测试库名称，并通过 `OBSIDIAN_CLI` 指定 CLI 路径（或加入 PATH）。不要对未知当前仓库运行命令。

工程有 GitHub Actions 自动构建与回归测试；版本 tag 发布工作流只发布 Obsidian 需要的三个运行文件，并附 GitHub 构建来源证明。维护细节见 [发布指南](docs/RELEASING.md)。

插件已以 **Mengren Editor** 提交 Obsidian 社区插件目录，每个新版本都会经过官方自动审核；首选从插件市场安装和更新，GitHub 发布版作为手动安装的备用渠道。

## 常见问题

- 看不到插件：检查是不是解压后套了两层目录；`manifest.json`、`main.js`、`styles.css` 应直接位于 `.obsidian/plugins/trader-editor-tools/`。
- 引用/缩进段落间距异常，或回车后光标不可见：升级到 0.1.4，停用再启用插件或重启 Obsidian；不需要调大 0.28em。独立 Tab 行请确认“Tab 缩进按知识行显示”开启。
- 间距仍过大：关闭旧 WoLai/段落 CSS 片段，再点设置中的“恢复已验证 WoLai 基准”。关闭本插件排版开关不影响文字样式和图片功能。
- 看起来像一段的旧笔记：源文本可能只有软换行而没有段落空行。使用格式化预览明确转换，不会自动改写。
- 绘图不显示：检查 Excalidraw 是否在当前设备启用；等待异步渲染完成后再点击。
- 报错或无法定位图片：不要反复拖动。用源码定位尺寸命令，或提供**匿名最小示例**反馈；不要上传整个知识库、插件备份、账户信息或私人附件。
