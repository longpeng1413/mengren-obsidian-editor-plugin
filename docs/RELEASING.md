# Releasing / 发布流程

日常顺序：先本地构建并 `pnpm deploy:local` 装到自己的笔记库试用，确认后再提交、打 tag 发布（发布即触发社区目录自动审核）。本地试用期间不要把改了版本号的 manifest 推到 `main`：Obsidian 检查更新时先读主分支 manifest 的版本，再下载同名 tag 的发布文件。

## Before tagging

1. 所有回归测试通过；涉及行为修改时做独立测试库实机验证。
2. 同步 `manifest.json`、`package.json`、`versions.json`、README 版本、CHANGELOG 和 TESTING；构建 banner 自动读 manifest。
3. `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm test`。
4. 跑官方 `eslint-plugin-obsidianmd` 推荐规则（含 manifest / LICENSE 校验），0 错误。
5. 检查 Git diff 和公开内容。只提交源代码、通用示例、说明、构建结果和工作流。
6. Commit and push `main`；等待 CI 通过。

## Tag and release

Tag 必须与 manifest 的版本完全一致，不加 `v`（例如 `0.1.1`）：

```sh
git tag -a 0.1.1 -m "Release 0.1.1"
git push origin 0.1.1
```

`release.yml` 验证 tag/manifest/package 版本一致，重新构建和运行纯算法测试，签发构建来源证明，通过仓库临时 `GITHUB_TOKEN` 发布 Release。Token 不写入代码或日志，不需维护者存长期密钥。

Release assets（`main.js`、`manifest.json`、`styles.css` 附 GitHub 构建来源证明，可用 `gh attestation verify main.js --repo longpeng1413/mengren-obsidian-editor-plugin` 核验）:

- `manifest.json`, `main.js`, `styles.css`（只发布 Obsidian 会下载的文件；`versions.json` 由 Obsidian 从仓库读取）

内部 ID 和插件目录仍为 `trader-editor-tools`，不要因显示名称变化迁移用户设置或重复安装。编译文件头附完整 bundled Marked 许可，下载单独 main.js 时也携带许可。发布时不要覆盖已有不同内容的同版本 tag；修复应增加新版本。

## Verify after publishing

检查 Release URL、assets 和公开默认分支；从 GitHub 下载运行文件核对 hash。验证 CI/release workflow 成功，必要时看失败日志而不是重复发布。对已安装 vault 升级只替换运行文件，保留用户 `data.json` 和备份。

## Community directory

2026-10-15 复核的官方流程（2026-05-12 起启用 Obsidian Community，不再向 `obsidian-releases` 提交 PR）：

1. 仓库根目录需要 `README.md`、`LICENSE`、`manifest.json`；默认分支 HEAD 的 manifest 会被读取。
2. 发布 GitHub Release，tag 与 `version` 相同，附件含 `main.js`、`manifest.json`、`styles.css`（本仓库推送 tag 后由 `release.yml` 自动完成）。
3. 作者用 Obsidian 账号登录 community.obsidian.md 开发者后台，连接 GitHub 账号验证仓库所有权，选择仓库提交。
4. 自动审核几分钟出结果（政策、代码质量、已知漏洞、恶意代码）；通过后 24 小时内可在 Obsidian 内搜索安装。之后**每个新版本**都会被自动审核，不通过的版本 24 小时内从搜索下架；后台可对任意分支 / tag / commit 做预检扫描。
5. 发布前本地自查：官方 `eslint-plugin-obsidianmd`（recommended 配置）。

manifest 硬性规则（`validate-manifest`）：`id`、`name`、`description` 不得包含 “obsidian” 或 “plugin”（不区分大小写）；`description` 10–250 字符、大写字母开头、句号结尾、只能含英文字母数字空格和 `.,!?'"-`。开发者政策还要求：不得暗示官方出品、无客户端遥测、不自行更新、联网 / 付费 / 账号 / 访问库外文件需在 README 说明。不要在 README 宣称已上架，直到目录中确实可搜索安装。
