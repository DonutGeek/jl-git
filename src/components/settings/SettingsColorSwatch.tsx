import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SelectMenu } from "@/components/common/SelectMenu";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  APP_THEME_COLOR_SUGGESTIONS,
  COLOR_INPUT_FORMATS,
  contrastingForeground,
  formatColor,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  parseCssColor,
  type ColorInputFormat,
} from "@/design/editor-themes";
import { cn } from "@/lib/utils";

/** 应用内主题色板：避免原生 color input 的系统浮层无法参与碰撞定位。 */
export function SettingsColorSwatch({
  value,
  onChange,
  ariaLabel,
  presetValue,
  solid = false,
  showPresets = true,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
  presetValue: string;
  /** 强调色用实心块；背景/前景用描边圆点样式 */
  solid?: boolean;
  /** 是否展示默认色、建议色与重置操作 */
  showPresets?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const fallbackHex = APP_THEME_COLOR_SUGGESTIONS[0] ?? presetValue;
  const presetHex = normalizeHexColor(presetValue, fallbackHex);
  const hex = normalizeHexColor(value, presetHex);
  const inputId = useId();
  const formatId = useId();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ColorInputFormat>("hex");
  const [draft, setDraft] = useState(() => formatColor(hex, "hex"));
  const [hue, setHue] = useState(() => hexToHsv(hex).hue);
  const [saturation, setSaturation] = useState(() => hexToHsv(hex).saturation);
  const [brightness, setBrightness] = useState(() => hexToHsv(hex).value);

  useEffect(() => {
    const hsv = hexToHsv(hex);
    setDraft(formatColor(hex, format));
    setHue(hsv.hue);
    setSaturation(hsv.saturation);
    setBrightness(hsv.value);
  }, [format, hex]);

  const applyHex = (next: string): void => {
    setDraft(formatColor(next, format));
    if (next !== hex) {
      onChange(next);
    }
  };

  const applyHsv = (nextHue: number, nextSaturation: number, nextBrightness: number): void => {
    setHue(nextHue);
    setSaturation(nextSaturation);
    setBrightness(nextBrightness);
    applyHex(hsvToHex(nextHue, nextSaturation, nextBrightness));
  };

  const applyDraft = (nextDraft: string): boolean => {
    const next = parseCssColor(nextDraft);
    if (!next) {
      return false;
    }
    applyHex(next);
    return true;
  };

  const updateColorField = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSaturation = Math.round(
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * 100,
    );
    const nextBrightness = Math.round(
      (1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))) * 100,
    );
    applyHsv(hue, nextSaturation, nextBrightness);
  };

  const handleColorFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 5 : 1;
    let nextSaturation = saturation;
    let nextBrightness = brightness;
    if (event.key === "ArrowLeft") {
      nextSaturation = Math.max(0, saturation - step);
    } else if (event.key === "ArrowRight") {
      nextSaturation = Math.min(100, saturation + step);
    } else if (event.key === "ArrowDown") {
      nextBrightness = Math.max(0, brightness - step);
    } else if (event.key === "ArrowUp") {
      nextBrightness = Math.min(100, brightness + step);
    } else {
      return;
    }
    event.preventDefault();
    applyHsv(hue, nextSaturation, nextBrightness);
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") {
      return;
    }
    if (applyDraft(draft)) {
      setOpen(false);
    }
  };

  const draftValid = Boolean(parseCssColor(draft));
  const formatOptions = COLOR_INPUT_FORMATS.map((item) => ({
    value: item,
    label: t(`settings.themeColorFormat${item.toUpperCase()}`),
  }));

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setDraft(formatColor(hex, format));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "border-input bg-background hover:bg-accent h-8 w-full max-w-none justify-start gap-2 px-2.5 font-normal shadow-none",
            className,
          )}
        >
          <span
            className={cn(
              "border-border size-4 shrink-0 rounded-full border",
              solid && "rounded-sm",
            )}
            style={{ backgroundColor: hex }}
            aria-hidden
          />
          <span className="text-foreground truncate font-mono text-xs tabular-nums">{hex}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-72 p-4"
      >
        <PopoverHeader>
          <PopoverTitle className="text-sm">
            {t("settings.themeColorPickerTitle", { name: ariaLabel })}
          </PopoverTitle>
        </PopoverHeader>

        <div
          role="slider"
          tabIndex={0}
          aria-label={t("settings.themeColorField")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(brightness)}
          aria-valuetext={t("settings.themeColorCoordinates", {
            saturation: Math.round(saturation),
            brightness: Math.round(brightness),
          })}
          className="border-input focus-visible:ring-ring relative mt-3 h-36 touch-none cursor-crosshair overflow-hidden rounded-md border outline-none focus-visible:ring-2"
          style={{
            backgroundColor: `hsl(${hue} 100% 50%)`,
            backgroundImage:
              "linear-gradient(to top, var(--color-picker-black), transparent), linear-gradient(to right, var(--color-picker-white), transparent)",
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateColorField(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateColorField(event);
            }
          }}
          onPointerUp={(event) => {
            updateColorField(event);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onKeyDown={handleColorFieldKeyDown}
        >
          <span
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-picker-white)] shadow-[0_0_0_1px_var(--color-picker-outline)]"
            style={{
              left: `${saturation}%`,
              top: `${100 - brightness}%`,
            }}
            aria-hidden
          />
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">{t("settings.themeHue")}</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {Math.round(hue)}°
            </span>
          </div>
          <Slider
            value={[hue]}
            min={0}
            max={359}
            step={1}
            aria-label={t("settings.themeHue")}
            className="[&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:border-[var(--color-picker-white)] [&_[data-slot=slider-thumb]]:bg-transparent [&_[data-slot=slider-thumb]]:shadow-[0_0_0_1px_var(--color-picker-outline)] [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-[image:var(--color-picker-spectrum)]"
            onValueChange={(nextValue) => {
              const nextHue = nextValue[0];
              if (typeof nextHue === "number") {
                applyHsv(nextHue, saturation, brightness);
              }
            }}
          />
        </div>

        {showPresets ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="border-border bg-muted/40 rounded-md border p-2">
                <div className="text-muted-foreground text-[10px]">
                  {t("settings.themeCurrentColor")}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="border-border size-4 rounded-sm border"
                    style={{ backgroundColor: hex }}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] tabular-nums">{hex}</span>
                </div>
              </div>
              <div className="border-border bg-muted/40 rounded-md border p-2">
                <div className="text-muted-foreground text-[10px]">
                  {t("settings.themeDefaultColor")}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="border-border size-4 rounded-sm border"
                    style={{ backgroundColor: presetHex }}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] tabular-nums">{presetHex}</span>
                </div>
              </div>
            </div>

            <div className="text-muted-foreground mt-3 text-xs">
              {t("settings.themeSuggestedColors")}
            </div>
            <div className="mt-1.5 grid grid-cols-8 gap-1">
              {APP_THEME_COLOR_SUGGESTIONS.map((color) => {
                const selected = color === hex;
                return (
                  <Button
                    key={color}
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    title={color}
                    aria-label={`${ariaLabel} ${color}`}
                    aria-pressed={selected}
                    className="border-border relative cursor-pointer rounded-sm p-0 shadow-none"
                    style={{
                      backgroundColor: color,
                      color: contrastingForeground(color),
                    }}
                    onClick={() => {
                      applyHex(color);
                    }}
                  >
                    {selected ? <Check className="absolute inset-1 size-4" aria-hidden /> : null}
                  </Button>
                );
              })}
            </div>
          </>
        ) : null}

        <Field className="mt-3 gap-1.5" data-invalid={!draftValid || undefined}>
          <FieldLabel htmlFor={inputId} className="text-muted-foreground text-xs">
            {t("settings.themeColorValue")}
          </FieldLabel>
          <div className="flex items-center gap-2">
            <SelectMenu
              value={format}
              ariaLabel={t("settings.themeColorFormat")}
              options={formatOptions}
              triggerClassName="h-8 w-[5.5rem] shrink-0"
              size="sm"
              onChange={(next) => {
                if (COLOR_INPUT_FORMATS.includes(next as ColorInputFormat)) {
                  setFormat(next as ColorInputFormat);
                }
              }}
            />
            <Input
              id={inputId}
              value={draft}
              spellCheck={false}
              aria-invalid={draftValid ? undefined : true}
              aria-describedby={formatId}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
              onChange={(event) => {
                const nextDraft = event.target.value;
                setDraft(nextDraft);
                const next = parseCssColor(nextDraft);
                if (next && next !== hex) {
                  onChange(next);
                }
              }}
              onBlur={() => {
                if (!applyDraft(draft)) {
                  setDraft(formatColor(hex, format));
                }
              }}
              onKeyDown={handleDraftKeyDown}
            />
          </div>
          <span id={formatId} className="sr-only">
            {t("settings.themeColorFormatHint")}
          </span>
        </Field>

        {showPresets ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={hex === presetHex}
            className="mt-2 h-8 cursor-pointer px-2 disabled:cursor-default"
            onClick={() => {
              applyHex(presetHex);
            }}
          >
            <RotateCcw aria-hidden />
            {t("settings.themeResetColor")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
