import { describe, expect, it } from "vitest";

import { hexToHsv, hsvToHex } from "@/design/themes/color-utils";

describe("主题色转换", () => {
  it.each([
    ["#FF0000", { hue: 0, saturation: 100, value: 100 }],
    ["#00FF00", { hue: 120, saturation: 100, value: 100 }],
    ["#0000FF", { hue: 240, saturation: 100, value: 100 }],
    ["#FFFFFF", { hue: 0, saturation: 0, value: 100 }],
    ["#000000", { hue: 0, saturation: 0, value: 0 }],
  ])("把 %s 转为 HSV", (hex, expected) => {
    expect(hexToHsv(hex)).toEqual(expected);
  });

  it.each(["#D97757", "#1A3D2A", "#4493F8", "#A3A3A3"])("常用主题色 %s 往返转换保持一致", (hex) => {
    const hsv = hexToHsv(hex);
    expect(hsvToHex(hsv.hue, hsv.saturation, hsv.value)).toBe(hex);
  });

  it("会规范化色相并约束饱和度与明度", () => {
    expect(hsvToHex(360, 100, 100)).toBe("#FF0000");
    expect(hsvToHex(-120, 100, 100)).toBe("#0000FF");
    expect(hsvToHex(0, 120, -10)).toBe("#000000");
  });
});
