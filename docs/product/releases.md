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

---

## 发布检查清单

1. [ ] `feature-list` 状态已更新
2. [ ] `CHANGELOG.md` 的 `[Unreleased]` 已归入新版本节
3. [ ] Command/API 文档与实现一致
4. [ ] `pnpm build` 与 `pnpm tauri build` 通过
5. [ ] 手工验收关键路径（见 [testing](../development/testing.md)）
6. [ ] 无密钥提交；updater 公钥不进错误渠道
7. [ ] 打 tag：`vX.Y.Z`
8. [ ] 上传安装包与校验和（若提供 GitHub Releases）

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

## 更新通道

- 稳定版：默认
- 可选后续：beta 通道（不同 endpoint）
- 未配置 `plugins.updater` 时，应用内不提示虚假更新

---

## 热修

- 从发布 tag 拉 `hotfix/x.y.z` 分支
- 只含修复；升 PATCH
- 合并回 `main`
