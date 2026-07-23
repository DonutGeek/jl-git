import { chatgptPack } from "@/design/themes/packs/chatgpt";
import { claudeCodePack } from "@/design/themes/packs/claude-code";
import { codexPack } from "@/design/themes/packs/codex";
import { githubPack } from "@/design/themes/packs/github";
import { jinglingGitPack } from "@/design/themes/packs/jingling-git";
import { vscodePack } from "@/design/themes/packs/vscode";
import type { AppThemePack } from "@/design/themes/types";

/**
 * 主题包注册表（唯一清单）。
 * 新增主题：新建 packs/<name>.ts，再追加到本数组即可。
 */
export const APP_THEME_PACKS: readonly AppThemePack[] = [
  jinglingGitPack,
  githubPack,
  chatgptPack,
  claudeCodePack,
  codexPack,
  vscodePack,
] as const;
