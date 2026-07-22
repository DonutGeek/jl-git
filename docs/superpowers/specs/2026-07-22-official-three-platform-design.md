# 官方三端支持设计

> 日期：2026-07-22  
> 状态：已批准（方案 A：发版先行）  
> 相关：[windows-window-chrome](./2026-07-22-windows-window-chrome-design.md) · [releases](../../product/releases.md) · [tauri](../../architecture/tauri.md)

---

## 1. 目标

正式支持并文档承诺：

| 平台 | 架构 | 安装包 | 线上升级 |
|------|------|--------|----------|
| macOS | aarch64 | `.app` / `.dmg` + updater `.app.tar.gz` | `darwin-aarch64` |
| Windows | x86_64 | NSIS | `windows-x86_64` |
| Linux | x86_64 | **AppImage only** | `linux-x86_64` |

Linux 参考环境：**Ubuntu 22.04 / 24.04 + GNOME**。其他发行版尽力而为，不写死 SLA。

---

## 2. 非目标（首期）

- Linux aarch64、deb/rpm/Flatpak
- 「任意发行版」兼容承诺

外部工具：设置选项已平台化，并接线到工具栏打开编辑器/终端（见实现）。

---

## 3. Tauri 平台配置拆分

主文件只放**跨平台公共**项；装饰相关进平台文件（JSON Merge Patch 会**整段替换** `app.windows` 数组，故各平台文件需带完整窗口字段）：

| 文件 | 职责 |
|------|------|
| `src-tauri/tauri.conf.json` | 产品名、版本、build、bundle 公共、plugins、窗口尺寸基线 |
| `src-tauri/tauri.macos.conf.json` | Overlay、`trafficLightPosition`、`hiddenTitle` |
| `src-tauri/tauri.windows.conf.json` | `decorations: false` |
| `src-tauri/tauri.linux.conf.json` | `decorations: false` |

子窗：`createAppWindowChromeOptions()` — mac Overlay；Win/Linux `decorations: false`。  
UI：`useWindowChromeLayout` — mac `pl-[88px]`；Win/Linux 自绘三键。

`bundle.targets` 首期含 `app` / `dmg` / `nsis` / `appimage`（去掉未承诺的 `deb`）。

---

## 4. CI / 发布

`publish-desktop.yml` matrix 增加：

```yaml
- name: Linux x64
  platform: ubuntu-22.04
  args: "--bundles appimage"
```

Linux job 安装依赖（示例）：

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

`tauri-action` 已开 `uploadUpdaterJson`：合并写入 `latest.json` 的 `linux-x86_64`。

---

## 5. 系统能力与文案（最小集）

| 项 | 行为 |
|----|------|
| 磁盘空间 | Unix：`df -kP`；Windows：PowerShell / 卷 API（修复状态栏空白） |
| 打开目录 | 已有 Finder / explorer / xdg-open |
| 文案 | 「在 Finder 中显示」→ 按 OS：访达 / 资源管理器 / 文件管理器 |
| 原生菜单 | mac 完整应用菜单；Win/Linux 精简（无 Services/Hide 等 mac 项）或不安装多余项 |

---

## 6. 文档

- `docs/product/releases.md`：三端矩阵 + `linux-x86_64` 排障
- `docs/architecture/tauri.md`：平台 conf 拆分说明
- `docs/product/feature-list.md` / roadmap：三端状态
- `docs/development/ui-guidelines.md`：Linux 与 Win 同属自定义顶栏

---

## 7. 验收

- [ ] tag 构建产出三端资产与合并后的 `latest.json`（含三键）
- [ ] mac Overlay 回归
- [ ] Win / Linux 无双重标题栏、三键可用
- [ ] Win 状态栏磁盘空间可读
- [ ] Ubuntu LTS 冒烟：打开仓库、更新检查

---

## 8. 批准记录

- 承诺级别：官方三端  
- Linux：AppImage + x86_64 + Ubuntu LTS 参考  
- 路径：发版先行  
- 配置：分别维护 macos / windows / linux conf（用户明确要求）
