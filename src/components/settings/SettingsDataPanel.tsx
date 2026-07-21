import { useEffect, useState } from "react";
import {
  Copy,
  Database,
  FolderOpen,
  HardDriveDownload,
  HardDriveUpload,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  clearModule,
  exportBackup,
  getPaths,
  importBackup,
  reveal,
  type AppDataClearModule,
  type AppDataPaths,
} from "@/services/data/data.service";
import { useAgentChatStore } from "@/store/useAgentChatStore";
import { useJinglvStore } from "@/store/useJinglvStore";
import { toUserMessage } from "@/types/error";

interface ClearTarget {
  module: AppDataClearModule;
  title: string;
  description: string;
  confirm: string;
  destructive?: boolean;
}

/** 设置 → 数据：路径、按模块清理、备份导入导出 */
export function SettingsDataPanel() {
  const { t } = useTranslation();
  const [paths, setPaths] = useState<AppDataPaths | null>(null);
  const [pathsError, setPathsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingClear, setPendingClear] = useState<ClearTarget | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);

  const clearAgentChats = useAgentChatStore((state) => state.clearAllConversations);
  const clearResumeChats = useJinglvStore(
    (state) => state.clearAllConversations,
  );

  useEffect(() => {
    let active = true;
    void getPaths()
      .then((next) => {
        if (active) {
          setPaths(next);
          setPathsError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPathsError(toUserMessage(error) || t("settings.dataPathsFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  const clearTargets: ClearTarget[] = [
    {
      module: "agent_chats",
      title: t("settings.dataClearAgentChats"),
      description: t("settings.dataClearAgentChatsHint"),
      confirm: t("settings.dataClearAgentChatsConfirm"),
    },
    {
      module: "jinglv_chats",
      title: t("settings.dataClearJinglvChats"),
      description: t("settings.dataClearJinglvChatsHint"),
      confirm: t("settings.dataClearJinglvChatsConfirm"),
    },
    {
      module: "ai_secrets",
      title: t("settings.dataClearAiSecrets"),
      description: t("settings.dataClearAiSecretsHint"),
      confirm: t("settings.dataClearAiSecretsConfirm"),
    },
    {
      module: "git_accounts",
      title: t("settings.dataClearGitAccounts"),
      description: t("settings.dataClearGitAccountsHint"),
      confirm: t("settings.dataClearGitAccountsConfirm"),
    },
    {
      module: "jinglv_identity",
      title: t("settings.dataClearJinglvIdentity"),
      description: t("settings.dataClearJinglvIdentityHint"),
      confirm: t("settings.dataClearJinglvIdentityConfirm"),
    },
    {
      module: "ui_prefs",
      title: t("settings.dataClearUiPrefs"),
      description: t("settings.dataClearUiPrefsHint"),
      confirm: t("settings.dataClearUiPrefsConfirm"),
    },
    {
      module: "open_tabs",
      title: t("settings.dataClearOpenTabs"),
      description: t("settings.dataClearOpenTabsHint"),
      confirm: t("settings.dataClearOpenTabsConfirm"),
    },
    {
      module: "all_app_data",
      title: t("settings.dataClearAll"),
      description: t("settings.dataClearAllHint"),
      confirm: t("settings.dataClearAllConfirm"),
      destructive: true,
    },
  ];

  async function copyPath(value: string): Promise<void> {
    try {
      await writeText(value);
      toast.success(t("settings.dataPathCopied"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataCopyFailed"));
    }
  }

  async function handleReveal(target: "dir" | "database"): Promise<void> {
    try {
      await reveal(target);
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataRevealFailed"));
    }
  }

  async function runClear(target: ClearTarget): Promise<void> {
    setBusy(true);
    try {
      await clearModule(target.module);
      if (
        target.module === "agent_chats" ||
        target.module === "all_app_data"
      ) {
        clearAgentChats();
      }
      if (
        target.module === "jinglv_chats" ||
        target.module === "all_app_data"
      ) {
        clearResumeChats();
      }
      toast.success(t("settings.dataClearDone"));
      if (target.module === "ui_prefs" || target.module === "all_app_data") {
        toast.message(t("settings.dataClearRestartHint"));
      }
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataClearFailed"));
    } finally {
      setBusy(false);
      setPendingClear(null);
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true);
    try {
      const path = await exportBackup();
      if (path) {
        toast.success(t("settings.dataExportDone"));
      }
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataExportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportConfirmed(): Promise<void> {
    setImportConfirmOpen(false);
    setBusy(true);
    try {
      const result = await importBackup();
      if (!result) {
        return;
      }
      clearAgentChats();
      clearResumeChats();
      toast.success(t("settings.dataImportDone"));
      if (result.requiresRestart) {
        toast.message(t("settings.dataImportRestartHint"));
      }
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <Database />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{t("settings.dataStorageTitle")}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {t("settings.dataStorageHint")}
            </p>
          </div>
        </div>
        <div className="space-y-3 pl-6">
          {pathsError ? (
            <p className="text-destructive text-xs">{pathsError}</p>
          ) : null}
          <PathRow
            label={t("settings.dataAppDir")}
            value={paths?.appDataDir}
            onCopy={() => {
              if (paths) void copyPath(paths.appDataDir);
            }}
            onReveal={() => {
              void handleReveal("dir");
            }}
            revealLabel={t("settings.dataRevealDir")}
            copyLabel={t("settings.dataCopyPath")}
          />
          <PathRow
            label={t("settings.dataDatabase")}
            value={paths?.databasePath}
            onCopy={() => {
              if (paths) void copyPath(paths.databasePath);
            }}
            onReveal={() => {
              void handleReveal("database");
            }}
            revealLabel={t("settings.dataRevealDatabase")}
            copyLabel={t("settings.dataCopyPath")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <Trash2 />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{t("settings.dataClearTitle")}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {t("settings.dataClearHint")}
            </p>
          </div>
        </div>
        <div className="space-y-1 pl-6">
          {clearTargets.map((target) => (
            <div
              key={target.module}
              className="flex items-start justify-between gap-3 rounded-md px-1 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm">{target.title}</p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  {target.description}
                </p>
              </div>
              <Button
                type="button"
                variant={target.destructive ? "destructive" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs shadow-none"
                disabled={busy}
                onClick={() => setPendingClear(target)}
              >
                {t("settings.dataClearAction")}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <HardDriveDownload />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{t("settings.dataBackupTitle")}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {t("settings.dataBackupHint")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-none"
            disabled={busy}
            onClick={() => {
              void handleExport();
            }}
          >
            <HardDriveDownload className="size-3.5" aria-hidden="true" />
            {t("settings.dataExport")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-none"
            disabled={busy}
            onClick={() => setImportConfirmOpen(true)}
          >
            <HardDriveUpload className="size-3.5" aria-hidden="true" />
            {t("settings.dataImport")}
          </Button>
        </div>
      </section>

      <Dialog
        open={pendingClear != null}
        onOpenChange={(open) => {
          if (!open) setPendingClear(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingClear?.destructive
                ? t("settings.dataClearAllTitle")
                : t("settings.dataClearConfirmTitle")}
            </DialogTitle>
            <DialogDescription>{pendingClear?.confirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingClear(null)}
            >
              {t("agent.editCancel")}
            </Button>
            <Button
              type="button"
              variant={pendingClear?.destructive ? "destructive" : "default"}
              disabled={busy || !pendingClear}
              onClick={() => {
                if (pendingClear) void runClear(pendingClear);
              }}
            >
              {t("settings.dataClearAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.dataImportConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.dataImportConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportConfirmOpen(false)}
            >
              {t("agent.editCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void handleImportConfirmed();
              }}
            >
              {t("settings.dataImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PathRowProps {
  label: string;
  value: string | undefined;
  onCopy: () => void;
  onReveal: () => void;
  revealLabel: string;
  copyLabel: string;
}

function PathRow({
  label,
  value,
  onCopy,
  onReveal,
  revealLabel,
  copyLabel,
}: PathRowProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <div className="flex items-start gap-1.5">
        <code className="bg-muted/50 border-border min-h-8 flex-1 break-all rounded-md border px-2 py-1.5 font-mono text-[11px] leading-relaxed">
          {value ?? "…"}
        </code>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0 shadow-none"
              disabled={!value}
              aria-label={copyLabel}
              onClick={onCopy}
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copyLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0 shadow-none"
              disabled={!value}
              aria-label={revealLabel}
              onClick={onReveal}
            >
              <FolderOpen className="size-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{revealLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
