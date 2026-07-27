#!/usr/bin/env node
/**
 * 同步应用版本到 package.json / tauri.conf.json / Cargo.toml
 *
 * 用法：
 *   pnpm version:set 1.0.2
 *   pnpm version:set v1.0.2
 *   node ./scripts/set-version.mjs 1.0.2
 *
 * CI 打 tag 发布时也会调用本脚本，按 tag 名写入版本后再打包。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const raw = process.argv[2]?.trim();
if (!raw) {
  console.error("用法: pnpm version:set <version>（如 1.0.2 或 v1.0.2）");
  process.exit(1);
}

const version = raw.replace(/^v/i, "");
if (!/^\d+\.\d+\.\d+([.-][\w.-]+)?$/.test(version)) {
  console.error(`非法版本号: ${raw}（期望如 1.0.2 / 1.0.2-beta.1）`);
  process.exit(1);
}

function writeJsonVersion(relPath) {
  const filePath = path.join(root, relPath);
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  json.version = version;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`✓ ${relPath} → ${version}`);
}

function writeCargoVersion(relPath) {
  const filePath = path.join(root, relPath);
  const original = readFileSync(filePath, "utf8");
  // 只改 [package] 段首个 version，不动依赖版本
  let replaced = false;
  const next = original.replace(/^version\s*=\s*"[^"]+"/m, () => {
    replaced = true;
    return `version = "${version}"`;
  });
  if (!replaced) {
    throw new Error(`${relPath} 中未找到 version = "..."`);
  }
  writeFileSync(filePath, next, "utf8");
  console.log(`✓ ${relPath} → ${version}`);
}

writeJsonVersion("package.json");
writeJsonVersion("src-tauri/tauri.conf.json");
writeCargoVersion("src-tauri/Cargo.toml");

console.log(`版本已同步为 ${version}`);
