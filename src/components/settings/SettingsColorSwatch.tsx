import { cn } from "@/lib/utils";

/** 主题色选择：色块 + hex；原生 color input 铺满按钮，保证弹出锚点正确 */
export function SettingsColorSwatch({
  value,
  onChange,
  ariaLabel,
  solid = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
  /** 强调色用实心块；背景/前景用描边圆点样式 */
  solid?: boolean;
}) {
  const hex = value.toUpperCase();
  const safeHex = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#000000";

  return (
    <label
      className={cn(
        "border-border bg-background hover:bg-muted/40 relative inline-flex h-8 max-w-[11rem] cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-2 text-left shadow-none transition-colors",
      )}
    >
      <span
        className={cn(
          "pointer-events-none size-4 shrink-0 rounded-full border border-black/10 dark:border-white/15",
          solid && "rounded-sm",
        )}
        style={{ backgroundColor: hex }}
        aria-hidden
      />
      <span className="text-muted-foreground pointer-events-none truncate font-mono text-[11px] tabular-nums">
        {hex}
      </span>
      {/* 铺满控件：系统色板相对此元素定位，避免 sr-only 导致弹到窗口角落 */}
      <input
        type="color"
        value={safeHex}
        aria-label={ariaLabel}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
        }}
      />
    </label>
  );
}
