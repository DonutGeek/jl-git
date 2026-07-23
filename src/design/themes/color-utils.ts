/** 主题色运算（与主题包数据解耦） */

export interface HsvColor {
  /** 0–359 */
  hue: number;
  /** 0–100 */
  saturation: number;
  /** 0–100 */
  value: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function hexToHsv(hex: string): HsvColor {
  const normalized = normalizeHexColor(hex, "#000000").slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }

  return {
    hue: hue % 360,
    saturation: max === 0 ? 0 : (delta / max) * 100,
    value: max * 100,
  };
}

export function hsvToHex(
  hue: number,
  saturation: number,
  value: number,
): string {
  const normalizedHue = ((Number.isFinite(hue) ? hue : 0) % 360 + 360) % 360;
  const normalizedSaturation =
    clamp(Number.isFinite(saturation) ? saturation : 0, 0, 100) / 100;
  const normalizedValue =
    clamp(Number.isFinite(value) ? value : 0, 0, 100) / 100;
  const chroma = normalizedValue * normalizedSaturation;
  const segment = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = normalizedValue - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (segment < 1) {
    [red, green] = [chroma, secondary];
  } else if (segment < 2) {
    [red, green] = [secondary, chroma];
  } else if (segment < 3) {
    [green, blue] = [chroma, secondary];
  } else if (segment < 4) {
    [green, blue] = [secondary, chroma];
  } else if (segment < 5) {
    [red, blue] = [secondary, chroma];
  } else {
    [red, blue] = [chroma, secondary];
  }

  const channel = (component: number): string =>
    Math.round((component + offset) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export function normalizeContrast(value: unknown, fallback = 60): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function withAlpha(hex: string, alpha: number): string {
  const base = hex.replace("#", "").slice(0, 6);
  if (base.length !== 6) {
    return hex;
  }
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${base}${a}`;
}

export function mixToward(from: string, toward: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const parse = (hex: string): [number, number, number] => {
    const raw = hex.replace("#", "");
    return [
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(toward);
  const toHex = (n: number) =>
    Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(b1 + (b2 - b1) * t)}`;
}

function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(Number.parseInt(raw.slice(0, 2), 16));
  const g = channel(Number.parseInt(raw.slice(2, 4), 16));
  const b = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastingForeground(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? "#171717" : "#FAFAFA";
}

export function isDocumentDark(): boolean {
  return document.documentElement.classList.contains("dark");
}
