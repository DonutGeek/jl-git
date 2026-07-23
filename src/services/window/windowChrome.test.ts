import { describe, expect, it } from "vitest";

import { resolveWindowHeaderPaddingClass } from "@/services/window/windowChrome";

describe("resolveWindowHeaderPaddingClass", () => {
  it("macOS 普通窗口为交通灯保留空间", () => {
    expect(resolveWindowHeaderPaddingClass("macos", false)).toBe(
      "pl-[88px]",
    );
  });

  it("macOS 全屏窗口取消交通灯留位", () => {
    expect(resolveWindowHeaderPaddingClass("macos", true)).toBe("pl-3");
  });

  it("其它平台不受全屏状态影响", () => {
    expect(resolveWindowHeaderPaddingClass("windows", false)).toBe("pl-3");
    expect(resolveWindowHeaderPaddingClass("linux", true)).toBe("pl-3");
  });
});
