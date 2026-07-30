# 发布规范

> **相关文档：** [roadmap](roadmap.md)

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
2. [ ] Command/API 文档与实现一致
3. [ ] 版本已同步（`pnpm version:set X.Y.Z` 或依赖 CI 按 tag 写入）
4. [ ] `pnpm build` 与 `pnpm tauri build` 通过
5. [ ] 手工验收关键路径（见 [testing](../development/testing.md)）
6. [ ] 无密钥提交；updater 公钥不进错误渠道
7. [ ] 打 tag：`vX.Y.Z`（小写 `v`）并 push
8. [ ] 确认 Release 含安装包与 `latest.json`（线上升级）

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

AI 生成 Release Notes 时，必须以提交记录为输入，并经人工审阅。见 [ai](ai.md)。

---

## 更新通道（GitHub Releases 线上升级）

应用通过 `tauri-plugin-updater` 读取公开仓：

`https://github.com/DonutGeek/jl-git-releases/releases/latest/download/latest.json`

| 仓库 | 用途 |
|------|------|
| 源码仓（可私有，如 `jl-git`） | 开发、打 tag、跑 CI；Release **同步**一份安装包 |
| [jl-git-releases](https://github.com/DonutGeek/jl-git-releases)（**必须 Public**） | 安装包 + `latest.json`；**客户端 updater 只读这里**（匿名） |

流程：

1. 源码仓打 tag `vX.Y.Z` 并 push → `publish-desktop` **构建一次**  
2. CI 先发到 **jl-git-releases**，再把同一 tag 的资产镜像到源码仓 Release  
3. 客户端 updater endpoint 仍指向公开仓；两处 Releases 页面都能下载安装包

### 支持矩阵

| 平台 | 架构 | 安装包 | updater `platforms` 键 |
|------|------|--------|------------------------|
| macOS | Apple Silicon | `.dmg` + `.app.tar.gz` | `darwin-aarch64` |
| Windows | x64 | NSIS | `windows-x86_64` |
| Linux | x64 | AppImage | `linux-x86_64` |

Linux 参考环境：Ubuntu 22.04 / 24.04 + GNOME。平台窗口配置见 `tauri.{macos,windows,linux}.conf.json`。

### 线上升级排障（必看）

| 现象 | 常见原因 |
|------|----------|
| 检测不到新版本 | Release **缺少**对应平台资产 + `.sig`；或 `latest.json` 无当前键（`darwin-aarch64` / `windows-x86_64` / `linux-x86_64`） |
| 检查更新失败（红 toast） | 会区分超时 / 网络 / 清单未找到（发包中）/ 服务器异常，并尽量带出细节。**不是**「已是最新」；已是最新为绿提示 |
| 检查更新 404 | 确认 endpoint 指向 **jl-git-releases**；浏览器未登录打开 `latest.json` 须 200 |
| CI 发布失败 | 源码仓未配置 `RELEASES_GITHUB_TOKEN`；或公开仓尚无 `main`（先提交 README）；Linux job 缺 WebKitGTK 依赖 |
| 开发模式提示不可用 | 预期：仅正式安装包支持线上升级 |

手动验收：未登录打开  
`https://github.com/DonutGeek/jl-git-releases/releases/latest/download/latest.json`  
须为 200，且 `platforms` 含当前系统键。

### 首次启用必做（维护者）

1. 公开仓 [jl-git-releases](https://github.com/DonutGeek/jl-git-releases) 至少有一次提交（如 README），保证存在 `main`  
2. 本地已生成密钥对（仓库外 / `.secrets/`，**私钥永不提交**）：
   ```bash
   pnpm tauri signer generate -w .secrets/jlgit-updater.key
   ```
3. 公钥写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`（当前已配置）  
4. 在**源码仓** Settings → Secrets 添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：私钥全文  
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：有密码则填，否则可留空  
   - `RELEASES_GITHUB_TOKEN`：PAT（classic 或 fine-grained），对 `DonutGeek/jl-git-releases` 具备 **Contents: Read and write**，用于跨仓创建 Release  
5. 丢失签名私钥后已装客户端无法继续验签升级——务必备份  

- 稳定版：公开仓 `releases/latest`  
- 可选后续：beta 通道（不同 endpoint）

---

## 热修

- 从发布 tag 拉 `hotfix/x.y.z` 分支
- 只含修复；升 PATCH
- 合并回 `main`
