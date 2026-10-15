# Mengren Editor

Formerly 猛人obsidian编辑插件. Since 0.1.8 the display name is **Mengren Editor** to follow the Obsidian Community directory rules; the internal ID `trader-editor-tools` is unchanged, so settings, hotkeys and backups carry over.

An MIT-licensed Obsidian plugin for compact Markdown layout, persistent image resizing, text colors, highlights and underlines. Maintained by [longpeng1413](https://github.com/longpeng1413).

[中文说明](README.md) · [Releases](https://github.com/longpeng1413/trader-editor-tools/releases/latest) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](TESTING.md)

## Install

Download `trader-editor-tools-0.1.8-install.zip` from Releases (the local Chinese installer is `Mengren Editor-0.1.8-安装包.zip`). GitHub assets use distinct ASCII suffixes to avoid normalized-name collisions. Extract the inner `trader-editor-tools` folder into **your vault**, not the Obsidian program directory:

```text
VAULT/.obsidian/plugins/trader-editor-tools/
  manifest.json
  main.js
  styles.css
```

Enable **Mengren Editor** in Settings → Community plugins. The UI is primarily Chinese. The original internal ID, folder `trader-editor-tools` and GitHub repository URL remain unchanged to preserve settings, hotkeys and backups; do not create a second folder for the same ID. Avoid an extra outer directory. Keep Excalidraw installed if you use drawings; this plugin does not replace it. The plugin is **not yet listed in the Obsidian community directory**.

For upgrades, disable the plugin, replace its runtime files, and enable it again. Preserve your `data.json` and `backups/` directory.

## Features

- Standard Markdown paragraph formatting, with preview, optional local backup and one editor undo transaction. Existing notes are never reformatted automatically.
- Compact layout: body line-height 1.62; paragraphs and top-level list items have 0.28em padding on each side. No extra native paragraph/list gap is stacked on top.
- Painted blocks (fenced code backgrounds, quote bars, Callout boxes, table borders, standalone images) keep half of the visible prose gap outside their paint (block padding + half the line leading, about 0.59em). Paint to text and paint to paint therefore look like text to text (about 18.9px at 16px). Headings keep their larger spacing. Live Preview, Reading and PDF export use the same rule; Reading/PDF match block wrappers by content, so they do not depend on Reading-only section classes. Only unindented code and quotes count; indented ones inside lists keep list spacing. "Table and image spacing follows body" is on by default; turn it off to tune image/table padding separately.
- Symmetric heading padding: H1 0.95em, H2 0.82em, H3 0.70em, H4–H6 0.58em on each side.
- Click an image and drag any corner to resize proportionally; hold Alt for independent width/height. Dimensions are saved using Obsidian's native embed/alt syntax.
- Markdown table images and Excalidraw embeds are supported. The table pipe is escaped and column counts are validated before writing.
- Selection colors, background highlights, underlines and clear-style commands, available through the editor context menu, command palette and user-assigned hotkeys. Colors are customizable Hex values stored in readable standard HTML.
- Reading View and PDF share semantic block styles. PDF controls are hidden and colors preserved.

Version 0.1.2 extends equal block spacing to quotes, nested lists, indented list paragraphs and standalone indented code. Quoted blank paragraph separators collapse in Live Preview. Formatting can insert missing list-paragraph separators without changing indentation, including when returning to unindented prose.

Version 0.1.3 adds **Tab knowledge rows**, enabled by default and optional in settings. Standalone indented blocks whose nonblank lines all start with a Tab (optionally after 0–3 spaces) get 0.28em padding on each side of each physical line, matching list items. Wrapping within one line stays at line-height 1.62. Live Preview, Reading View and print styles use the same model; internal blank separators do not add gaps. No source text is modified.

Standard Markdown treats standalone Tab indentation as code, not paragraphs. This is an explicit display enhancement, not a source-format conversion: disabling it or the plugin restores native code rendering. Fenced and space-indented code remain unchanged; ambiguous identical code blocks are left untouched. Disable this option if Tabs denote programming code. Standard blank-line-separated paragraphs are still recommended for new prose.

Version 0.1.4 restores **native Obsidian editing**. The plugin no longer registers an Enter handler or inserts blank paragraph separators on keystrokes. Enter, Shift+Enter, Tab and Backspace belong to the host editor; quote/list/indent continuation and exit follow Obsidian's settings. The old `paragraphEnter` setting is ignored and its toggle removed. To create a standard paragraph, use a blank line or explicitly confirm the formatting preview.

While editing, blank, Tab-only and empty quote-prefix rows containing the caret/selection remain visible and editable. Other structural separators still collapse; moving away or blurring the editor restores compact display. An empty note remains clickable. This temporary input space does not modify text or change Reading/PDF spacing. Source mode remains native.

Version 0.1.5 preserves intentional **multiple plain blank lines**, enabled by default. Between blocks, one blank remains a compact separator; each additional blank adds one line-height of persistent space in Live Preview, Reading View and print styles. Thus two Enter presses followed by prose create a normal paragraph; three presses add one extra blank row. Formatting retains existing blank runs. The final empty caret position is not counted as a saved blank. Native Enter and undo remain untouched.

Reading spacers use source section line positions, not text matching, and are removed when disabled/unloaded. Unknown third-party renderers without reliable source positions are left unchanged. Code (including Tab knowledge blocks), YAML, HTML and quote/Callout internal blank rows are protected. No private syntax or document writes are introduced. Standard Markdown renderers collapse extra blanks when the plugin is disabled; the source still retains them. Native Reading/Live Preview were checked on Obsidian 1.13.7; print is covered by browser regression, not a fresh complete native PDF export.

## Safety and limits

No telemetry, network calls or external service is used by the plugin. Formatting runs only after preview confirmation; resizing writes only after release/save. Stale document or ambiguous image matches are rejected. Backups remain local and are never automatically deleted.

Formatting is conservative, not a complete Markdown parser/reflow engine. If a note uses physical soft line breaks deliberately, turn off per-line paragraph splitting. Quotes/Callouts, nested lists, YAML, code and uncertain inline constructs are protected. Semantic paragraph conversion requires an explicit formatting command, not visual CSS tricks.

Windows / Obsidian 1.13.7 / default theme / Excalidraw 2.27.3 have native testing evidence. Other themes, complex HTML and third-party rendering variants may differ. Android/iOS installation is permitted by the manifest, but **mobile touch and keyboard behavior have not been tested on real devices**. There is no mobile floating toolbar in this version.

Version 0.1.6 merges independent color, background and underline properties into one owned span per semantic text run, outside of which native Markdown delimiters remain intact:

```markdown
**<span data-mengren-style="1" style="color: #d64545; background-color: #ffe1bd; text-decoration: underline;">Important</span>**
```

Changing a property updates it without nested visual wrappers. Separate clear-color, clear-highlight, clear-underline and clear-all commands preserve native emphasis, strike and links. Removing the last property unwraps the span. Live Preview HTML widgets receive source-derived semantic display classes; Reading/PDF use native Markdown parsing. Highlights never silently change the foreground: choose a suitable color yourself on dark themes. Marked is bundled; see [third-party notices](THIRD-PARTY-NOTICES.md).

Styling protects inline code, wiki links/embeds, escapes and link targets. Mixed selections leave those bytes unchanged; selections containing only protected syntax are rejected. Use one physical line and table cell at a time. Foreign attributes/CSS are retained; malformed HTML is rejected. Exact legacy wrapper forms are recognized only on explicit editing, but indistinguishable hand-written legacy tags have ambiguous ownership. Different semantic runs or partial selections may need sibling spans, not nested spans. This is not an unrestricted rich-text editor. Free image height is renderer-dependent; proportional width is recommended.

## Mobile use

Enable editing, select text, then open Obsidian's command palette and run the text color/highlight/underline command. You can add these commands to the mobile toolbar. Sync the plugin runtime files and optionally `data.json`; check whether your sync tool includes hidden `.obsidian` files. Excalidraw must also be enabled on each device.

## Develop

Use Node.js 22+ and pnpm 9:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

Browser tests default to Windows Edge. Set `TET_BROWSER` to another Chromium executable, or install the pinned Playwright Chromium and point the environment variable to `require('playwright').chromium.executablePath()`. Fixtures use real CodeMirror 6, but mock the Obsidian API and drawing renderer.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and test guidelines and [docs/RELEASING.md](docs/RELEASING.md) for tag-based releases.

Please report bugs with **anonymized minimal Markdown**, Obsidian/plugin versions and editor mode. Do not upload your complete vault, backups, account information or private attachments.
