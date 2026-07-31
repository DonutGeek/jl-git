import { generateManifest, type Manifest } from "material-icon-theme";

/** Material Icon Theme 清单（与 VS Code 扩展同源） */
let cachedManifest: Manifest | null = null;

function getManifest(): Manifest {
  if (!cachedManifest) {
    cachedManifest = generateManifest();
  }
  return cachedManifest;
}

/**
 * 解析文件/目录对应的 Material Icon id（不含 .svg）。
 * 规则与主题一致：fileNames → 最长扩展名 → 默认 file/folder。
 */
export function resolveMaterialIconId(name: string, isDir: boolean): string {
  const manifest = getManifest();
  const lower = name.toLowerCase();

  if (isDir) {
    return manifest.folderNames?.[lower] ?? manifest.folder ?? "folder";
  }

  const byName = manifest.fileNames?.[lower];
  if (byName) {
    return byName;
  }

  // 复合扩展名优先（如 d.ts、test.tsx）
  const parts = lower.split(".");
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 1) {
      const ext = parts.slice(i).join(".");
      const byExt = manifest.fileExtensions?.[ext];
      if (byExt) {
        return byExt;
      }
    }
  }

  return manifest.file ?? "file";
}

/** Vite 将 SVG 打成 URL；eager 建表便于按 id 查找 */
const iconUrlByPath = import.meta.glob("../../node_modules/material-icon-theme/icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const iconUrlById = new Map<string, string>();

for (const [path, url] of Object.entries(iconUrlByPath)) {
  const file = path.split("/").pop();
  if (!file?.endsWith(".svg") || typeof url !== "string") {
    continue;
  }
  iconUrlById.set(file.slice(0, -4), url);
}

/** 取图标资源 URL；缺失时回退到默认 file/folder */
export function getMaterialIconUrl(iconId: string, isDir: boolean): string {
  const direct = iconUrlById.get(iconId);
  if (direct) {
    return direct;
  }

  // 主题部分图标以 `*.clone.svg` 落盘（如 angular-service），清单 id 不含 .clone
  const clone = iconUrlById.get(`${iconId}.clone`);
  if (clone) {
    return clone;
  }

  const fallbackId = isDir ? "folder" : "file";
  const fallback = iconUrlById.get(fallbackId);
  if (!fallback) {
    throw new Error(`Material Icon 资源缺失: ${iconId}`);
  }
  return fallback;
}

export function resolveMaterialIconUrl(name: string, isDir: boolean): string {
  const id = resolveMaterialIconId(name, isDir);
  return getMaterialIconUrl(id, isDir);
}
