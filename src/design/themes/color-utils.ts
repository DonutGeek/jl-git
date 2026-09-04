/** 颜色运算（分组色 / Monaco 回退） */

export interface HsvColor {
  /** 0–359 */
  hue: number;
  /** 0–100 */
  saturation: number;
  /** 0–100 */
  value: number;
}

/** 颜色输入框展示/编辑格式；落库仍统一为 #RRGGBB */
export type ColorInputFormat = "hex" | "rgb" | "rgba" | "hsl";

export const COLOR_INPUT_FORMATS: readonly ColorInputFormat[] = [
  "hex",
  "rgb",
  "rgba",
  "hsl",
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function channelToHex(component: number): string {
  return Math.round(clamp(component, 0, 255))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

function parseCssNumber(raw: string, max = 255): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(percent)) {
      return null;
    }
    return clamp((percent / 100) * max, 0, max);
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return clamp(value, 0, max);
}

function parseHueDegrees(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(deg|rad|turn|grad)?$/);
  if (!match) {
    return null;
  }
  const amount = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(amount)) {
    return null;
  }
  const unit = match[2] ?? "deg";
  let degrees = amount;
  if (unit === "rad") {
    degrees = (amount * 180) / Math.PI;
  } else if (unit === "turn") {
    degrees = amount * 360;
  } else if (unit === "grad") {
    degrees = (amount * 360) / 400;
  }
  return ((degrees % 360) + 360) % 360;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const matchLightness = l - chroma / 2;

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

  return [
    Math.round((red + matchLightness) * 255),
    Math.round((green + matchLightness) * 255),
    Math.round((blue + matchLightness) * 255),
  ];
}

function hexToRgbChannels(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex, "#000000").slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHslChannels(red: number, green: number, blue: number): [number, number, number] {
  const r = clamp(red, 0, 255) / 255;
  const g = clamp(green, 0, 255) / 255;
  const b = clamp(blue, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return [hue % 360, saturation * 100, lightness * 100];
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

/**
 * 解析常见 CSS 颜色写法为规范化 #RRGGBB。
 * 支持 HEX / RGB / RGBA / HSL / HSLA；带透明度时忽略 alpha，仅保留不透明色。
 */
export function parseCssColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const hexCandidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9A-Fa-f]{8}$/.test(hexCandidate)) {
    return `#${hexCandidate.slice(1, 7).toUpperCase()}`;
  }
  const asHex = normalizeHexColor(hexCandidate, "");
  if (asHex) {
    return asHex;
  }

  const functional = trimmed.match(/^(rgba?|hsla?)\(\s*([^)]+?)\s*\)$/i);
  if (!functional) {
    return null;
  }
  const kind = (functional[1] ?? "").toLowerCase();
  const body = (functional[2] ?? "").trim();
  const parts = body.includes(",")
    ? body.split(",").map((part) => part.trim())
    : body
        .split(/\s*\/\s*|\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

  if (kind === "rgb" || kind === "rgba") {
    if (parts.length < 3) {
      return null;
    }
    const red = parseCssNumber(parts[0] ?? "", 255);
    const green = parseCssNumber(parts[1] ?? "", 255);
    const blue = parseCssNumber(parts[2] ?? "", 255);
    if (red === null || green === null || blue === null) {
      return null;
    }
    return rgbToHex(red, green, blue);
  }

  if (kind === "hsl" || kind === "hsla") {
    if (parts.length < 3) {
      return null;
    }
    const hue = parseHueDegrees(parts[0] ?? "");
    const saturation = parseCssNumber(parts[1] ?? "", 100);
    const lightness = parseCssNumber(parts[2] ?? "", 100);
    if (hue === null || saturation === null || lightness === null) {
      return null;
    }
    const [red, green, blue] = hslToRgb(hue, saturation, lightness);
    return rgbToHex(red, green, blue);
  }

  return null;
}

/** 将 #RRGGBB 格式化为输入框当前格式文案 */
export function formatColor(hex: string, format: ColorInputFormat): string {
  const normalized = normalizeHexColor(hex, "#000000");
  const [red, green, blue] = hexToRgbChannels(normalized);
  if (format === "hex") {
    return normalized;
  }
  if (format === "rgb") {
    return `rgb(${red}, ${green}, ${blue})`;
  }
  if (format === "rgba") {
    return `rgba(${red}, ${green}, ${blue}, 1)`;
  }
  const [hue, saturation, lightness] = rgbToHslChannels(red, green, blue);
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
}

/** #RRGGBB → HSL（h: 0–360, s/l: 0–100） */
export function hexToHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const [red, green, blue] = hexToRgbChannels(normalizeHexColor(hex, "#000000"));
  const [hue, saturation, lightness] = rgbToHslChannels(red, green, blue);
  return { hue, saturation, lightness };
}

/** HSL → #RRGGBB */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const [red, green, blue] = hslToRgb(hue, saturation, lightness);
  return rgbToHex(red, green, blue);
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

export function hsvToHex(hue: number, saturation: number, value: number): string {
  const normalizedHue = (((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360;
  const normalizedSaturation = clamp(Number.isFinite(saturation) ? saturation : 0, 0, 100) / 100;
  const normalizedValue = clamp(Number.isFinite(value) ? value : 0, 0, 100) / 100;
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
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
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
