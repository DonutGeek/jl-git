import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  GitBranch,
  KeyRound,
  Languages,
  Monitor,
  Palette,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectMenu } from "@/components/common/SelectMenu";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  createAiApiKey,
  deleteAiApiKey,
  getAiInstructions,
  listAiApiKeys,
  renameAiApiKey,
  setAiApiKeyEnabled,
  setAiInstructions,
} from "@/services/ai";
import type { AiApiKey } from "@/services/ai";
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
const settingsTextareaClassName =
  "border-border min-h-28 resize-y px-2.5 py-2 text-xs shadow-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40";

type SettingsCategory = "appearance" | "git" | "ssh" | "ai" | "tools" | "general";

function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return "*".repeat(key.length);
  }
  return `${key.slice(0, 8)}${"*".repeat(12)}${key.slice(-4)}`;
}

function formatApiKeyDate(value: string, locale: AppLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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
                ? "bg-background text-foreground"
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

  const [apiKeys, setApiKeys] = useState<AiApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeyActionId, setApiKeyActionId] = useState<string | null>(null);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyPendingDeletion, setApiKeyPendingDeletion] = useState<AiApiKey | null>(null);
  const [apiKeyEditing, setApiKeyEditing] = useState<AiApiKey | null>(null);
  const [editedApiKeyName, setEditedApiKeyName] = useState("");
  const [apiKeyRenaming, setApiKeyRenaming] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyValue, setNewApiKeyValue] = useState("");
  const [apiKeyCreating, setApiKeyCreating] = useState(false);
  const [commitInstructions, setCommitInstructions] = useState("");
  const [pullRequestInstructions, setPullRequestInstructions] = useState("");
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [instructionsReady, setInstructionsReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("appearance");

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);

  const savedIdentityRef = useRef({ name: "", email: "" });
  const identityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedInstructionsRef = useRef({ commit: "", pullRequest: "" });
  const instructionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIdentityLoading(true);
    setApiKeysLoading(true);
    setInstructionsLoading(true);
    setInstructionsReady(false);
    setFontsLoading(true);

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

    void listAiApiKeys()
      .then((keys) => {
        if (!cancelled) {
          setApiKeys(keys);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(toUserMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setApiKeysLoading(false);
        }
      });

    void getAiInstructions()
      .then((instructions) => {
        if (!cancelled) {
          setCommitInstructions(instructions.commit);
          setPullRequestInstructions(instructions.pullRequest);
          savedInstructionsRef.current = instructions;
          setInstructionsReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(toUserMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInstructionsLoading(false);
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

  async function persistInstructions(instructions: {
    commit: string;
    pullRequest: string;
  }): Promise<void> {
    try {
      await setAiInstructions(instructions);
      savedInstructionsRef.current = instructions;
      toast.success(t("settings.aiInstructionsSaved"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  const persistInstructionsRef = useRef(persistInstructions);
  persistInstructionsRef.current = persistInstructions;

  /** 输入停顿后自动保存 AI Git 指令，首次加载不回写。 */
  useEffect(() => {
    if (!open || instructionsLoading || !instructionsReady) {
      return;
    }

    const next = {
      commit: commitInstructions,
      pullRequest: pullRequestInstructions,
    };
    if (
      next.commit === savedInstructionsRef.current.commit &&
      next.pullRequest === savedInstructionsRef.current.pullRequest
    ) {
      return;
    }

    if (instructionsTimerRef.current) {
      clearTimeout(instructionsTimerRef.current);
    }
    instructionsTimerRef.current = setTimeout(() => {
      void persistInstructionsRef.current(next);
    }, 600);

    return () => {
      if (instructionsTimerRef.current) {
        clearTimeout(instructionsTimerRef.current);
        instructionsTimerRef.current = null;
      }
    };
  }, [commitInstructions, instructionsLoading, instructionsReady, open, pullRequestInstructions]);

  async function handleCreateApiKey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!newApiKeyName.trim() || !newApiKeyValue.trim()) {
      toast.error(t("settings.apiKeyRequired"));
      return;
    }

    setApiKeyCreating(true);
    try {
      const keys = await createAiApiKey(newApiKeyName, newApiKeyValue);
      setApiKeys(keys);
      setNewApiKeyName("");
      setNewApiKeyValue("");
      setApiKeyDialogOpen(false);
      toast.success(t("settings.apiKeyCreated"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setApiKeyCreating(false);
    }
  }

  async function handleApiKeyEnabled(key: AiApiKey): Promise<void> {
    setApiKeyActionId(key.id);
    try {
      setApiKeys(await setAiApiKeyEnabled(key.id, !key.enabled));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setApiKeyActionId(null);
    }
  }

  async function handleRenameApiKey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const key = apiKeyEditing;
    if (!key || !editedApiKeyName.trim()) {
      toast.error(t("settings.apiKeyNameRequired"));
      return;
    }

    setApiKeyRenaming(true);
    try {
      setApiKeys(await renameAiApiKey(key.id, editedApiKeyName));
      setApiKeyEditing(null);
      setEditedApiKeyName("");
      toast.success(t("settings.apiKeyRenamed"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setApiKeyRenaming(false);
    }
  }

  async function handleDeleteApiKey(): Promise<void> {
    const key = apiKeyPendingDeletion;
    if (!key) {
      return;
    }

    setApiKeyActionId(key.id);
    try {
      setApiKeys(await deleteAiApiKey(key.id));
      setApiKeyPendingDeletion(null);
      toast.success(t("settings.apiKeyDeleted"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setApiKeyActionId(null);
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

  const categories: Array<{
    id: SettingsCategory;
    label: string;
    icon: ReactNode;
  }> = [
    { id: "appearance", label: t("settings.sectionAppearance"), icon: <Palette /> },
    { id: "git", label: t("settings.sectionGit"), icon: <GitBranch /> },
    { id: "ssh", label: t("settings.sectionSsh"), icon: <KeyRound /> },
    { id: "ai", label: t("settings.sectionAi"), icon: <Sparkles /> },
    { id: "tools", label: t("settings.sectionTools"), icon: <Terminal /> },
    { id: "general", label: t("settings.sectionGeneral"), icon: <Power /> },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-[min(780px,92vw)] max-w-none flex-col gap-0 p-0 sm:max-w-[780px]"
        showCloseButton={false}
      >
        <SheetHeader className="border-border space-y-0 border-b px-4 py-3 pr-10 text-left">
          <SheetTitle className="text-sm font-semibold">{t("settings.title")}</SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            {t("settings.subtitle")}
          </SheetDescription>
          <SheetClose className="ring-offset-background focus:ring-ring absolute top-3 right-3 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">{t("common.close")}</span>
          </SheetClose>
        </SheetHeader>

        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0">
            <aside className="border-border bg-muted/20 w-44 shrink-0 border-r px-2 py-3">
              <nav className="space-y-1" aria-label={t("settings.categoryNavigation")}>
                {categories.map((category) => {
                  const active = category.id === activeCategory;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={active}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
                        active
                          ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      onClick={() => setActiveCategory(category.id)}
                    >
                      <span className="[&_svg]:size-3.5" aria-hidden>
                        {category.icon}
                      </span>
                      {category.label}
                    </button>
                  );
                })}
              </nav>
            </aside>
            <ScrollArea className="h-full min-w-0 flex-1 px-6 py-5">
              <div className="mx-auto max-w-xl space-y-8">
          {/* 1. 外观 */}
          {activeCategory === "appearance" ? <SettingsSection
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
          </SettingsSection> : null}

          {/* 2. Git */}
          {activeCategory === "git" ? <SettingsSection
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
          </SettingsSection> : null}

          {/* 3. SSH */}
          {activeCategory === "ssh" ? <SettingsSection
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
          </SettingsSection> : null}

          {/* 4. AI / Agent */}
          {activeCategory === "ai" ? <SettingsSection
            icon={<Sparkles />}
            title={t("settings.sectionAi")}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {t("settings.apiKeyListHint")}
              </p>
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setApiKeyDialogOpen(true)}
              >
                <Plus aria-hidden="true" />
                {t("settings.createApiKey")}
              </Button>
            </div>
            <div className="border-border overflow-hidden rounded-md border">
              <div className="bg-muted/40 text-muted-foreground grid grid-cols-[minmax(80px,0.9fr)_minmax(120px,1.35fr)_52px_78px_100px] gap-3 border-b px-3 py-2 text-[11px] font-medium">
                <span>{t("settings.apiKeyName")}</span>
                <span>{t("settings.apiKeyValue")}</span>
                <span>{t("settings.apiKeyStatus")}</span>
                <span>{t("settings.apiKeyCreatedAt")}</span>
                <span>{t("settings.apiKeyActions")}</span>
              </div>
              {apiKeysLoading ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                  {t("common.loading")}
                </p>
              ) : apiKeys.length === 0 ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                  {t("settings.apiKeyEmpty")}
                </p>
              ) : (
                <ul>
                  {apiKeys.map((key) => {
                    const actionBusy = apiKeyActionId === key.id;
                    return (
                      <li
                        key={key.id}
                        className="grid grid-cols-[minmax(80px,0.9fr)_minmax(120px,1.35fr)_52px_78px_100px] items-center gap-3 px-3 py-3 [&:not(:last-child)]:border-b"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate text-xs font-medium">{key.name}</span>
                          </TooltipTrigger>
                          <TooltipContent>{key.name}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground truncate font-mono text-[11px]">
                              {maskApiKey(key.key)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{maskApiKey(key.key)}</TooltipContent>
                        </Tooltip>
                        <span
                          className={cn(
                            "justify-self-start rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            key.enabled
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {key.enabled ? t("settings.apiKeyEnabled") : t("settings.apiKeyDisabled")}
                        </span>
                        <time className="text-muted-foreground text-[11px]" dateTime={key.createdAt}>
                          {formatApiKeyDate(key.createdAt, locale)}
                        </time>
                        <span className="flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className={cn(
                                  "size-7",
                                  key.enabled
                                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    : "border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
                                )}
                                aria-label={
                                  key.enabled
                                    ? t("settings.disableApiKey")
                                    : t("settings.enableApiKey")
                                }
                                disabled={actionBusy}
                                onClick={() => void handleApiKeyEnabled(key)}
                              >
                                {key.enabled ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {key.enabled ? t("settings.disableApiKey") : t("settings.enableApiKey")}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-7"
                                aria-label={t("settings.editApiKeyName", { name: key.name })}
                                disabled={actionBusy}
                                onClick={() => {
                                  setApiKeyEditing(key);
                                  setEditedApiKeyName(key.name);
                                }}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("settings.edit")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive size-7"
                                aria-label={t("settings.deleteApiKey", { name: key.name })}
                                disabled={actionBusy}
                                onClick={() => setApiKeyPendingDeletion(key)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("settings.delete")}</TooltipContent>
                          </Tooltip>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <FieldLabel>{t("settings.commitInstructions")}</FieldLabel>
              <p className="text-muted-foreground mb-1 text-[11px] leading-relaxed">
                {t("settings.commitInstructionsHint")}
              </p>
              <Textarea
                className={settingsTextareaClassName}
                value={commitInstructions}
                onChange={(event) => setCommitInstructions(event.target.value)}
                placeholder={t("settings.commitInstructionsPlaceholder")}
                disabled={instructionsLoading}
              />
            </div>
            <div>
              <FieldLabel>{t("settings.pullRequestInstructions")}</FieldLabel>
              <p className="text-muted-foreground mb-1 text-[11px] leading-relaxed">
                {t("settings.pullRequestInstructionsHint")}
              </p>
              <Textarea
                className={settingsTextareaClassName}
                value={pullRequestInstructions}
                onChange={(event) => setPullRequestInstructions(event.target.value)}
                placeholder={t("settings.pullRequestInstructionsPlaceholder")}
                disabled={instructionsLoading}
              />
            </div>
          </SettingsSection> : null}

          <Dialog
            open={apiKeyDialogOpen}
            onOpenChange={(nextOpen) => {
              setApiKeyDialogOpen(nextOpen);
              if (!nextOpen && !apiKeyCreating) {
                setNewApiKeyName("");
                setNewApiKeyValue("");
              }
            }}
          >
            <DialogContent>
              <form className="space-y-4" onSubmit={(event) => void handleCreateApiKey(event)}>
                <DialogHeader>
                  <DialogTitle>{t("settings.createApiKey")}</DialogTitle>
                  <DialogDescription>{t("settings.createApiKeyDescription")}</DialogDescription>
                </DialogHeader>
                <div>
                  <FieldLabel>{t("settings.apiKeyName")}</FieldLabel>
                  <Input
                    className={settingsFieldClassName}
                    value={newApiKeyName}
                    onChange={(event) => setNewApiKeyName(event.target.value)}
                    placeholder={t("settings.apiKeyNamePlaceholder")}
                    disabled={apiKeyCreating}
                    autoFocus
                  />
                </div>
                <div>
                  <FieldLabel>{t("settings.apiKeyValue")}</FieldLabel>
                  <Input
                    className={settingsFieldClassName}
                    type="password"
                    value={newApiKeyValue}
                    onChange={(event) => setNewApiKeyValue(event.target.value)}
                    placeholder={t("settings.apiKeyValuePlaceholder")}
                    disabled={apiKeyCreating}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setApiKeyDialogOpen(false)}
                    disabled={apiKeyCreating}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      apiKeyCreating || !newApiKeyName.trim() || !newApiKeyValue.trim()
                    }
                  >
                    {t("settings.createApiKey")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={apiKeyEditing !== null}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && !apiKeyRenaming) {
                setApiKeyEditing(null);
                setEditedApiKeyName("");
              }
            }}
          >
            <DialogContent>
              <form className="space-y-4" onSubmit={(event) => void handleRenameApiKey(event)}>
                <DialogHeader>
                  <DialogTitle>{t("settings.editApiKeyTitle")}</DialogTitle>
                  <DialogDescription>{t("settings.editApiKeyDescription")}</DialogDescription>
                </DialogHeader>
                <div>
                  <FieldLabel>{t("settings.apiKeyName")}</FieldLabel>
                  <Input
                    className={settingsFieldClassName}
                    value={editedApiKeyName}
                    onChange={(event) => setEditedApiKeyName(event.target.value)}
                    disabled={apiKeyRenaming}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={apiKeyRenaming}
                    onClick={() => setApiKeyEditing(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={apiKeyRenaming || !editedApiKeyName.trim()}
                  >
                    {t("settings.saveApiKeyName")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={apiKeyPendingDeletion !== null}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && apiKeyActionId === null) {
                setApiKeyPendingDeletion(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("settings.deleteApiKeyTitle")}</DialogTitle>
                <DialogDescription>
                  {t("settings.deleteApiKeyDescription", {
                    name: apiKeyPendingDeletion?.name ?? "",
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={apiKeyActionId !== null}
                  onClick={() => setApiKeyPendingDeletion(null)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={apiKeyActionId !== null}
                  onClick={() => void handleDeleteApiKey()}
                >
                  <Trash2 aria-hidden="true" />
                  {t("settings.delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 5. 外部工具 */}
          {activeCategory === "tools" ? <SettingsSection
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
          </SettingsSection> : null}

          {/* 6. 通用 */}
          {activeCategory === "general" ? <SettingsSection
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
          </SettingsSection> : null}
            </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
