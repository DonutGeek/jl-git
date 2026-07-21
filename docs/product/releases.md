# 发布规范

> **相关文档：** [roadmap](roadmap.md) · [CHANGELOG](../../CHANGELOG.md) · [CONTRIBUTING](../../CONTRIBUTING.md)

---

## 版本号

遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

| 变化 | 版本 |
|------|------|
| 不兼容的 Command/API 或用户数据迁移 | MAJOR |
| 向后兼容的功能 | MINOR |
| 向后兼容的修复 | PATCH |

预发布：`0.x` 阶段允许较快迭代；进入 `1.0` 后严格 semver。

应用版本与 `package.json` / `src-tauri/tauri.conf.json` / `Cargo.toml` **保持一致**。

### 自动同步版本

不必每次手改三处，任选其一：

1. **本地一键写入（推荐提交进仓库后再打 tag）**
   ```bash
   pnpm version:set 1.0.2
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
   git commit -m "chore(release): 1.0.2"
   git tag v1.0.2
   git push origin main v1.0.2
   ```
2. **仅打 tag**：CI（`publish-desktop`）会在构建前执行 `scripts/set-version.mjs`，按 `vX.Y.Z` 写入三处后再打包。  
   注意：这只影响 CI 构建产物；若希望 `main` 上的版本号也一致，仍建议用方式 1 提交一次。

脚本：`scripts/set-version.mjs`（`pnpm version:set <version>`）。

---

## 发布检查清单

1. [ ] `feature-list` 状态已更新
2. [ ] `CHANGELOG.md` 的 `[Unreleased]` 已归入新版本节
3. [ ] Command/API 文档与实现一致
4. [ ] 版本已同步（`pnpm version:set X.Y.Z` 或依赖 CI 按 tag 写入）
5. [ ] `pnpm build` 与 `pnpm tauri build` 通过
6. [ ] 手工验收关键路径（见 [testing](../development/testing.md)）
7. [ ] 无密钥提交；updater 公钥不进错误渠道
8. [ ] 打 tag：`vX.Y.Z`（小写 `v`）并 push
9. [ ] 确认 Release 含安装包与 `latest.json`（线上升级）

---

## CHANGELOG 写法

- 分类：`Added` / `Changed` / `Fixed` / `Security` / `Deprecated` / `Removed`
- 面向用户与贡献者，写清影响
- 关联 PR/Issue 可选
- **不**把未完成计划写进已发布版本节（计划在 roadmap）

---

## 发布说明（Release Notes）

GitHub Release 正文建议结构：

```markdown
## 亮点
- …

## 变更
- …

## 修复
- …

## 升级注意
- …
```

AI 生成 Release Notes 时，必须以 CHANGELOG 与提交记录为输入，并经人工审阅。见 [ai](ai.md)。

---

## 更新通道（GitHub Releases 线上升级）

应用通过 `tauri-plugin-updater` 读取：

`https://github.com/DonutGeek/jl-git/releases/latest/download/latest.json`

流程：

1. 打 tag `vX.Y.Z` 并 push → `publish-desktop` 构建 macOS DMG / Windows NSIS，并上传 updater 产物与 `latest.json`
2. 用户点击状态栏「更新」→ 比对版本 → 确认后下载、验签、安装并重启

### 首次启用必做（维护者）

1. 本地已生成密钥对（仓库外 / `.secrets/`，**私钥永不提交**）：
   ```bash
   pnpm tauri signer generate -w .secrets/jlgit-updater.key
   ```
2. 公钥写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`（当前已配置）
3. 在 GitHub 仓库 **Settings → Secrets** 添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：私钥文件**全文**（与 `.secrets/jlgit-updater.key` 内容一致）
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：若生成时设了密码则填写，否则可留空
4. 丢失私钥后无法为后续版本签名，已安装客户端将无法继续线上升级——务必备份私钥到安全位置

- 稳定版：默认（`releases/latest`）
- 可选后续：beta 通道（不同 endpoint）

---

## 热修

- 从发布 tag 拉 `hotfix/x.y.z` 分支
- 只含修复；升 PATCH
- 合并回 `main`
