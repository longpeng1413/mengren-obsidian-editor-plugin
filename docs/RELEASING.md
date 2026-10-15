# Releasing / 发布流程

GitHub Releases 是手动安装渠道；它不等于 Obsidian 社区市场上架。

## Before tagging

1. 所有回归测试通过；涉及行为修改时做独立测试库实机验证。
2. 同步 `manifest.json`、`package.json`、`versions.json`、README 版本、CHANGELOG 和 TESTING；构建 banner 自动读 manifest。
3. `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm test`。
4. `pwsh -File scripts/package.ps1 -OutputDirectory ./dist`；确认安装 ZIP 是单层 `trader-editor-tools/`，不含 `data.json`、`backups/`、私人笔记或 `node_modules`。
5. 检查 Git diff 和公开内容。只提交源代码、通用示例、说明、构建结果和工作流。
6. Commit and push `main`；等待 CI 通过。

## Tag and release

Tag 必须与 manifest 的版本完全一致，不加 `v`（例如 `0.1.1`）：

```sh
git tag -a 0.1.1 -m "Release 0.1.1"
git push origin 0.1.1
```

`release.yml` 验证 tag/manifest/package 版本一致，重新构建和运行纯算法测试，用打包脚本生成 ZIP，通过仓库临时 `GITHUB_TOKEN` 发布 Release。Token 不写入代码或日志，不需维护者存长期密钥。

Release assets（`main.js`、`manifest.json`、`styles.css` 附 GitHub 构建来源证明，可用 `gh attestation verify main.js --repo longpeng1413/mengren-obsidian-editor-plugin` 核验）:

- `manifest.json`, `main.js`, `styles.css`, `versions.json`
- `trader-editor-tools-VERSION-install.zip`
- `trader-editor-tools-VERSION-source.zip`

本地安装包使用中文显示名称；GitHub 附件采用不同英文后缀，避免中文文件名规范化冲突。包内目录和内部 ID 仍为 `trader-editor-tools`，不要因显示名称变化迁移用户设置或重复安装。0.1.6 把 THIRD-PARTY-NOTICES.md 纳入安装与源码包，并在编译文件头附完整 bundled Marked 许可；下载单独 main.js 时也携带许可。

先保留默认 pnpm 锁文件。源码包不含开发依赖、账户凭据、vault 设置/备份；包含 CI 和全部公开文档。发布时不要覆盖已有不同内容的同版本 tag/ZIP；修复应增加新版本。

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
