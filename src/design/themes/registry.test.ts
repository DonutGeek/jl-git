import { describe, expect, it } from "vitest";

import {
  APP_THEME_COLOR_SUGGESTIONS,
  APP_THEME_OPTIONS,
  APP_THEME_PACKS,
  chromeFromPreset,
  isAppThemeChromeAtPreset,
  normalizeAppThemeChrome,
  normalizeAppThemeId,
} from "@/design/editor-themes";

describe("应用主题注册表", () => {
  it("保留既有五套主题，且全部进入设置选项", () => {
    const ids = APP_THEME_PACKS.map((pack) => pack.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "jingling-git",
      "github",
      "codex",
      "claude-code",
      "vscode",
    ]);
    expect(APP_THEME_OPTIONS.map((option) => option.id)).toEqual(ids);
  });

  it("所有主题都生成有效的浅色与深色语义配色", () => {
    const hex = /^#[0-9A-F]{6}$/;
    const colorKeys = [
      "accent",
      "background",
      "foreground",
      "surface",
      "muted",
      "mutedForeground",
      "border",
      "sidebar",
      "selection",
      "destructive",
      "diffAdded",
      "diffDeleted",
      "diffHunk",
      "gitAdded",
      "gitModified",
      "gitDeleted",
      "gitRenamed",
      "gitUntracked",
      "gitConflict",
    ] as const;

    for (const pack of APP_THEME_PACKS) {
      for (const dark of [false, true]) {
        const chrome = chromeFromPreset(pack.id, dark);
        for (const key of colorKeys) {
          expect(chrome[key]).toMatch(hex);
        }
      }
    }
  });

  it("主题包提供各自的卡片、侧栏与昼夜分层色", () => {
    expect(chromeFromPreset(normalizeAppThemeId("github"), false)).toMatchObject(
      {
        background: "#FFFFFF",
        surface: "#FFFFFF",
        muted: "#F6F8FA",
        sidebar: "#F6F8FA",
        border: "#D1D9E0",
      },
    );
    expect(chromeFromPreset(normalizeAppThemeId("github"), true)).toMatchObject(
      {
        background: "#0D1117",
        surface: "#151B23",
        sidebar: "#010409",
        border: "#3D444D",
      },
    );
    expect(chromeFromPreset(normalizeAppThemeId("vscode"), true)).toMatchObject(
      {
        background: "#1F1F1F",
        surface: "#202020",
        muted: "#2B2B2B",
        sidebar: "#181818",
      },
    );
    expect(
      chromeFromPreset(normalizeAppThemeId("claude-code"), false),
    ).toMatchObject({
      background: "#F9F9F7",
      surface: "#FFFFFF",
      sidebar: "#FCFCFB",
      accent: "#0B0B0B",
    });
    expect(
      chromeFromPreset(normalizeAppThemeId("claude-code"), true),
    ).toMatchObject({
      background: "#0D0D0D",
      surface: "#2C2C2A",
      sidebar: "#1A1A19",
      accent: "#FFFFFF",
    });
    expect(chromeFromPreset(normalizeAppThemeId("codex"), false)).toMatchObject({
      background: "#FCFCFC",
      surface: "#FFFFFF",
      sidebar: "#FCFCFC",
      accent: "#0D0D0D",
    });
    expect(chromeFromPreset(normalizeAppThemeId("codex"), true)).toMatchObject({
      background: "#000000",
      surface: "#212121",
      selection: "#303030",
      accent: "#FFFFFF",
    });
  });

  it("颜色建议去重且均来自有效 HEX 色值", () => {
    expect(new Set(APP_THEME_COLOR_SUGGESTIONS).size).toBe(
      APP_THEME_COLOR_SUGGESTIONS.length,
    );
    for (const color of APP_THEME_COLOR_SUGGESTIONS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("会补全旧持久化数据，并规范化新增语义色", () => {
    const themeId = normalizeAppThemeId("github");
    const preset = chromeFromPreset(themeId, true);
    const normalized = normalizeAppThemeChrome(
      {
        accent: "#abc",
        border: "not-a-color",
        selection: "#654321",
        diffAdded: "#123456",
      },
      themeId,
      true,
    );

    expect(normalized.accent).toBe("#AABBCC");
    expect(normalized.border).toBe(preset.border);
    expect(normalized.muted).toBe(preset.muted);
    expect(normalized.selection).toBe("#654321");
    expect(normalized.diffAdded).toBe("#123456");
    expect(normalized.gitConflict).toBe(preset.gitConflict);
  });

  it("任一语义色变化都会退出主题预设状态", () => {
    const themeId = normalizeAppThemeId("vscode");
    const preset = chromeFromPreset(themeId, true);

    expect(isAppThemeChromeAtPreset(themeId, preset, true)).toBe(true);
    expect(
      isAppThemeChromeAtPreset(
        themeId,
        { ...preset, sidebar: "#123456" },
        true,
      ),
    ).toBe(false);
  });
});
