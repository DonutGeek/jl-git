import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Activity,
  Info,
  KeyRound,
  Keyboard,
  Palette,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Folder,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { SettingsAboutPanel } from "@/components/settings/SettingsAboutPanel";
import { SettingsAiBalance } from "@/components/settings/SettingsAiBalance";
import { SettingsCommitModel } from "@/components/settings/SettingsCommitModel";
import { SettingsDataPanel } from "@/components/settings/SettingsDataPanel";
import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
import { SettingsColorSwatch } from "@/components/settings/SettingsColorSwatch";
import { SettingsPerformancePanel } from "@/components/settings/SettingsPerformancePanel";
import { SettingsPreferenceGroup } from "@/components/settings/SettingsPreferenceGroup";
import { SettingsPreferenceRow } from "@/components/settings/SettingsPreferenceRow";
import { SettingsSshPanel } from "@/components/settings/SettingsSshPanel";
import { SettingsShortcutsPanel } from "@/components/settings/SettingsShortcutsPanel";
import { SettingsTip } from "@/components/settings/SettingsTip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import {
  coerceShellPreference,
  editorPathPlaceholderKey,
  shellOptionsForOs,
  shellPathPlaceholderKey,
} from "@/utils/externalToolsPrefs";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
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
  getDeepSeekApiKeysUrl,
  listAiApiKeys,
  renameAiApiKey,
  setAiApiKeyEnabled,
  setAiInstructions,
} from "@/services/ai";
import type { AiApiKey } from "@/services/ai";
import {
  createGitIdentityAccount,
  deleteGitIdentityAccount,
  listGitIdentityAccounts,
  setGitIdentityAccountEnabled,
  updateGitIdentityAccount,
  type GitIdentityAccount,
} from "@/services/git/git.accounts";
import { pickDirectory } from "@/services/project/project.service";
import { listSystemFonts } from "@/services/system/system.info";
import { setLaunchAtLoginEnabled } from "@/services/system/system.autostart";
import { openExternalUrl } from "@/services/system/open-url";
import { resolveEffective, type ThemeMode } from "@/services/theme/theme.service";
import { APP_THEME_OPTIONS, chromeFromPreset, normalizeAppThemeId } from "@/design/editor-themes";
import {
  CLIENT_FONT_SYSTEM,
  EDITOR_FONT_SYSTEM,
  useAppPrefsStore,
  type StartupTabsMode,
} from "@/store/useAppPrefsStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import {
  useSettingsDrawerStore,
  type SettingsDrawerCategory,
} from "@/store/useSettingsDrawerStore";
import { useThemeStore } from "@/store/useThemeStore";
import { toUserMessage } from "@/types/error";
import type { AppLocale } from "@/i18n/locale";

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  /** 标题旁问号说明 */
  tip?: string;
  tipAria?: string;
  /** 标题行右侧操作（如「新增」），与标题垂直对齐 */
  action?: ReactNode;
  children: ReactNode;
}

function SettingsSection({ icon, title, tip, tipAria, action, children }: SettingsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <h3 className="text-sm font-medium">{title}</h3>
              {tip ? <SettingsTip ariaLabel={tipAria ?? title}>{tip}</SettingsTip> : null}
            </div>
            {action ? <div className="shrink-0 self-start">{action}</div> : null}
          </div>
        </div>
      </div>
      <div className="space-y-3 px-6">{children}</div>
    </section>
  );
}

/** 设置表单控件：与顶栏分支选择器同系（轻边框、无阴影） */
const settingsFieldClassName =
  "border-border h-8 px-2.5 shadow-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40";
const settingsTextareaClassName =
  "border-border min-h-28 resize-y px-2.5 py-2 text-xs shadow-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40";

/** 设置列表表头：略紧凑，与原先 grid 视觉接近 */
const settingsTableHeadClassName =
  "bg-muted/40 text-muted-foreground h-9 px-3 text-[11px] font-medium";
const settingsTableCellClassName = "px-3 py-2.5";

type SettingsCategory = SettingsDrawerCategory;

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
  fit = false,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  ariaLabel: string;
  onChange: (value: T) => void;
  /** 右栏紧凑：按内容宽度，不拉满 */
  fit?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted/60 flex flex-wrap gap-1 rounded-lg p-1",
        fit && "w-max max-w-full",
        className,
      )}
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
              "hover:bg-background/80 cursor-pointer rounded-md px-2.5 py-1.5 text-xs transition-colors",
              fit ? "shrink-0" : "min-w-0 flex-1",
              selected ? "bg-background text-foreground" : "text-muted-foreground",
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
  const { os } = useWindowChromeLayout();
  const open = useSettingsDrawerStore((state) => state.open);
  const setOpen = useSettingsDrawerStore((state) => state.setOpen);
  const requestedCategory = useSettingsDrawerStore((state) => state.requestedCategory);
  const clearRequestedCategory = useSettingsDrawerStore((state) => state.clearRequestedCategory);
  const refreshIdentity = useRepoStore((state) => state.refreshIdentity);

  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const clientFont = useAppPrefsStore((state) => state.clientFont);
  const editorFont = useAppPrefsStore((state) => state.editorFont);
  const appThemeId = useAppPrefsStore((state) => state.appThemeId);
  const themeChromeLight = useAppPrefsStore((state) => state.themeChromeLight);
  const themeChromeDark = useAppPrefsStore((state) => state.themeChromeDark);
  const externalEditor = useAppPrefsStore((state) => state.externalEditor);
  const externalEditorPath = useAppPrefsStore((state) => state.externalEditorPath);
  const shell = useAppPrefsStore((state) => state.shell);
  const shellPath = useAppPrefsStore((state) => state.shellPath);
  const gitExtraPath = useAppPrefsStore((state) => state.gitExtraPath);
  const launchAtLogin = useAppPrefsStore((state) => state.launchAtLogin);
  const startupTabsMode = useAppPrefsStore((state) => state.startupTabsMode);
  const pushAfterCommit = useAppPrefsStore((state) => state.pushAfterCommit);
  const branchPrefix = useAppPrefsStore((state) => state.branchPrefix);
  const setClientFont = useAppPrefsStore((state) => state.setClientFont);
  const setEditorFont = useAppPrefsStore((state) => state.setEditorFont);
  const setAppThemeId = useAppPrefsStore((state) => state.setAppThemeId);
  const patchThemeChrome = useAppPrefsStore((state) => state.patchThemeChrome);
  const setExternalEditor = useAppPrefsStore((state) => state.setExternalEditor);

  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const effectiveMode = resolveEffective(mode, systemPrefersDark);
  const editingDarkTheme = effectiveMode === "dark";
  const activeChrome = editingDarkTheme ? themeChromeDark : themeChromeLight;
  const presetChrome = chromeFromPreset(appThemeId, editingDarkTheme);
  const setExternalEditorPath = useAppPrefsStore((state) => state.setExternalEditorPath);
  const setShell = useAppPrefsStore((state) => state.setShell);
  const setShellPath = useAppPrefsStore((state) => state.setShellPath);
  const setGitExtraPath = useAppPrefsStore((state) => state.setGitExtraPath);
  const setLaunchAtLogin = useAppPrefsStore((state) => state.setLaunchAtLogin);
  const setStartupTabsMode = useAppPrefsStore((state) => state.setStartupTabsMode);
  const setPushAfterCommit = useAppPrefsStore((state) => state.setPushAfterCommit);
  const setBranchPrefix = useAppPrefsStore((state) => state.setBranchPrefix);

  const [branchPrefixDraft, setBranchPrefixDraft] = useState(branchPrefix);
  const [gitAccounts, setGitAccounts] = useState<GitIdentityAccount[]>([]);
  const [gitAccountsLoading, setGitAccountsLoading] = useState(false);
  const [gitAccountActionId, setGitAccountActionId] = useState<string | null>(null);
  const [gitAccountDialogOpen, setGitAccountDialogOpen] = useState(false);
  const [gitAccountPendingDeletion, setGitAccountPendingDeletion] =
    useState<GitIdentityAccount | null>(null);
  const [gitAccountEditing, setGitAccountEditing] = useState<GitIdentityAccount | null>(null);
  const [editedGitAccountName, setEditedGitAccountName] = useState("");
  const [editedGitAccountEmail, setEditedGitAccountEmail] = useState("");
  const [gitAccountSaving, setGitAccountSaving] = useState(false);
  const [newGitAccountName, setNewGitAccountName] = useState("");
  const [newGitAccountEmail, setNewGitAccountEmail] = useState("");
  const [gitAccountCreating, setGitAccountCreating] = useState(false);

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

  const savedInstructionsRef = useRef({ commit: "", pullRequest: "" });
  const instructionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (): void => {
      setSystemPrefersDark(media.matches);
    };
    syncSystemTheme();
    media.addEventListener("change", syncSystemTheme);
    return () => {
      media.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  useEffect(() => {
    setBranchPrefixDraft(branchPrefix);
  }, [branchPrefix]);

  // 外部 openDrawer("git") 时落到对应分区
  useEffect(() => {
    if (!open || !requestedCategory) {
      return;
    }
    setActiveCategory(requestedCategory);
    clearRequestedCategory();
  }, [open, requestedCategory, clearRequestedCategory]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setGitAccountsLoading(true);
    setApiKeysLoading(true);
    setInstructionsLoading(true);
    setInstructionsReady(false);
    setFontsLoading(true);

    void listGitIdentityAccounts()
      .then((accounts) => {
        if (!cancelled) {
          setGitAccounts(accounts);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(toUserMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGitAccountsLoading(false);
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
          savedInstructionsRef.current = {
            commit: instructions.commit,
            pullRequest: instructions.pullRequest,
          };
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
      if (instructionsTimerRef.current) {
        clearTimeout(instructionsTimerRef.current);
        instructionsTimerRef.current = null;
      }
    };
  }, [open]);

  async function persistInstructions(instructions: {
    commit: string;
    pullRequest: string;
  }): Promise<void> {
    try {
      await setAiInstructions(instructions);
      // 清空后回退默认规则，与 getAiInstructions 生效值对齐
      const effective = await getAiInstructions();
      savedInstructionsRef.current = {
        commit: effective.commit,
        pullRequest: effective.pullRequest,
      };
      setCommitInstructions(effective.commit);
      setPullRequestInstructions(effective.pullRequest);
      toast.success(t("settings.aiInstructionsSaved"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  const persistInstructionsRef = useRef(persistInstructions);
  persistInstructionsRef.current = persistInstructions;

  /** 输入停顿后自动保存 Git AI 指令；首次加载不回写。 */
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

  async function handleOpenDeepSeekApiKeysConsole(): Promise<void> {
    try {
      await openExternalUrl(getDeepSeekApiKeysUrl());
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.apiKeyOpenConsoleFailed"));
    }
  }

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

  async function handleLaunchToggle(next: boolean): Promise<void> {
    try {
      await setLaunchAtLoginEnabled(next);
      setLaunchAtLogin(next);
      toast.success(next ? t("settings.launchAtLoginOnHint") : t("settings.launchAtLoginOffHint"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.launchAtLoginFailed"));
    }
  }

  function gitExtraPathDir(): string {
    return (
      gitExtraPath
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("#")) ?? ""
    );
  }

  async function handlePickGitExtraPathDir(): Promise<void> {
    try {
      const path = await pickDirectory();
      if (!path) {
        return;
      }
      setGitExtraPath(path);
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.gitExtraPathPickFailed"));
    }
  }

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
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
    { id: "data", label: t("settings.sectionData"), icon: <Database /> },
    { id: "general", label: t("settings.sectionGeneral"), icon: <Settings2 /> },
    { id: "shortcuts", label: t("settings.sectionShortcuts"), icon: <Keyboard /> },
    { id: "performance", label: t("settings.sectionPerformance"), icon: <Activity /> },
    { id: "about", label: t("settings.sectionAbout"), icon: <Info /> },
  ];

  async function handleCreateGitAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!newGitAccountName.trim() || !newGitAccountEmail.trim()) {
      toast.error(t("settings.gitAccountRequired"));
      return;
    }
    setGitAccountCreating(true);
    try {
      setGitAccounts(await createGitIdentityAccount(newGitAccountName, newGitAccountEmail));
      setGitAccountDialogOpen(false);
      setNewGitAccountName("");
      setNewGitAccountEmail("");
      await refreshIdentity();
      toast.success(t("settings.gitAccountCreated"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setGitAccountCreating(false);
    }
  }

  async function handleUpdateGitAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const account = gitAccountEditing;
    if (!account) return;
    if (!editedGitAccountName.trim() || !editedGitAccountEmail.trim()) {
      toast.error(t("settings.gitAccountRequired"));
      return;
    }
    setGitAccountSaving(true);
    try {
      setGitAccounts(
        await updateGitIdentityAccount(account.id, editedGitAccountName, editedGitAccountEmail),
      );
      setGitAccountEditing(null);
      await refreshIdentity();
      toast.success(t("settings.gitAccountUpdated"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setGitAccountSaving(false);
    }
  }

  async function handleGitAccountEnabled(account: GitIdentityAccount): Promise<void> {
    setGitAccountActionId(account.id);
    try {
      setGitAccounts(await setGitIdentityAccountEnabled(account.id, !account.enabled));
      await refreshIdentity();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setGitAccountActionId(null);
    }
  }

  async function handleDeleteGitAccount(): Promise<void> {
    const account = gitAccountPendingDeletion;
    if (!account) return;
    setGitAccountActionId(account.id);
    try {
      setGitAccounts(await deleteGitIdentityAccount(account.id));
      setGitAccountPendingDeletion(null);
      await refreshIdentity();
      toast.success(t("settings.gitAccountDeleted"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setGitAccountActionId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-[min(780px,92vw)] max-w-none flex-col gap-0 p-0 sm:max-w-[780px]"
        showCloseButton={false}
      >
        <SheetHeader className="border-border space-y-0 border-b px-4 py-3 pr-10 text-left">
          <SheetTitle className="text-sm font-semibold">{t("settings.title")}</SheetTitle>
          {/* 仅供读屏：副标题不必占视觉空间 */}
          <SheetDescription className="sr-only">{t("settings.subtitle")}</SheetDescription>
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
                      onClick={() => {
                        // 仅切换右侧分区；多仓鲸灵窗口由分区内按钮手动打开
                        setActiveCategory(category.id);
                      }}
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
            <ScrollArea className="h-full min-w-0 flex-1 px-6 py-5 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
              <div className="w-full max-w-3xl min-w-0 space-y-8">
                {/* 1. 外观 */}
                {activeCategory === "appearance" ? (
                  <SettingsSection
                    icon={<Palette />}
                    title={t("settings.sectionAppearance")}
                    tip={t("settings.sectionAppearanceHint")}
                    tipAria={t("settings.sectionAppearanceTipAria")}
                  >
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow label={t("settings.theme")}>
                        <SegmentedControl
                          fit
                          value={mode}
                          options={themeOptions}
                          ariaLabel={t("settings.theme")}
                          onChange={setMode}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.language")}>
                        <SegmentedControl
                          fit
                          value={locale}
                          options={localeOptions}
                          ariaLabel={t("settings.language")}
                          onChange={setLocale}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow
                        label={t("settings.appTheme")}
                        description={t("settings.appThemeHint")}
                      >
                        <SelectMenu
                          value={appThemeId}
                          ariaLabel={t("settings.appTheme")}
                          onChange={(value) => {
                            setAppThemeId(normalizeAppThemeId(value));
                          }}
                          triggerClassName="h-8 w-48 max-w-[40vw]"
                          options={APP_THEME_OPTIONS.map((option) => ({
                            value: option.id,
                            label: t(option.labelKey),
                          }))}
                        />
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow label={t("settings.themeAccent")}>
                        <SettingsColorSwatch
                          solid
                          value={activeChrome.accent}
                          presetValue={presetChrome.accent}
                          ariaLabel={t("settings.themeAccent")}
                          onChange={(hex) => patchThemeChrome({ accent: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeBackground")}>
                        <SettingsColorSwatch
                          value={activeChrome.background}
                          presetValue={presetChrome.background}
                          ariaLabel={t("settings.themeBackground")}
                          onChange={(hex) => patchThemeChrome({ background: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeForeground")}>
                        <SettingsColorSwatch
                          value={activeChrome.foreground}
                          presetValue={presetChrome.foreground}
                          ariaLabel={t("settings.themeForeground")}
                          onChange={(hex) => patchThemeChrome({ foreground: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeSurface")}>
                        <SettingsColorSwatch
                          value={activeChrome.surface}
                          presetValue={presetChrome.surface}
                          ariaLabel={t("settings.themeSurface")}
                          onChange={(hex) => patchThemeChrome({ surface: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeMuted")}>
                        <SettingsColorSwatch
                          value={activeChrome.muted}
                          presetValue={presetChrome.muted}
                          ariaLabel={t("settings.themeMuted")}
                          onChange={(hex) => patchThemeChrome({ muted: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeMutedForeground")}>
                        <SettingsColorSwatch
                          value={activeChrome.mutedForeground}
                          presetValue={presetChrome.mutedForeground}
                          ariaLabel={t("settings.themeMutedForeground")}
                          onChange={(hex) => patchThemeChrome({ mutedForeground: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeBorder")}>
                        <SettingsColorSwatch
                          value={activeChrome.border}
                          presetValue={presetChrome.border}
                          ariaLabel={t("settings.themeBorder")}
                          onChange={(hex) => patchThemeChrome({ border: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeSidebar")}>
                        <SettingsColorSwatch
                          value={activeChrome.sidebar}
                          presetValue={presetChrome.sidebar}
                          ariaLabel={t("settings.themeSidebar")}
                          onChange={(hex) => patchThemeChrome({ sidebar: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeSelection")}>
                        <SettingsColorSwatch
                          value={activeChrome.selection}
                          presetValue={presetChrome.selection}
                          ariaLabel={t("settings.themeSelection")}
                          onChange={(hex) => patchThemeChrome({ selection: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeDestructive")}>
                        <SettingsColorSwatch
                          value={activeChrome.destructive}
                          presetValue={presetChrome.destructive}
                          ariaLabel={t("settings.themeDestructive")}
                          onChange={(hex) => patchThemeChrome({ destructive: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow
                        label={t("settings.themeTranslucentSidebar")}
                        description={t("settings.themeTranslucentSidebarHint")}
                      >
                        <Switch
                          checked={activeChrome.translucentSidebar}
                          aria-label={t("settings.themeTranslucentSidebar")}
                          onCheckedChange={(checked) => {
                            patchThemeChrome({ translucentSidebar: checked });
                          }}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow
                        label={t("settings.themeContrast")}
                        description={t("settings.themeContrastHint")}
                      >
                        <div className="flex w-44 max-w-[40vw] items-center gap-2">
                          <Slider
                            value={[activeChrome.contrast]}
                            min={0}
                            max={100}
                            step={1}
                            className="w-full"
                            aria-label={t("settings.themeContrast")}
                            onValueChange={(value) => {
                              const next = value[0];
                              if (typeof next === "number") {
                                patchThemeChrome({ contrast: next });
                              }
                            }}
                          />
                          <span className="text-muted-foreground w-7 shrink-0 text-right font-mono text-[11px] tabular-nums">
                            {activeChrome.contrast}
                          </span>
                        </div>
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow label={t("settings.themeDiffAdded")}>
                        <SettingsColorSwatch
                          value={activeChrome.diffAdded}
                          presetValue={presetChrome.diffAdded}
                          ariaLabel={t("settings.themeDiffAdded")}
                          onChange={(hex) => patchThemeChrome({ diffAdded: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeDiffDeleted")}>
                        <SettingsColorSwatch
                          value={activeChrome.diffDeleted}
                          presetValue={presetChrome.diffDeleted}
                          ariaLabel={t("settings.themeDiffDeleted")}
                          onChange={(hex) => patchThemeChrome({ diffDeleted: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeDiffHunk")}>
                        <SettingsColorSwatch
                          value={activeChrome.diffHunk}
                          presetValue={presetChrome.diffHunk}
                          ariaLabel={t("settings.themeDiffHunk")}
                          onChange={(hex) => patchThemeChrome({ diffHunk: hex })}
                        />
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow label={t("settings.themeGitAdded")}>
                        <SettingsColorSwatch
                          value={activeChrome.gitAdded}
                          presetValue={presetChrome.gitAdded}
                          ariaLabel={t("settings.themeGitAdded")}
                          onChange={(hex) => patchThemeChrome({ gitAdded: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeGitModified")}>
                        <SettingsColorSwatch
                          value={activeChrome.gitModified}
                          presetValue={presetChrome.gitModified}
                          ariaLabel={t("settings.themeGitModified")}
                          onChange={(hex) => patchThemeChrome({ gitModified: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeGitDeleted")}>
                        <SettingsColorSwatch
                          value={activeChrome.gitDeleted}
                          presetValue={presetChrome.gitDeleted}
                          ariaLabel={t("settings.themeGitDeleted")}
                          onChange={(hex) => patchThemeChrome({ gitDeleted: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeGitRenamed")}>
                        <SettingsColorSwatch
                          value={activeChrome.gitRenamed}
                          presetValue={presetChrome.gitRenamed}
                          ariaLabel={t("settings.themeGitRenamed")}
                          onChange={(hex) => patchThemeChrome({ gitRenamed: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeGitUntracked")}>
                        <SettingsColorSwatch
                          value={activeChrome.gitUntracked}
                          presetValue={presetChrome.gitUntracked}
                          ariaLabel={t("settings.themeGitUntracked")}
                          onChange={(hex) => patchThemeChrome({ gitUntracked: hex })}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.themeGitConflict")}>
                        <SettingsColorSwatch
                          value={activeChrome.gitConflict}
                          presetValue={presetChrome.gitConflict}
                          ariaLabel={t("settings.themeGitConflict")}
                          onChange={(hex) => patchThemeChrome({ gitConflict: hex })}
                        />
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow
                        label={t("settings.clientFont")}
                        description={fontsLoading ? t("settings.fontsLoading") : undefined}
                      >
                        <SelectMenu
                          value={clientFont}
                          disabled={fontsLoading}
                          ariaLabel={t("settings.clientFont")}
                          onChange={setClientFont}
                          triggerClassName="h-8 w-48 max-w-[40vw]"
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
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow label={t("settings.editorFont")}>
                        <SelectMenu
                          value={editorFont}
                          disabled={fontsLoading}
                          ariaLabel={t("settings.editorFont")}
                          onChange={setEditorFont}
                          triggerClassName="h-8 w-48 max-w-[40vw]"
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
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                  </SettingsSection>
                ) : null}

                {/* 2. Git */}
                {activeCategory === "git" ? (
                  <SettingsSection icon={<GitBranch />} title={t("settings.sectionGit")}>
                    <div className="w-full space-y-2">
                      <div className="flex w-full items-center justify-between gap-3">
                        <SettingsFieldHeading
                          className="mb-0"
                          icon={<UserRound />}
                          tip={t("settings.sectionGitHint")}
                          tipAria={t("settings.sectionGitTipAria")}
                        >
                          {t("settings.gitAccountsTitle")}
                        </SettingsFieldHeading>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => setGitAccountDialogOpen(true)}
                        >
                          <Plus aria-hidden="true" />
                          {t("settings.createGitAccount")}
                        </Button>
                      </div>
                      <div className="border-border overflow-hidden rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className={settingsTableHeadClassName}>
                                {t("settings.gitUserName")}
                              </TableHead>
                              <TableHead className={settingsTableHeadClassName}>
                                {t("settings.gitEmail")}
                              </TableHead>
                              <TableHead className={cn(settingsTableHeadClassName, "w-[4.5rem]")}>
                                {t("settings.apiKeyStatus")}
                              </TableHead>
                              <TableHead className={cn(settingsTableHeadClassName, "w-[6.75rem]")}>
                                {t("settings.apiKeyActions")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {gitAccountsLoading ? (
                              <TableRow className="hover:bg-transparent">
                                <TableCell
                                  colSpan={4}
                                  className={cn(
                                    settingsTableCellClassName,
                                    "text-muted-foreground text-center text-xs",
                                  )}
                                >
                                  <span className="inline-flex items-center justify-center gap-2">
                                    <Spinner className="size-3.5" />
                                    {t("common.loading")}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ) : gitAccounts.length === 0 ? (
                              <TableRow className="hover:bg-transparent">
                                <TableCell
                                  colSpan={4}
                                  className={cn(
                                    settingsTableCellClassName,
                                    "text-muted-foreground py-6 text-center text-xs",
                                  )}
                                >
                                  {t("settings.gitAccountEmpty")}
                                </TableCell>
                              </TableRow>
                            ) : (
                              gitAccounts.map((account) => {
                                const actionBusy = gitAccountActionId === account.id;
                                return (
                                  <TableRow key={account.id}>
                                    <TableCell
                                      className={cn(
                                        settingsTableCellClassName,
                                        "max-w-[10rem] truncate text-xs font-medium",
                                      )}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="block truncate">{account.name}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>{account.name}</TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell
                                      className={cn(
                                        settingsTableCellClassName,
                                        "text-muted-foreground max-w-[14rem] truncate font-mono text-[11px]",
                                      )}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="block truncate">{account.email}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>{account.email}</TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell className={settingsTableCellClassName}>
                                      <Badge
                                        variant={account.enabled ? "default" : "secondary"}
                                        className={cn(
                                          "h-4 px-1.5 text-[10px]",
                                          !account.enabled && "text-muted-foreground",
                                        )}
                                      >
                                        {account.enabled
                                          ? t("settings.apiKeyEnabled")
                                          : t("settings.apiKeyDisabled")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className={settingsTableCellClassName}>
                                      <span className="flex items-center gap-1.5">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon"
                                              className={cn(
                                                "size-7",
                                                account.enabled
                                                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                  : "border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
                                              )}
                                              aria-label={
                                                account.enabled
                                                  ? t("settings.disableGitAccount")
                                                  : t("settings.enableGitAccount")
                                              }
                                              disabled={actionBusy}
                                              onClick={() => void handleGitAccountEnabled(account)}
                                            >
                                              {account.enabled ? (
                                                <PowerOff aria-hidden="true" />
                                              ) : (
                                                <Power aria-hidden="true" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {account.enabled
                                              ? t("settings.disableGitAccount")
                                              : t("settings.enableGitAccount")}
                                          </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon"
                                              className="size-7"
                                              aria-label={t("settings.editGitAccount", {
                                                name: account.name,
                                              })}
                                              disabled={actionBusy}
                                              onClick={() => {
                                                setGitAccountEditing(account);
                                                setEditedGitAccountName(account.name);
                                                setEditedGitAccountEmail(account.email);
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
                                              aria-label={t("settings.deleteGitAccount", {
                                                name: account.name,
                                              })}
                                              disabled={actionBusy}
                                              onClick={() => setGitAccountPendingDeletion(account)}
                                            >
                                              <Trash2 aria-hidden="true" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{t("settings.delete")}</TooltipContent>
                                        </Tooltip>
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow
                        label={t("settings.pushAfterCommit")}
                        description={t("settings.pushAfterCommitHint")}
                      >
                        <Switch
                          size="sm"
                          checked={pushAfterCommit}
                          onCheckedChange={setPushAfterCommit}
                          aria-label={t("settings.pushAfterCommit")}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow
                        control="below"
                        label={t("settings.branchPrefix")}
                        description={t("settings.branchPrefixHint")}
                      >
                        <Input
                          className={cn(settingsFieldClassName, "w-full font-mono")}
                          value={branchPrefixDraft}
                          onChange={(event) => setBranchPrefixDraft(event.target.value)}
                          onBlur={() => {
                            if (!setBranchPrefix(branchPrefixDraft)) {
                              toast.error(t("settings.branchPrefixInvalid"));
                              setBranchPrefixDraft(branchPrefix);
                              return;
                            }
                            setBranchPrefixDraft(useAppPrefsStore.getState().branchPrefix);
                          }}
                          placeholder={t("settings.branchPrefixPlaceholder")}
                          aria-label={t("settings.branchPrefix")}
                        />
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                  </SettingsSection>
                ) : null}

                <Dialog
                  open={gitAccountDialogOpen}
                  onOpenChange={(nextOpen) => {
                    setGitAccountDialogOpen(nextOpen);
                    if (!nextOpen && !gitAccountCreating) {
                      setNewGitAccountName("");
                      setNewGitAccountEmail("");
                    }
                  }}
                >
                  <AppDialogContent>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => void handleCreateGitAccount(event)}
                    >
                      <DialogHeader>
                        <DialogTitle>{t("settings.createGitAccount")}</DialogTitle>
                        <DialogDescription>
                          {t("settings.createGitAccountDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <FieldGroup className="gap-4">
                        <Field>
                          <FieldLabel htmlFor="new-git-account-name">
                            {t("settings.gitUserName")}
                          </FieldLabel>
                          <Input
                            id="new-git-account-name"
                            className={settingsFieldClassName}
                            value={newGitAccountName}
                            onChange={(event) => setNewGitAccountName(event.target.value)}
                            placeholder={t("settings.gitUserNamePlaceholder")}
                            disabled={gitAccountCreating}
                            autoFocus
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="new-git-account-email">
                            {t("settings.gitEmail")}
                          </FieldLabel>
                          <Input
                            id="new-git-account-email"
                            className={settingsFieldClassName}
                            type="email"
                            value={newGitAccountEmail}
                            onChange={(event) => setNewGitAccountEmail(event.target.value)}
                            placeholder={t("settings.gitEmailPlaceholder")}
                            disabled={gitAccountCreating}
                          />
                        </Field>
                      </FieldGroup>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={gitAccountCreating}
                          onClick={() => setGitAccountDialogOpen(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={gitAccountCreating}>
                          {t("settings.createGitAccount")}
                        </Button>
                      </DialogFooter>
                    </form>
                  </AppDialogContent>
                </Dialog>

                <Dialog
                  open={gitAccountEditing !== null}
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen && !gitAccountSaving) {
                      setGitAccountEditing(null);
                    }
                  }}
                >
                  <AppDialogContent>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => void handleUpdateGitAccount(event)}
                    >
                      <DialogHeader>
                        <DialogTitle>{t("settings.editGitAccountTitle")}</DialogTitle>
                        <DialogDescription>
                          {t("settings.editGitAccountDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <FieldGroup className="gap-4">
                        <Field>
                          <FieldLabel htmlFor="edit-git-account-name">
                            {t("settings.gitUserName")}
                          </FieldLabel>
                          <Input
                            id="edit-git-account-name"
                            className={settingsFieldClassName}
                            value={editedGitAccountName}
                            onChange={(event) => setEditedGitAccountName(event.target.value)}
                            disabled={gitAccountSaving}
                            autoFocus
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="edit-git-account-email">
                            {t("settings.gitEmail")}
                          </FieldLabel>
                          <Input
                            id="edit-git-account-email"
                            className={settingsFieldClassName}
                            type="email"
                            value={editedGitAccountEmail}
                            onChange={(event) => setEditedGitAccountEmail(event.target.value)}
                            disabled={gitAccountSaving}
                          />
                        </Field>
                      </FieldGroup>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={gitAccountSaving}
                          onClick={() => setGitAccountEditing(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={gitAccountSaving}>
                          {t("settings.saveGitAccount")}
                        </Button>
                      </DialogFooter>
                    </form>
                  </AppDialogContent>
                </Dialog>

                <Dialog
                  open={gitAccountPendingDeletion !== null}
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen && gitAccountActionId === null) {
                      setGitAccountPendingDeletion(null);
                    }
                  }}
                >
                  <AppDialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("settings.deleteGitAccountTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("settings.deleteGitAccountDescription", {
                          name: gitAccountPendingDeletion?.name ?? "",
                        })}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={gitAccountActionId !== null}
                        onClick={() => setGitAccountPendingDeletion(null)}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={gitAccountActionId !== null}
                        onClick={() => void handleDeleteGitAccount()}
                      >
                        <Trash2 aria-hidden="true" />
                        {t("settings.delete")}
                      </Button>
                    </DialogFooter>
                  </AppDialogContent>
                </Dialog>

                {/* 3. SSH */}
                {activeCategory === "ssh" ? (
                  <SettingsSection icon={<KeyRound />} title={t("settings.sectionSsh")}>
                    <SettingsSshPanel />
                  </SettingsSection>
                ) : null}

                {/* 4. AI / Agent */}
                {activeCategory === "ai" ? (
                  <SettingsSection icon={<Sparkles />} title={t("settings.sectionAi")}>
                    <div className="w-full space-y-2">
                      <div className="flex w-full items-center justify-between gap-3">
                        <SettingsFieldHeading
                          className="mb-0"
                          icon={<KeyRound />}
                          tipAria={t("settings.apiKeyTipAria")}
                          tip={
                            <span>
                              {t("settings.apiKeyListHintBefore")}
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => {
                                  void handleOpenDeepSeekApiKeysConsole();
                                }}
                              >
                                {t("settings.apiKeyListHintLink")}
                              </button>
                              {t("settings.apiKeyListHintAfter")}
                            </span>
                          }
                        >
                          {t("settings.apiKeyTitle")}
                        </SettingsFieldHeading>
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

                      <div className="border-border w-full overflow-hidden rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className={settingsTableHeadClassName}>
                                {t("settings.apiKeyName")}
                              </TableHead>
                              <TableHead className={settingsTableHeadClassName}>
                                {t("settings.apiKeyValue")}
                              </TableHead>
                              <TableHead className={cn(settingsTableHeadClassName, "w-[4.5rem]")}>
                                {t("settings.apiKeyStatus")}
                              </TableHead>
                              <TableHead className={cn(settingsTableHeadClassName, "w-24")}>
                                {t("settings.apiKeyCreatedAt")}
                              </TableHead>
                              <TableHead className={cn(settingsTableHeadClassName, "w-[6.75rem]")}>
                                {t("settings.apiKeyActions")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {apiKeysLoading ? (
                              <TableRow className="hover:bg-transparent">
                                <TableCell
                                  colSpan={5}
                                  className={cn(
                                    settingsTableCellClassName,
                                    "text-muted-foreground text-center text-xs",
                                  )}
                                >
                                  <span className="inline-flex items-center justify-center gap-2">
                                    <Spinner className="size-3.5" />
                                    {t("common.loading")}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ) : apiKeys.length === 0 ? (
                              <TableRow className="hover:bg-transparent">
                                <TableCell
                                  colSpan={5}
                                  className={cn(
                                    settingsTableCellClassName,
                                    "text-muted-foreground py-6 text-center text-xs",
                                  )}
                                >
                                  {t("settings.apiKeyEmpty")}
                                </TableCell>
                              </TableRow>
                            ) : (
                              apiKeys.map((key) => {
                                const actionBusy = apiKeyActionId === key.id;
                                return (
                                  <TableRow key={key.id}>
                                    <TableCell
                                      className={cn(
                                        settingsTableCellClassName,
                                        "max-w-[10rem] truncate text-xs font-medium",
                                      )}
                                      title={key.name}
                                    >
                                      {key.name}
                                    </TableCell>
                                    <TableCell
                                      className={cn(
                                        settingsTableCellClassName,
                                        "text-muted-foreground max-w-[14rem] truncate font-mono text-[11px]",
                                      )}
                                      title={maskApiKey(key.key)}
                                    >
                                      {maskApiKey(key.key)}
                                    </TableCell>
                                    <TableCell className={settingsTableCellClassName}>
                                      <Badge
                                        variant={key.enabled ? "default" : "secondary"}
                                        className={cn(
                                          "h-4 px-1.5 text-[10px]",
                                          !key.enabled && "text-muted-foreground",
                                        )}
                                      >
                                        {key.enabled
                                          ? t("settings.apiKeyEnabled")
                                          : t("settings.apiKeyDisabled")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell
                                      className={cn(
                                        settingsTableCellClassName,
                                        "text-muted-foreground text-[11px] tabular-nums",
                                      )}
                                    >
                                      <time dateTime={key.createdAt}>
                                        {formatApiKeyDate(key.createdAt, locale)}
                                      </time>
                                    </TableCell>
                                    <TableCell className={settingsTableCellClassName}>
                                      <span className="flex h-7 items-center gap-1.5">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon-sm"
                                              className={cn(
                                                "size-7 shrink-0",
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
                                              {key.enabled ? (
                                                <PowerOff aria-hidden="true" />
                                              ) : (
                                                <Power aria-hidden="true" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {key.enabled
                                              ? t("settings.disableApiKey")
                                              : t("settings.enableApiKey")}
                                          </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon-sm"
                                              className="size-7 shrink-0"
                                              aria-label={t("settings.editApiKeyName", {
                                                name: key.name,
                                              })}
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
                                              size="icon-sm"
                                              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive size-7 shrink-0"
                                              aria-label={t("settings.deleteApiKey", {
                                                name: key.name,
                                              })}
                                              disabled={actionBusy}
                                              onClick={() => setApiKeyPendingDeletion(key)}
                                            >
                                              <Trash2 aria-hidden="true" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{t("settings.delete")}</TooltipContent>
                                        </Tooltip>
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <SettingsAiBalance
                      hasEnabledKey={apiKeys.some((key) => key.enabled)}
                      refreshToken={`${apiKeys
                        .filter((key) => key.enabled)
                        .map((key) => key.id)
                        .join(",")}|${activeCategory}`}
                    />
                    <SettingsCommitModel
                      hasEnabledKey={apiKeys.some((key) => key.enabled)}
                      refreshToken={`${apiKeys
                        .filter((key) => key.enabled)
                        .map((key) => key.id)
                        .join(",")}|${activeCategory}`}
                    />
                    <div className="space-y-2">
                      <SettingsFieldHeading
                        icon={<GitCommitHorizontal />}
                        tip={t("settings.commitInstructionsHint")}
                        tipAria={t("settings.commitInstructionsTipAria")}
                      >
                        {t("settings.commitInstructions")}
                      </SettingsFieldHeading>
                      <Textarea
                        className={settingsTextareaClassName}
                        value={commitInstructions}
                        onChange={(event) => setCommitInstructions(event.target.value)}
                        placeholder={t("settings.commitInstructionsPlaceholder")}
                        disabled={instructionsLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <SettingsFieldHeading
                        icon={<GitPullRequest />}
                        tip={t("settings.pullRequestInstructionsHint")}
                        tipAria={t("settings.pullRequestInstructionsTipAria")}
                      >
                        {t("settings.pullRequestInstructions")}
                      </SettingsFieldHeading>
                      <Textarea
                        className={settingsTextareaClassName}
                        value={pullRequestInstructions}
                        onChange={(event) => setPullRequestInstructions(event.target.value)}
                        placeholder={t("settings.pullRequestInstructionsPlaceholder")}
                        disabled={instructionsLoading}
                      />
                    </div>
                  </SettingsSection>
                ) : null}

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
                  <AppDialogContent>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => void handleCreateApiKey(event)}
                    >
                      <DialogHeader>
                        <DialogTitle>{t("settings.createApiKey")}</DialogTitle>
                        <DialogDescription>
                          {t("settings.createApiKeyDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <FieldGroup className="gap-4">
                        <Field>
                          <FieldLabel htmlFor="new-api-key-name">
                            {t("settings.apiKeyName")}
                          </FieldLabel>
                          <Input
                            id="new-api-key-name"
                            className={settingsFieldClassName}
                            value={newApiKeyName}
                            onChange={(event) => setNewApiKeyName(event.target.value)}
                            placeholder={t("settings.apiKeyNamePlaceholder")}
                            disabled={apiKeyCreating}
                            autoFocus
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="new-api-key-value">
                            {t("settings.apiKeyValue")}
                          </FieldLabel>
                          <Input
                            id="new-api-key-value"
                            className={settingsFieldClassName}
                            type="password"
                            value={newApiKeyValue}
                            onChange={(event) => setNewApiKeyValue(event.target.value)}
                            placeholder={t("settings.apiKeyValuePlaceholder")}
                            disabled={apiKeyCreating}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </Field>
                      </FieldGroup>
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
                  </AppDialogContent>
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
                  <AppDialogContent>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => void handleRenameApiKey(event)}
                    >
                      <DialogHeader>
                        <DialogTitle>{t("settings.editApiKeyTitle")}</DialogTitle>
                        <DialogDescription>{t("settings.editApiKeyDescription")}</DialogDescription>
                      </DialogHeader>
                      <Field>
                        <FieldLabel htmlFor="edit-api-key-name">
                          {t("settings.apiKeyName")}
                        </FieldLabel>
                        <Input
                          id="edit-api-key-name"
                          className={settingsFieldClassName}
                          value={editedApiKeyName}
                          onChange={(event) => setEditedApiKeyName(event.target.value)}
                          disabled={apiKeyRenaming}
                          autoFocus
                        />
                      </Field>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={apiKeyRenaming}
                          onClick={() => setApiKeyEditing(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={apiKeyRenaming || !editedApiKeyName.trim()}>
                          {t("settings.saveApiKeyName")}
                        </Button>
                      </DialogFooter>
                    </form>
                  </AppDialogContent>
                </Dialog>

                <Dialog
                  open={apiKeyPendingDeletion !== null}
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen && apiKeyActionId === null) {
                      setApiKeyPendingDeletion(null);
                    }
                  }}
                >
                  <AppDialogContent>
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
                  </AppDialogContent>
                </Dialog>

                {/* 5. 外部工具 */}
                {activeCategory === "tools" ? (
                  <SettingsSection
                    icon={<Terminal />}
                    title={t("settings.sectionTools")}
                    tip={t("settings.toolsPrefsHint")}
                    tipAria={t("settings.toolsPrefsTipAria")}
                  >
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow label={t("settings.externalEditor")}>
                        <SelectMenu
                          value={externalEditor}
                          ariaLabel={t("settings.externalEditor")}
                          onChange={setExternalEditor}
                          triggerClassName="h-8 w-[12rem] max-w-[40vw]"
                          options={[
                            { value: "auto", label: t("settings.editorAuto") },
                            { value: "cursor", label: "Cursor" },
                            { value: "vscode", label: "Visual Studio Code" },
                            { value: "custom", label: t("settings.editorCustom") },
                          ]}
                        />
                      </SettingsPreferenceRow>
                      {externalEditor === "custom" ? (
                        <SettingsPreferenceRow
                          control="below"
                          label={t("settings.externalEditorPath")}
                        >
                          <Input
                            className={cn(settingsFieldClassName, "w-full")}
                            value={externalEditorPath}
                            onChange={(event) => setExternalEditorPath(event.target.value)}
                            placeholder={t(`settings.${editorPathPlaceholderKey(os)}`)}
                            aria-label={t("settings.externalEditorPath")}
                          />
                        </SettingsPreferenceRow>
                      ) : null}
                      <SettingsPreferenceRow label={t("settings.shell")}>
                        <SelectMenu
                          value={coerceShellPreference(os, shell)}
                          ariaLabel={t("settings.shell")}
                          onChange={setShell}
                          triggerClassName="h-8 w-[12rem] max-w-[40vw]"
                          options={shellOptionsForOs(os).map((option) => ({
                            value: option.value,
                            label: option.labelKey
                              ? t(`settings.${option.labelKey}`)
                              : (option.label ?? option.value),
                          }))}
                        />
                      </SettingsPreferenceRow>
                      {coerceShellPreference(os, shell) === "custom" ? (
                        <SettingsPreferenceRow control="below" label={t("settings.shellPath")}>
                          <Input
                            className={cn(settingsFieldClassName, "w-full")}
                            value={shellPath}
                            onChange={(event) => setShellPath(event.target.value)}
                            placeholder={t(`settings.${shellPathPlaceholderKey(os)}`)}
                            aria-label={t("settings.shellPath")}
                          />
                        </SettingsPreferenceRow>
                      ) : null}
                      <SettingsPreferenceRow label={t("settings.gitExtraPath")}>
                        <div className="flex max-w-[min(100%,22rem)] items-center justify-end gap-2">
                          {gitExtraPathDir() ? (
                            <span
                              className="text-muted-foreground min-w-0 truncate text-right font-mono text-xs"
                              title={gitExtraPathDir()}
                            >
                              {gitExtraPathDir()}
                            </span>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="shrink-0"
                                aria-label={t("settings.gitExtraPathAdd")}
                                onClick={() => {
                                  void handlePickGitExtraPathDir();
                                }}
                              >
                                <Folder aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("settings.gitExtraPathAdd")}</TooltipContent>
                          </Tooltip>
                        </div>
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                  </SettingsSection>
                ) : null}

                {activeCategory === "data" ? <SettingsDataPanel /> : null}

                {activeCategory === "shortcuts" ? (
                  <SettingsSection
                    icon={<Keyboard />}
                    title={t("settings.sectionShortcuts")}
                    tip={t("settings.sectionShortcutsHint")}
                    tipAria={t("settings.sectionShortcutsTipAria")}
                    action={
                      <Badge variant="secondary" className="text-[10px]">
                        {t("settings.shortcutsPreviewBadge")}
                      </Badge>
                    }
                  >
                    <SettingsShortcutsPanel />
                  </SettingsSection>
                ) : null}

                {activeCategory === "performance" ? (
                  <SettingsSection
                    icon={<Activity />}
                    title={t("settings.sectionPerformance")}
                    tip={t("settings.perfHint")}
                    tipAria={t("settings.perfTipAria")}
                  >
                    <SettingsPerformancePanel />
                  </SettingsSection>
                ) : null}

                {activeCategory === "about" ? <SettingsAboutPanel /> : null}

                {/* 通用：仅应用级偏好（Git 相关开关在 Git 分区） */}
                {activeCategory === "general" ? (
                  <SettingsSection icon={<Settings2 />} title={t("settings.sectionGeneral")}>
                    <SettingsPreferenceGroup>
                      <SettingsPreferenceRow
                        label={t("settings.launchAtLogin")}
                        description={t("settings.launchAtLoginHint")}
                      >
                        <Switch
                          size="sm"
                          checked={launchAtLogin}
                          onCheckedChange={(next) => {
                            void handleLaunchToggle(next);
                          }}
                          aria-label={t("settings.launchAtLogin")}
                        />
                      </SettingsPreferenceRow>
                      <SettingsPreferenceRow
                        label={t("settings.startupTabs")}
                        description={t("settings.startupTabsHint")}
                      >
                        <SelectMenu
                          value={startupTabsMode}
                          ariaLabel={t("settings.startupTabs")}
                          onChange={(value) => {
                            setStartupTabsMode(value as StartupTabsMode);
                          }}
                          triggerClassName="h-8 w-[12rem] max-w-[40vw]"
                          options={[
                            {
                              value: "restore",
                              label: t("settings.startupTabsRestore"),
                            },
                            {
                              value: "fresh",
                              label: t("settings.startupTabsFresh"),
                            },
                          ]}
                        />
                      </SettingsPreferenceRow>
                    </SettingsPreferenceGroup>
                  </SettingsSection>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
