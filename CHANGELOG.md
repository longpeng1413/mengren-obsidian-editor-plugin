# Changelog

## 0.1.9 - 2026-10-15

- 根据 Obsidian 社区目录首次自动审核结果：README 改为中英双语（英文在前、中文在后，互相跳转），满足“必须有英文介绍”的要求；英文部分按功能完整重写。单独的 README.en.md 合并后删除。
- 发布流程为 `main.js`、`manifest.json`、`styles.css` 签发 GitHub 构建来源证明（artifact attestation），可用 `gh attestation verify` 核验文件确由本仓库源码构建。
- 文档中的旧仓库地址统一为 mengren-obsidian-editor-plugin。插件代码与 0.1.8 相同。

## 0.1.8 - 2026-10-15

- 为提交 Obsidian 社区目录按官方规范整理：显示名改为 **Mengren Editor**（名称和描述不得含 “Obsidian” / “plugin”），新增英文描述；内部 ID `trader-editor-tools` 不变，设置、快捷键、备份保留。
- 设置页小标题改用官方 `setHeading()`，去掉重复的插件名大标题；弹窗标题使用 `titleEl`；“WoLai” 改为品牌写法 “wolai”。
- 去掉 3 处正则后行断言（部分 iOS 版本不支持），逐例对比结果与原写法一致；空 `catch` 块写明原因，清理未使用的变量和导入。
- 修复设置页“常用颜色”在真实 Obsidian 中渲染到第一个颜色选择器就报错、后面槽位不显示的问题（颜色组件元素为 `colorPickerEl`）；测试模拟同步改为真实 API 并断言 12 个选择器都渲染。
- 源码改为标准 ES 模块（`src/*.mjs`），运行依赖与开发依赖分开；官方 `eslint-plugin-obsidianmd` 推荐规则检查 0 错误（剩余 3 个建议级警告见 TESTING）。显示效果与 0.1.7 相同。

## 0.1.7 - 2026-10-15

- 代码块、引用、提示框（Callout）、表格、单独成段图片外侧各留半份正文空白（正文留白 + 半份行距，默认约 0.59em）：它们的背景框 / 竖线 / 框线到相邻文字、到另一个这类块，看到的空白都与两段正文文字之间相同（16px 时约 18.9px）。标题保留自身留白。
- 修复插件把代码块、引用旁的分隔空行压成 0 后，代码背景、引用竖线几乎贴住正文的问题；文字直接贴着代码块（无空行）时同样补齐。
- 编辑、阅读、导出 PDF 一致：阅读/PDF 按块容器的内容匹配，不再依赖阅读模式特有的 `el-*` 分区（PDF 导出没有这些分区，此前的表格留白在 PDF 中不生效）。
- 阅读 / PDF 中单独图片按行底对齐，去掉图片下方约 8px 的基线空隙；提示框不再叠加主题自带的 1em 外边距。
- 新增设置“表格、图片间距跟随正文”，默认开启；关闭后可分别设置图片、表格外侧留白。只改显示，不改笔记源码。
- 修复打开过弹出窗口并关闭后，停用 / 更新插件时卸载报错、插件停在未加载状态的问题；弹出窗口关闭时同时释放它的图片缩放监听。
- 102 项自动回归通过；Obsidian 1.14.4 实测编辑、阅读模式相邻块空白均为 18.88px，真实导出 PDF 逐行像素测量为 18–20px。

## 0.1.6 - 2026-10-05

- 重构文字样式为“读取 Markdown 语义和已有视觉属性 → 独立合并 → 规范化写回”，保留粗体/斜体/粗斜体/删除线/标准链接；行内代码和不安全语法保持原样。
- 颜色、高亮、下划线统一保存在带归属标记的 span 中；重复改色不嵌套，局部不同属性采用兄弟片段，同属性合并。
- 增加独立清除颜色、高亮、下划线命令/右键项；全部清除仅删除插件属性，最后一个属性删除后恢复干净 Markdown。
- 修复真实 Live Preview inline HTML 组件不继承外层 Markdown 语义的显示问题；临时派生类实时跟随粗体/斜体/删除线，不写回语义 CSS。
- 旧标签仅在明确编辑时规范化，不自动批量迁移；移除高亮自动前景色副作用，并注明旧标签归属及深色主题对比度边界。
- 98 项自动回归通过；Obsidian 1.13.7 Live Preview / Reading 与真实原生 PDF 逐项检查文字样式矩阵、局部选区和清除结果。

## 0.1.5 - 2026-10-03

- 新增默认开启的“保留连续空行的额外留白”：普通正文段落间第一个空行紧凑显示，额外空行保留行高；焦点移走不再丢失主动留白。
- 阅读/打印按源码位置显示额外空白，不依赖段落文本匹配，不写笔记；设置切换与停用清理显示节点，不重复叠加。
- 排除末尾空光标占位，保护代码、Tab 知识块、YAML、HTML、引用/Callout 内部结构；格式化保留已有连续空行。
- 修正 GitHub 安装说明中的附件名称；发布附件用独立英文后缀，避免平台规范化中文名称后冲突。
- 缓存最后一份阅读空行分析，避免每个源码区块反复解析整篇长笔记。
- 修复“设置光标处图片尺寸”面板不能回填普通 Markdown / 引用式图片已有宽高的问题；表格转义尺寸与文件名中的数字严格区分。

## 0.1.4 - 2026-10-03

- 插件更名为「猛人obsidian编辑插件」，设置、菜单和安装包采用中文名称；内部 ID、安装目录及仓库地址保留，已有设置、快捷键与备份不丢失。
- 恢复 Obsidian 原生编辑：移除 Enter 接管与自动分段开关，忽略旧 paragraphEnter 设置；不接管 Enter、Shift+Enter、Tab、Backspace。
- 聚焦编辑时，光标/选区所在的空白行、Tab 空行、空引用行保持可见；只压缩非活动结构空行，空白笔记仍可点击。
- 焦点变化只刷新显示，不写笔记；已验证的块间距与阅读/PDF 样式保持不变。
- 61 项回归通过（34 算法 + 27 浏览器）。真实 Windows 键盘测试验证 Tab/引用续行和空引用退出；Tab 续行与停用插件的原生结果一致。

## 0.1.3 - 2026-10-03

- Add optional Tab knowledge-row display, enabled by default: each physical line of a standalone Tab-indented block uses the same symmetric padding as list items; wrapping stays compact.
- Match Live Preview, Reading View and print styles without changing note source. Setting changes and plugin unload restore native code DOM/text.
- Preserve fenced/space-indented code; refuse conversion when identical real-code content makes matching ambiguous.
- Fix native diagnostics to place the vault selector before the CLI command.
- All 59 regressions pass, including wrapping, settings restoration and unchanged source. Native Windows measurements verify Tab rows in Live Preview and Reading View; print is covered by browser regression, not a new full native PDF export.

## 0.1.2 - 2026-10-03

- Fix missing paragraph padding for ordinary quotes, indented list paragraphs and standalone indented code; remove theme vertical margins without losing quote borders/indentation.
- Apply the same compact block gap to nested list items. Collapse quoted paragraph separator lines without collapsing real blank code lines.
- Detect two/three-space ordinary prose and preserve reference definition continuations. Indented code does not interrupt a prose paragraph without a blank line.
- Formatting optionally separates plain indented list paragraphs, keeps indentation/nesting, and handles return to unindented prose. Existing notes are never rewritten automatically.
- Add optional ordinary-prose Enter enhancement using standard blank lines; native list/quote/code/source-mode behavior remains available.
- Add a public mixed-block regression sample. All 57 regressions pass, including real CM6/Chromium gap measurements and Enter/undo tests; native Windows layout measurements cover Live Preview and Reading View.

## 0.1.1 - 2026-10-03

### Fixed

- 引用紧接外部标题/列表时，不再把后续全部行错误保护为引用续行。
- 围栏代码、水平线、HTML 等明确边界会结束引用状态；有序列表遵守以 1 开始的段落中断规则。
- 标题能够结束列表惰性续行；合法列表续行使用统一行高，底部块留白只在续行末尾添加。
- 格式化可为明确的顶层引用边界添加标准空行，保持引用内部、Callout 和嵌套结构。

### Added

- 引用边界、惰性续行与标准阅读结构回归测试；总计 51 项。
- 中英文使用文档、架构/贡献/发布指南、问题模板、CI 和发布工作流。
- GitHub Releases 安装包、完整源码包及 Obsidian 原生运行文件。

## 0.1.0 - 2026-10-03

- Initial local version: conservative paragraph formatting with preview/backup/undo.
- Verified compact em-padding layout with a 1.62 body line-height.
- Persistent native image resizing, including Excalidraw and escaped Markdown table cells.
- Text color, highlight, underline and clear-style commands, configurable palette and hotkey slots.
- Reading/PDF styles and 45 original automated regression tests.
