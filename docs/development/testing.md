# 测试

> **相关文档：** [coding-style](coding-style.md) · [quality](quality.md) · [command](../architecture/command.md)

交付前必须按 [quality](quality.md) 做 **Bug 分级自检** 与运行时冒烟。S0/S1 未清不得声称完成。

---

## 目标

用**最少但高价值**的测试保护边界：解析、路径安全、Service 契约。不追求虚高覆盖率。

---

## 测试金字塔

```
少量 E2E / 手工桌面验收
    ↑
中量集成（Service + mock invoke）
    ↑
大量单元（纯函数 / 解析器）
```

---

## 前端

当前不配置 JavaScript 单元测试框架。前端改动通过 `pnpm check`、`pnpm build` 与相关桌面运行时冒烟验收。

---

## Rust

| 类型 | 测什么 |
|------|--------|
| 单元 | 路径是否在 repo 根内；参数构造 |
| 解析 | stdout fixture → DTO |
| 集成 | 在临时目录 `git init` 后跑 runner（可选，CI 需有 git） |

生产路径避免 `unwrap`；测试中可用。

---

## 契约测试

`docs/architecture/command.md` 与 TypeScript `types` 应对齐。  
推荐：共享 JSON schema 或至少在 PR 检查「新增 command 是否改文档」。

---

## 手工验收清单（发布）

发布级验收见下；日常改动的冒烟与级别门禁见 [quality](quality.md)。

- [ ] 添加 / 打开 / 移除项目
- [ ] status → stage → commit → 日志可见
- [ ] 切换仓库标签：壳层保留、无整页闪白、无无限重渲染
- [ ] fetch/pull/push（测试远程）
- [ ] 主题切换、设置持久化
- [ ] 危险操作确认框
- [ ] 无 git / 坏路径时的错误提示
- [ ] 无已知 S0/S1（见 quality 分级）

---

## CI（目标）

```
pnpm install
pnpm build          # tsc + vite
cargo test          # src-tauri
```

当前脚手架可先本地执行；CI 配置落地时更新本文。

---

## 高风险改动验收

- 新增/修改 Git 输出解析：补 Rust 测试或固定 fixture 验证
- 路径安全相关函数：必须补 Rust 测试
- 易回归的状态机：执行对应桌面冒烟
- 曾线上/本地出现过的 bug：记录复现步骤并验证修复
