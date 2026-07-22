/** 主题色运算（与主题包数据解耦） */

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
