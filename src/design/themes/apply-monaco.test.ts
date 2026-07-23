import { describe, expect, it } from "vitest";

import { getAppMonacoSyntaxRules } from "@/design/themes/apply-monaco";
import {
  APP_THEME_CHATGPT,
  APP_THEME_CLAUDE_CODE,
  APP_THEME_CODEX,
  APP_THEME_GITHUB,
  APP_THEME_JINGLING_GIT,
  APP_THEME_VSCODE,
} from "@/design/themes/types";

function foregroundFor(
  rules: ReturnType<typeof getAppMonacoSyntaxRules>,
  token: string,
): string | undefined {
  return rules.find((rule) => rule.token === token)?.foreground;
}

describe("应用主题 Monaco 语法色", () => {
  it("鲸灵 Git 继续使用原生 Monaco 规则", () => {
    expect(getAppMonacoSyntaxRules(APP_THEME_JINGLING_GIT, false)).toEqual([]);
    expect(getAppMonacoSyntaxRules(APP_THEME_JINGLING_GIT, true)).toEqual([]);
  });

  it("VS Code 对齐 Light+ / Dark+ 核心语法色", () => {
    const light = getAppMonacoSyntaxRules(APP_THEME_VSCODE, false);
    const dark = getAppMonacoSyntaxRules(APP_THEME_VSCODE, true);

    expect(foregroundFor(light, "comment")).toBe("008000");
    expect(foregroundFor(light, "keyword.control")).toBe("AF00DB");
    expect(foregroundFor(light, "string")).toBe("A31515");
    expect(foregroundFor(dark, "comment")).toBe("6A9955");
    expect(foregroundFor(dark, "keyword.control")).toBe("C586C0");
    expect(foregroundFor(dark, "function")).toBe("DCDCAA");
  });

  it.each([
    APP_THEME_GITHUB,
    APP_THEME_CHATGPT,
    APP_THEME_CODEX,
    APP_THEME_CLAUDE_CODE,
    APP_THEME_VSCODE,
  ])("%s 浅深模式都有完整且不同的语法色", (themeId) => {
    const light = getAppMonacoSyntaxRules(themeId, false);
    const dark = getAppMonacoSyntaxRules(themeId, true);

    expect(light.length).toBeGreaterThanOrEqual(20);
    expect(dark.length).toBe(light.length);
    expect(light.every((rule) => /^[0-9A-F]{6}$/.test(rule.foreground))).toBe(
      true,
    );
    expect(dark.every((rule) => /^[0-9A-F]{6}$/.test(rule.foreground))).toBe(
      true,
    );
    expect(foregroundFor(light, "keyword")).not.toBe(
      foregroundFor(dark, "keyword"),
    );
  });
});
