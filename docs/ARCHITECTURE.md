# Architecture / 架构

## Files

| Module | Responsibility |
| --- | --- |
| `src/main.mjs` | 插件生命周期、命令/菜单、模态预览、设置校验、备份 |
| `src/markdown.mjs` | 纯函数：保守行分类、格式化插空行、图片扫描/尺寸 token、表格边界与安全写回 |
| `src/layout.mjs` | CM6 行装饰、跨窗口 CSS 变量、输入行可见性、Tab 知识行 postprocessor |
| `src/image-resize.mjs` | 源码定位、Pointer Events、覆盖层、尺寸提交、并发保护 |
| `src/blocks.mjs` | 纯函数：拖动移动块的块范围（标题整节 / 列表项含子项 / 正文段 / 图片行）、落点、移动后的文本与空行 |
| `src/block-drag.mjs` | CM6 ViewPlugin：悬停把手、Pointer 拖动、落点线、自动滚动、单事务写入与折叠保持 |
| `src/text-style.mjs` | Markdown 行内语义树、视觉属性读取/合并/规范化、快照与单事务提交 |
| `src/text-style-view.mjs` | 从源码语义派生 LP HTML 组件的粗体/斜体/删除线显示，不写笔记 |
| `src/speech-text.mjs` | 纯函数：Markdown → 朗读句子，每个字保留原文偏移；跳过属性区/代码/公式/注释/网址/嵌入，按句末标点和行切句，超长句在软停顿处切开 |
| `src/speech.mjs` | 听书：系统朗读（Web Speech API）播放控制、编辑器高亮 StateField、阅读模式 CSS Highlight、播放条、朗读位置记录 |
| `styles.css` | Live Preview / 语义阅读块 / PDF 样式和非打印控件 |
| `tests/` | 纯算法与真实 CM6/Chromium 夹具回归 |

## Formatting

1. Read editor text and conservative source classification.
2. Compute blank-line insertions, preserving original characters and line endings.
3. Show original/result. No write before confirmation.
4. Recheck file/text, save optional original backup, recheck again.
5. Apply one editor transaction; current session can undo once.

分类器不是完整 CommonMark parser。它保留 YAML、围栏代码、引用/Callout、嵌套列表、HTML、表格和不确定的多行内联语法。0.1.1 专门修复状态边界：引用不能把“直到下一个空行的所有内容”都保护起来；外部标题、列表等可立即中断引用，而真正惰性续行仍属于原块。

源码未提供空行时，合法软换行/列表续行仍按原结构解释。明确逐行分段只发生在用户格式化命令里；排版装饰不伪造新的语义段落。

0.1.3 的 Tab 知识行是明确标注的可关闭显示增强：标准 Markdown 的独立 Tab 缩进仍为代码块，不改源 Tab，不声称改变标准段落语义。仅当独立缩进块所有非空行都以 Tab 开头时，LP 每个物理行加独立留白；阅读 postprocessor 根据 section 原文与 code 文本匹配生成行 span，保留原始文本/换行。围栏、空格缩进和同文真实代码歧义保守不转换。设置变化及 unload 清理 span、恢复 code 文本；自动折行不插 DOM 换行或额外留白。PDF 使用同一渲染后行样式。

0.1.2 分类返回引用分隔行、缩进代码和普通列表续段元数据：不再把所有缩进行都当不可排版的不透明块。独立缩进代码的内部空行保留。显式格式化可分隔普通列表缩进正文，并在返回顶层正文时终止列表；不去缩进、不拆代码/多行内联表达。

## Layout

一个块上下各 0.28em；关闭主题段落/list 的额外间距；LP 结构性空行视觉高度为零。

0.1.7 “涂色块”（围栏代码背景、引用竖线、Callout 盒子、表格框线、单独图片；之后加入 Tab 知识行灰底与分割线）外侧各留 `--tet-paint-gap` = 块留白 + 半份行距（按约 1em 的中文字形计算），使“涂色边 ↔ 文字字形”“涂色边 ↔ 涂色边”与正文字形之间的可见空白相同。该变量用 `@property` 注册为长度，在编辑/阅读根节点各解析一次，标题行引用时不随标题字号放大。LP：`paintedGaps()` 只认顶格代码块与引用，给它们旁边第一个普通空行加 `tet-paint-gap`（两侧都是时 `tet-paint-gap-2`），无空行直接相连时给贴着的非涂色行加 `tet-paint-above/below`（用 padding，不用 border，避免整像素取整）；表格 widget、图片行、块状嵌入图（`.cm-content > .internal-embed.image-embed`，如 Excalidraw）和分割线行（`.cm-line.hr`）自带该留白。Tab 知识行段由布局传入 `paintedGaps({tabRows})` 计为涂色，编辑模式把整段画成与阅读模式相同的代码背景块（首尾行圆角，隐藏缩进参考线）。阅读/PDF：PDF 导出在隐藏窗口里把每个顶层块包进无类名的 div（`.print > .markdown-preview-view > div`），没有 `el-*` 分区，因此规则按容器所含内容匹配 `:is(.markdown-preview-sizer, .print > .markdown-preview-view) > div:has(> …)`，两处共用。

普通引用、嵌套列表、列表内已有空行的续段与独立缩进代码参与同一留白模型。阅读模式取消容器的重复 padding；列表/引用内部段落之间只留下等效 0.56em。0.1.4 移除 Enter keymap 和 paragraphEnter 设置，全部键盘编辑规则交由宿主，文档改变仅来自宿主原生编辑或明确执行的插件写入命令。

编辑器焦点/选区变化时重新计算行装饰：光标或选区覆盖的结构空行获得 tet-input-gap，保留可见行高；其他 tet-gap/tet-quote-gap 才压缩到零。失焦/移走光标恢复紧凑显示；空文档保留可点击输入区域。装饰只改变视图，不派发内容编辑，不改阅读/PDF DOM，也不增加永久块留白。

`layoutVersion:2` 用于从旧像素原型迁移设置，保留配色与功能开关。阅读与 PDF 使用语义 `p/li/h*`，打印不显示覆盖层。第三方主题仍可能改变字体、特殊容器与页宽。

## Image selection and commit

- LP 通过注册的 CM6 editorInfoField、DOM anchor 和文档偏移匹配 token。
- 表格 widget 的 DOM anchor 可能只指向表头；另用 rendered row/cell 映射到 source row/cell，排除 Markdown delimiter 行。
- 阅读模式通过 Markdown postprocessor section 信息定位；重复实例仅在源码/DOM 数量完全匹配时用顺序映射。
- 核心图片可能让 wrapper 而非 IMG 接收鼠标；Excalidraw 异步替换为 `filesource` wrapper，需要按解析后的规范路径匹配。
- 拖动只改变固定覆盖层，不触发每个 mousemove 的表格重排。
- Pointer release 校验原文未变、file 未换、表格列数不变，写一次事务或 guarded `vault.process`。
- Reading 无打开的编辑器时先备份；不在脏编辑器背后静默写文件。

优先写原生 `![[path|width]]` / Markdown alt dimensions；表格转义 pipe。别名需要原生 Markdown 表达时，转换时保留相对解析路径和说明。Excalidraw 是可选依赖；兼容 registry probe 有 guard，不使未安装绘图插件时整个插件崩溃。

## Text styles

调色板打开前捕获文本/文件/选区，确认文本仍一致后提交。Marked Lexer 读取行内语义树，但不从 HTML 反向生成 Markdown：原 delimiters、链接目标和标题字节原样保留。视觉标签展平为属性，选区内只修改目标属性，输出统一 owned span；相邻相同属性合并、空属性解包。混合语义保留多个兄弟 span，受保护语法不插入标签。详细流程和边界见 [TEXT-STYLES.md](TEXT-STYLES.md)。

Live Preview 将 inline HTML 渲染为独立组件，不能仅凭 span 外层 `**` 期待继承粗体。新增 ViewPlugin 通过 posAtDOM 映射源位置，派生临时语义类；MutationObserver 处理异步 widget 重建，requestMeasure 分离读写。语义改变或停用时清理派生类，持久化 CSS 只含视觉属性。Reading/PDF 不需要此补偿。

## Block drag

`blocks.mjs` 复用 `classify()` 的保守分类，只在源码行上计算：`blockAt` 给出把手所属块（标题到下一个同级或更高级标题；列表项按缩进列数含子树与惰性续行；正文为相邻的正文行；图片单行），`dropTargets` 列出落点（标题只落在其他标题前 / 笔记末尾；列表项落在任一列表项前或其子树后并带该项的缩进前缀），`moveBlock` 产生新文本：先移除块并把留下的两个分隔空行并成一个，再按落点补空行，列表项按目标前缀改写缩进。都是纯函数，核心测试覆盖。

`block-drag.mjs` 是独立 ViewPlugin：鼠标在编辑器里移动时按高度（`lineBlockAtHeight`，折叠的标题和图片组件都算一行）找块，把手放在 `.cm-editor` 内、块首行文字左侧（标题和列表让开 Obsidian 的折叠箭头）。按下把手后 pointer capture，按落点的行顶和缩进 x 选最近的一个，画落点线和被拖块的浅底；靠近滚动区上下边缘逐帧滚动。松手时原文未变才写：取前后公共部分，只替换中间一段，一次事务一次撤销；原来折叠的标题用 `@codemirror/language` 的 `foldEffect` 重新折叠（Obsidian 提供该模块，构建时 external）。折叠区里看不见的落点不参与选择。只认鼠标（pointerType mouse），触屏保持原生选择；只读编辑器不显示把手。

## Listening

两种朗读来源：系统声音（Web Speech API）与百度翻译朗读音频（`requestUrl` 取 MP3，`Blob` + `Audio` 播放，语速用 `playbackRate`，预取后两句，内存缓存上限 6 句，停止时清空并释放对象 URL）。“自动”在 `speechSynthesis` 不存在或首句 5 秒无声时改用百度。系统声音一次只朗读一句（`SpeechSynthesisUtterance`），读完由 `onend` 推进；系统声音的暂停 = 取消并在继续时重读当前句，避免各平台 `pause()` 行为不一；百度音频暂停后从句中继续。每次朗读带递增 token，取消产生的迟到事件被忽略；首次朗读 5 秒内既没开始也没在说话，判定设备不能发声并提示。编辑模式的当前句写进 CM6 StateField，随编辑映射；下一句开始前若笔记已改，按映射位置重新切句接着读。阅读模式用 CSS Custom Highlight API 画高亮，不改阅读 DOM；只在包含该句源码偏移的已渲染分区里查找文字（依赖 `previewMode.renderer.sections` 的 `start/end.offset`，属内部数据，缺失时退回整页查找），找不到时按行号滚动后重试。朗读位置存 `data.json` 的 `speechProgress`，加载与写入时裁剪为最近 200 篇、180 天。

## Maintenance risks

Obsidian 内部 editor DOM、表格 widget 和第三方 Excalidraw 渲染器可能改变。公共 API 优先，少量 registry/DOM 兼容点需注明版本并补实机验证。手写 Markdown 边界不能泛化为“所有格式均支持”；模糊结构保守处理。移动触控/软键盘仍需真机专项验收。
