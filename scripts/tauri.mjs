#!/usr/bin/env node
/**
 * 包装 tauri CLI：`dev` 使用独立 identifier，避免与正式包共用 Application Support。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args[0] === "dev") {
  args.splice(
    1,
    0,
    "--config",
    path.join("src-tauri", "tauri.conf.dev.json"),
  );
}

const child = spawn("pnpm", ["exec", "tauri", ...args], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
