import { describe, expect, it } from "vitest";

import { getNativeAppThemeTokenOverrides } from "@/design/themes/apply-document";
import { chromeFromPreset } from "@/design/themes/registry";
import { APP_THEME_JINGLING_GIT } from "@/design/themes/types";

describe("鲸灵 Git 原生 Token 覆写", () => {
  it("默认色板不注入任何近似 HEX", () => {
    const chrome = chromeFromPreset(APP_THEME_JINGLING_GIT, true);

    expect(getNativeAppThemeTokenOverrides(APP_THEME_JINGLING_GIT, chrome, true)).toEqual({});
  });

  it("只覆写用户实际修改的颜色，不改变原生背景与卡片", () => {
    const chrome = {
      ...chromeFromPreset(APP_THEME_JINGLING_GIT, true),
      mutedForeground: "#C9C9C9",
      border: "#505050",
      sidebar: "#363636",
    };

    const overrides = getNativeAppThemeTokenOverrides(APP_THEME_JINGLING_GIT, chrome, true);

    expect(overrides).toMatchObject({
      "--muted-foreground": "#C9C9C9",
      "--border": "#505050",
      "--input": "#505050",
      "--sidebar-border": "#505050",
      "--sidebar": "#363636",
    });
    expect(overrides).not.toHaveProperty("--background");
    expect(overrides).not.toHaveProperty("--card");
    expect(overrides).not.toHaveProperty("--popover");
  });

  it("Git 状态色只联动对应状态、图表与仓库分组", () => {
    const chrome = {
      ...chromeFromPreset(APP_THEME_JINGLING_GIT, false),
      gitModified: "#123456",
    };

    expect(getNativeAppThemeTokenOverrides(APP_THEME_JINGLING_GIT, chrome, false)).toEqual({
      "--git-modified": "#123456",
      "--chart-3": "#123456",
      "--workspace-blue": "#123456",
    });
  });
});
