import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  GitBranch,
  KeyRound,
  Languages,
  Monitor,
  Palette,
  Power,
  Sparkles,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { clearAgentKey, hasAgentKey, setAgentKey } from "@/services/ai";
import { gitService } from "@/services/git";
import { listSystemFonts } from "@/services/system/system.info";
import type { ThemeMode } from "@/services/theme/theme.service";
import {
  CLIENT_FONT_SYSTEM,
  EDITOR_FONT_SYSTEM,
  useAppPrefsStore,
} from "@/store/useAppPrefsStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";
import { useThemeStore } from "@/store/useThemeStore";
import { toUserMessage } from "@/types/error";
import type { AppLocale } from "@/i18n/locale";

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}

function SettingsSection({ icon, title, description, children }: SettingsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 pl-6">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-muted-foreground mb-1 block text-[11px]">{children}</label>;
}

/** 设置表单控件：与顶栏分支选择器同系（轻边框、无阴影） */
const settingsFieldClassName =
  "border-border h-8 px-2.5 shadow-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40";

function SegmentedControl<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="bg-muted/60 flex flex-wrap gap-1 rounded-lg p-1"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              "hover:bg-background/80 min-w-0 flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 右侧设置抽屉：按域分组，保留当前工作区 */
export function SettingsDrawer() {
  const { t } = useTranslation();
  const open = useSettingsDrawerStore((state) => state.open);
  const setOpen = useSettingsDrawerStore((state) => state.setOpen);

  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const clientFont = useAppPrefsStore((state) => state.clientFont);
  const editorFont = useAppPrefsStore((state) => state.editorFont);
  const externalEditor = useAppPrefsStore((state) => state.externalEditor);
  const externalEditorPath = useAppPrefsStore((state) => state.externalEditorPath);
  const shell = useAppPrefsStore((state) => state.shell);
  const shellPath = useAppPrefsStore((state) => state.shellPath);
  const launchAtLogin = useAppPrefsStore((state) => state.launchAtLogin);
  const setClientFont = useAppPrefsStore((state) => state.setClientFont);
  const setEditorFont = useAppPrefsStore((state) => state.setEditorFont);
  const setExternalEditor = useAppPrefsStore((state) => state.setExternalEditor);
  const setExternalEditorPath = useAppPrefsStore((state) => state.setExternalEditorPath);
  const setShell = useAppPrefsStore((state) => state.setShell);
  const setShellPath = useAppPrefsStore((state) => state.setShellPath);
  const setLaunchAtLogin = useAppPrefsStore((state) => state.setLaunchAtLogin);

  const [gitName, setGitName] = useState("");
  const [gitEmail, setGitEmail] = useState("");
  const [identityLoading, setIdentityLoading] = useState(false);

  const [agentKeyInput, setAgentKeyInput] = useState("");
  const [agentKeyConfigured, setAgentKeyConfigured] = useState(false);
  const [agentKeyLoading, setAgentKeyLoading] = useState(false);
  const [agentKeySaving, setAgentKeySaving] = useState(false);

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);

  const savedIdentityRef = useRef({ name: "", email: "" });
  const identityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIdentityLoading(true);
    setAgentKeyLoading(true);
    setFontsLoading(true);
    setAgentKeyInput("");

    void gitService
      .getGlobalIdentity()
      .then((identity) => {
        if (!cancelled) {
          const name = identity.name ?? "";
          const email = identity.email ?? "";
          setGitName(name);
          setGitEmail(email);
          savedIdentityRef.current = { name, email };
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGitName("");
          setGitEmail("");
          savedIdentityRef.current = { name: "", email: "" };
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIdentityLoading(false);
        }
      });

    void hasAgentKey()
      .then((configured) => {
        if (!cancelled) {
          setAgentKeyConfigured(configured);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentKeyConfigured(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAgentKeyLoading(false);
        }
      });

    void listSystemFonts()
      .then((fonts) => {
        if (!cancelled) {
          setSystemFonts(fonts);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSystemFonts([]);
          toast.error(toUserMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFontsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (identityTimerRef.current) {
        clearTimeout(identityTimerRef.current);
        identityTimerRef.current = null;
      }
    };
  }, [open]);

  async function persistIdentity(name: string, email: string): Promise<void> {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) {
      return;
    }
    if (
      trimmedName === savedIdentityRef.current.name &&
      trimmedEmail === savedIdentityRef.current.email
    ) {
      return;
    }

    try {
      const identity = await gitService.setGlobalIdentity({
        name: trimmedName,
        email: trimmedEmail,
      });
      const nextName = identity.name ?? trimmedName;
      const nextEmail = identity.email ?? trimmedEmail;
      savedIdentityRef.current = { name: nextName, email: nextEmail };
      setGitName(nextName);
      setGitEmail(nextEmail);
      toast.success(t("settings.gitIdentitySaved"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  const persistIdentityRef = useRef(persistIdentity);
  persistIdentityRef.current = persistIdentity;

  /** 输入停顿后自动写入全局 Git 身份 */
  useEffect(() => {
    if (!open || identityLoading) {
      return;
    }

    const name = gitName.trim();
    const email = gitEmail.trim();
    if (!name || !email) {
      return;
    }
    if (
      name === savedIdentityRef.current.name &&
      email === savedIdentityRef.current.email
    ) {
      return;
    }

    if (identityTimerRef.current) {
      clearTimeout(identityTimerRef.current);
    }
    identityTimerRef.current = setTimeout(() => {
      void persistIdentityRef.current(gitName, gitEmail);
    }, 600);

    return () => {
      if (identityTimerRef.current) {
        clearTimeout(identityTimerRef.current);
        identityTimerRef.current = null;
      }
    };
  }, [gitName, gitEmail, open, identityLoading]);

  async function handleSaveAgentKey(): Promise<void> {
    const value = agentKeyInput.trim();
    if (!value) {
      return;
    }

    setAgentKeySaving(true);
    try {
      await setAgentKey(value);
      const configured = await hasAgentKey();
      setAgentKeyConfigured(configured);
      setAgentKeyInput("");
      toast.success(t("settings.agentKeySaved"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setAgentKeySaving(false);
    }
  }

  async function handleClearAgentKey(): Promise<void> {
    setAgentKeySaving(true);
    try {
      await clearAgentKey();
      setAgentKeyConfigured(false);
      setAgentKeyInput("");
      toast.success(t("settings.agentKeyCleared"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setAgentKeySaving(false);
    }
  }

  function handleSshSoon(action: string): void {
    toast.message(t("settings.sshComingSoon", { action }));
  }

  function handleLaunchToggle(next: boolean): void {
    setLaunchAtLogin(next);
    toast.message(
      next ? t("settings.launchAtLoginOnHint") : t("settings.launchAtLoginOffHint"),
    );
  }

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "system", label: t("settings.themeSystem") },
  ];

  const localeOptions: { value: AppLocale; label: string }[] = [
    { value: "zh-CN", label: t("settings.localeZh") },
    { value: "en", label: t("settings.localeEn") },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md"
        showOverlay
      >
        <SheetHeader className="border-border space-y-0 border-b px-4 py-3 pr-10 text-left">
          <SheetTitle className="text-sm font-semibold">{t("settings.title")}</SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            {t("settings.subtitle")}
          </SheetDescription>
          <SheetCloseButton className="top-3 right-3" />
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-4 py-5">
          {/* 1. 外观 */}
          <SettingsSection
            icon={<Palette />}
            title={t("settings.sectionAppearance")}
            description={t("settings.sectionAppearanceHint")}
          >
            <div>
              <FieldLabel>{t("settings.theme")}</FieldLabel>
              <SegmentedControl
                value={mode}
                options={themeOptions}
                ariaLabel={t("settings.theme")}
                onChange={setMode}
              />
            </div>
            <div>
              <FieldLabel>{t("settings.language")}</FieldLabel>
              <SegmentedControl
                value={locale}
                options={localeOptions}
                ariaLabel={t("settings.language")}
                onChange={setLocale}
              />
            </div>
            <div>
              <FieldLabel>{t("settings.clientFont")}</FieldLabel>
              <SelectMenu
                value={clientFont}
                disabled={fontsLoading}
                ariaLabel={t("settings.clientFont")}
                onChange={setClientFont}
                options={[
                  { value: CLIENT_FONT_SYSTEM, label: t("settings.fontSystem") },
                  ...(clientFont !== CLIENT_FONT_SYSTEM &&
                  !systemFonts.includes(clientFont)
                    ? [
                        {
                          value: clientFont,
                          label: clientFont,
                          style: {
                            fontFamily: `"${clientFont}", ui-sans-serif, system-ui, sans-serif`,
                          },
                        },
                      ]
                    : []),
                  ...systemFonts.map((family) => ({
                    value: family,
                    label: family,
                    style: {
                      fontFamily: `"${family}", ui-sans-serif, system-ui, sans-serif`,
                    },
                  })),
                ]}
              />
              {fontsLoading ? (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  {t("settings.fontsLoading")}
                </p>
              ) : null}
            </div>
            <div>
              <FieldLabel>{t("settings.editorFont")}</FieldLabel>
              <SelectMenu
                value={editorFont}
                disabled={fontsLoading}
                ariaLabel={t("settings.editorFont")}
                onChange={setEditorFont}
                options={[
                  {
                    value: EDITOR_FONT_SYSTEM,
                    label: t("settings.fontSystemMono"),
                  },
                  ...(editorFont !== EDITOR_FONT_SYSTEM &&
                  !systemFonts.includes(editorFont)
                    ? [
                        {
                          value: editorFont,
                          label: editorFont,
                          style: {
                            fontFamily: `"${editorFont}", ui-monospace, monospace`,
                          },
                        },
                      ]
                    : []),
                  ...systemFonts.map((family) => ({
                    value: family,
                    label: family,
                    style: {
                      fontFamily: `"${family}", ui-monospace, monospace`,
                    },
                  })),
                ]}
              />
            </div>
          </SettingsSection>

          {/* 2. Git */}
          <SettingsSection
            icon={<GitBranch />}
            title={t("settings.sectionGit")}
            description={t("settings.sectionGitHint")}
          >
            <div>
              <FieldLabel>{t("settings.gitUserName")}</FieldLabel>
              <Input
                className={settingsFieldClassName}
                value={gitName}
                onChange={(event) => setGitName(event.target.value)}
                onBlur={() => void persistIdentity(gitName, gitEmail)}
                placeholder={t("settings.gitUserNamePlaceholder")}
                disabled={identityLoading}
                autoComplete="username"
              />
            </div>
            <div>
              <FieldLabel>{t("settings.gitEmail")}</FieldLabel>
              <Input
                className={settingsFieldClassName}
                type="email"
                value={gitEmail}
                onChange={(event) => setGitEmail(event.target.value)}
                onBlur={() => void persistIdentity(gitName, gitEmail)}
                placeholder={t("settings.gitEmailPlaceholder")}
                disabled={identityLoading}
                autoComplete="email"
              />
              <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                {t("settings.gitIdentityAutoSaveHint")}
              </p>
            </div>
          </SettingsSection>

          {/* 3. SSH */}
          <SettingsSection
            icon={<KeyRound />}
            title={t("settings.sectionSsh")}
            description={t("settings.sshHint")}
          >
            <div className="border-border bg-muted/20 rounded-md border px-3 py-6 text-center">
              <p className="text-muted-foreground text-xs">{t("settings.sshEmpty")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => handleSshSoon(t("settings.sshAdd"))}
              >
                {t("settings.sshAdd")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border h-8 shadow-none"
                onClick={() => handleSshSoon(t("settings.sshPick"))}
              >
                {t("settings.sshPick")}
              </Button>
            </div>
          </SettingsSection>

          {/* 4. AI / Agent */}
          <SettingsSection
            icon={<Sparkles />}
            title={t("settings.sectionAi")}
            description={t("settings.sectionAiHint")}
          >
            <div>
              <FieldLabel>{t("settings.agentKey")}</FieldLabel>
              <Input
                className={settingsFieldClassName}
                type="password"
                value={agentKeyInput}
                onChange={(event) => setAgentKeyInput(event.target.value)}
                onBlur={() => void handleSaveAgentKey()}
                placeholder={
                  agentKeyConfigured
                    ? t("settings.agentKeyConfiguredPlaceholder")
                    : t("settings.agentKeyPlaceholder")
                }
                disabled={agentKeyLoading || agentKeySaving}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                {agentKeyConfigured
                  ? t("settings.agentKeyConfiguredHint")
                  : t("settings.agentKeyHint")}
              </p>
            </div>
            {agentKeyConfigured ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border h-8 shadow-none"
                disabled={agentKeyLoading || agentKeySaving}
                onClick={() => void handleClearAgentKey()}
              >
                {t("settings.clearAgentKey")}
              </Button>
            ) : null}
          </SettingsSection>

          {/* 5. 外部工具 */}
          <SettingsSection
            icon={<Terminal />}
            title={t("settings.sectionTools")}
            description={t("settings.sectionToolsHint")}
          >
            <div>
              <FieldLabel>{t("settings.externalEditor")}</FieldLabel>
              <SelectMenu
                value={externalEditor}
                ariaLabel={t("settings.externalEditor")}
                onChange={setExternalEditor}
                options={[
                  { value: "auto", label: t("settings.editorAuto") },
                  { value: "cursor", label: "Cursor" },
                  { value: "vscode", label: "Visual Studio Code" },
                  { value: "custom", label: t("settings.editorCustom") },
                ]}
              />
            </div>
            <div>
              <FieldLabel>{t("settings.externalEditorPath")}</FieldLabel>
              <Input
                className={settingsFieldClassName}
                value={externalEditorPath}
                onChange={(event) => setExternalEditorPath(event.target.value)}
                placeholder={t("settings.externalEditorPathPlaceholder")}
                disabled={externalEditor !== "custom"}
              />
            </div>
            <div>
              <FieldLabel>{t("settings.shell")}</FieldLabel>
              <SelectMenu
                value={shell}
                ariaLabel={t("settings.shell")}
                onChange={setShell}
                options={[
                  { value: "auto", label: t("settings.shellAuto") },
                  { value: "terminal", label: "Terminal.app" },
                  { value: "iterm", label: "iTerm2" },
                  { value: "custom", label: t("settings.shellCustom") },
                ]}
              />
            </div>
            <div>
              <FieldLabel>{t("settings.shellPath")}</FieldLabel>
              <Input
                className={settingsFieldClassName}
                value={shellPath}
                onChange={(event) => setShellPath(event.target.value)}
                placeholder={t("settings.shellPathPlaceholder")}
                disabled={shell !== "custom"}
              />
            </div>
          </SettingsSection>

          {/* 6. 通用 */}
          <SettingsSection
            icon={<Power />}
            title={t("settings.sectionGeneral")}
            description={t("settings.sectionGeneralHint")}
          >
            <label className="hover:bg-muted/40 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-transparent px-1 py-1.5">
              <div className="min-w-0">
                <p className="text-sm">{t("settings.launchAtLogin")}</p>
                <p className="text-muted-foreground text-[11px]">
                  {t("settings.launchAtLoginHint")}
                </p>
              </div>
              <input
                type="checkbox"
                className="border-input text-primary size-4 shrink-0 rounded-sm accent-primary"
                checked={launchAtLogin}
                onChange={(event) => handleLaunchToggle(event.target.checked)}
                aria-label={t("settings.launchAtLogin")}
              />
            </label>
            <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <Languages className="size-3.5 shrink-0" aria-hidden />
              <Monitor className="size-3.5 shrink-0" aria-hidden />
              {t("settings.alsoInStatusBar")}
            </p>
          </SettingsSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
