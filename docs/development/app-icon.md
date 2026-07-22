# App 图标（鲸灵 Git）

> **相关文档：** [ui-guidelines](ui-guidelines.md) · [theme](theme.md) · [releases](../product/releases.md) · [AGENTS.md](../../AGENTS.md)

本文约定桌面端 App 图标的**工程落点**、**品牌色**，以及用于 AI / 设计出图的**全量英文 Prompt**。出图后按本文接入仓库，勿继续使用 Tauri 脚手架默认双环图标。

---

## 工程路径

| 路径 | 用途 |
|------|------|
| `docs/assets/app-icon-1024.png` | 1024×1024 主源图（当前品牌稿） |
| `src-tauri/icons/` | 打包用多尺寸（由 CLI 生成） |
| `src/assets/app-icon.png` | 前端 UI 内用（建议 256×256，与母图同稿） |
| `src-tauri/tauri.conf.json` → `bundle.icon` | 声明打包引用的图标文件 |

由母图生成全套：

```bash
pnpm tauri icon ./path/to/app-icon-1024.png
```

会覆盖 `src-tauri/icons/` 下 PNG / `icon.icns` / `icon.ico` 等。前端再导出一份 **256×256** 覆盖 `src/assets/app-icon.png`（若 UI 使用该资源）。

---

## 品牌色（鲸灵）

| 角色 | 含义 | 参考色 |
|------|------|--------|
| 主背景 | 鲸 · 深海、沉稳 | `#0B1F3A` → `#123A5C` |
| 主体剪影 | 鲸形 | `#FFFFFF` / `#F3FBFF` |
| 强调「灵」 | 灵动、轻盈（弧线 / 节点） | `#7EC8FF` / `#A8D8FF` |

禁忌：琥珀金与白鲸冷暖硬撞；洋红–橙彩虹渐变；紫霓虹；货柜/集装箱吉祥物套路；照搬已知开发工具品牌标。

---

## 占比（桌面 App 标准）

- 背景：**100%** 铺满画布（零白边）
- 内容安全区：画布中心 **80% × 80%**（1024 上约每边留 102px）
- 白鲸约占安全区的 **70–80%**（全画布约 **56–64%** 宽/高）
- 圆角遮罩由系统裁切，**不要**画进母图

---

## 出图 Prompt（全量 · 英文）

设计或 AI 出图时**整段复制**使用；有参考图时一并附上，并遵守文末 “If a reference image is attached” 规则。

```text
Design a brand-new app icon for “Jingling Git” (JLGit), a modern Git desktop client.

CANVAS
- Exactly 1024×1024 px, square, PNG, RGBA
- Filename: app-icon-1024.png
- Background must be full-bleed to all four edges (100% of canvas)
- No white margin, no gray border, no floating card on blank canvas
- Do NOT bake in OS rounded-corner mask, dock mockup, or device frame
- No watermark; output only this one full-bleed square icon

PROPORTION (standard app-icon scale — enforce strictly)
- Centered safe area: 80% × 80% of canvas
  (on 1024px: ~102px margin each side; art inside ~820×820)
- Background still fills 1024×1024; only the graphic respects the safe area
- The FULL mark (whale + arc + nodes) must fill the safe area boldly
- Primary whale fills ~70–80% of the safe area (~56–64% of full canvas)
- No tiny floating logo with large empty padding
- No edge-touching art
- Compose as one visually centered unit; optical center balanced, not drifting to a corner

WHALE FORM (enhance recognizability)
- Abstract geometric whale silhouette, logo-like, NOT realistic
- Must read clearly as a whale at a glance AND at 32×32 — not a generic hook/curve
- Include a readable head/snout cue + thick body + clear two-lobed fluke (all three present)
- Keep it simplified and flat, but the silhouette should be unmistakable as a whale
- Tilted upward with lively motion; elegant, confident pose
- At most 1 thicker motion curve under the belly (optional), matching the body rhythm
- Flat solid white silhouette, clean vector edges
- No eye detail drawing, no throat grooves, no texture, no illustrative shading

COMPOSITION (keep the good layout, refine hierarchy)
- Right side: one orbital arc with exactly 3 circular nodes (subtle Git/network / “灵” hint)
- Arc sits in clear negative space beside/around the whale — do NOT cross through the whale body
- Strengthen the accent: arc stroke and nodes should be clearly visible at small sizes
  (not hairline; nodes slightly larger / more solid)
- Harmonious weights: whale = solid hero; arc/nodes = secondary but legible; motion curve not weaker than a scratch
- Soft-flat modern vector; no neon glow, no blur bloom, no soft luminous haze
- Generous but controlled negative space inside the safe area
- Must remain crisp at 32×32

COLOR THEME (brand: 鲸灵 = ocean depth + agile spirit)
- Primary background: deep ocean blue / indigo
  (approx #0B1F3A to #123A5C). Subtle single-direction gradient within this blue range, or near-solid
- Whale + motion curve: pure white or ice white (#FFFFFF / #F3FBFF)
- Accent “灵”: luminous ice blue / soft sky blue (approx #7EC8FF or #A8D8FF)
  — cool temperature; solid flat color on arc/nodes only
  — enough contrast against the deep blue to stay readable when small
- High contrast; calm, premium, developer-tool feel
- FORBIDDEN: warm gold/amber accents, magenta–coral clash, purple neon, rainbow gradients,
  loud teal-green “tropical” accents, multi-stop “AI” coloring, neon glow effects

DO NOT
- Tail-only / hook-only shapes that stop reading as a whale
- Realistic whale illustration
- Cargo / container mascot clichés
- Busy decoration, text, stickers, watermarks
- Copy or reskin any existing software logo

If a reference image is attached:
- Keep the successful overall layout language (white abstract whale + right-side ice-blue arc with 3 nodes on deep blue)
- Improve: whale head readability, optical centering, stronger arc/node presence, stricter safe-area fill
- Follow this proportion + deep-blue + white + ice-blue palette
```

---

## 验收清单

- [ ] 母图 1024×1024，背景铺满、无白边、无预烘焙圆角
- [ ] 小尺寸（约 32×32）仍能认出是鲸，不是弯钩
- [ ] 「灵」弧线 / 节点在深蓝底上可辨，无霓虹光晕
- [ ] 已执行 `pnpm tauri icon …`，`src-tauri/icons/` 与 `bundle.icon` 一致
- [ ] 若 UI 使用 `src/assets/app-icon.png`，已同步同稿

