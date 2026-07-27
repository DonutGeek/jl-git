import { useEffect, useState, type FormEvent } from "react";
import {
  FolderOpen,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  changeSshKeyPassphrase,
  createSshKey,
  deleteSshKey,
  importSshKeyFromDisk,
  listSshKeys,
  setSshKeyEnabled,
  syncLocalSshKeys,
  type SshKeyRecord,
} from "@/services/ssh/ssh.keys";
import { systemOpenService } from "@/services/system/system.open";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";

/** 设置表单控件：与其它设置分区同系 */
const settingsFieldClassName =
  "border-border h-8 px-2.5 shadow-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40";

const settingsTableHeadClassName =
  "bg-muted/40 text-muted-foreground h-9 px-3 text-[11px] font-medium";
const settingsTableCellClassName = "px-3 py-2.5";

/** 取私钥所在目录，供文件管理器打开 */
function parentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return filePath;
  }
  // Windows 盘符根路径（如 C:/）保留原分隔风格由系统侧规范化
  return filePath.slice(0, index);
}

/** 设置 → SSH：登记密钥、改口令、启用/禁用、打开所在文件夹 */
export function SettingsSshPanel() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<SshKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [editingKey, setEditingKey] = useState<SshKeyRecord | null>(null);
  const [oldPassphrase, setOldPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<SshKeyRecord | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // 启动时已扫过；此处再同步一次以展示最新列表（有新增才 toast）
        const registered = await listSshKeys();
        if (!active) {
          return;
        }
        setKeys(registered);

        const synced = await syncLocalSshKeys();
        if (!active) {
          return;
        }
        setKeys(synced.keys);
        if (synced.importedCount > 0) {
          toast.success(t("settings.sshScanImported", { count: synced.importedCount }));
        }
      } catch (error: unknown) {
        if (active) {
          toast.error(toUserMessage(error) || t("settings.sshLoadFailed"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  function resetCreateForm(): void {
    setName("");
  }

  function resetEditPassphraseForm(): void {
    setOldPassphrase("");
    setNewPassphrase("");
  }

  function openEditPassphrase(key: SshKeyRecord): void {
    resetEditPassphraseForm();
    setEditingKey(key);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      // 新增默认无口令；需要时创建后通过「修改密码」设置
      const next = await createSshKey(name, "");
      setKeys(next);
      setCreateOpen(false);
      resetCreateForm();
      toast.success(t("settings.sshKeyCreated"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshCreateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handlePick(): Promise<void> {
    setBusy(true);
    try {
      const next = await importSshKeyFromDisk();
      if (!next) {
        return;
      }
      setKeys(next);
      toast.success(t("settings.sshKeyImported"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleScanLocal(): Promise<void> {
    setBusy(true);
    try {
      const synced = await syncLocalSshKeys();
      setKeys(synced.keys);
      if (synced.importedCount > 0) {
        toast.success(t("settings.sshScanImported", { count: synced.importedCount }));
      } else if (synced.scannedCount > 0) {
        toast.success(t("settings.sshScanUpToDate"));
      } else {
        toast.message(t("settings.sshScanEmpty", { path: synced.sshDir }));
      }
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshScanFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyPath(path: string): Promise<void> {
    try {
      await copyToClipboard(path);
      toast.success(t("settings.sshPathCopied"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshCopyFailed"));
    }
  }

  async function handleCopyPublicKey(publicKey: string): Promise<void> {
    try {
      await copyToClipboard(publicKey);
      toast.success(t("settings.sshPublicKeyCopied"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshCopyFailed"));
    }
  }

  async function handleToggleEnabled(key: SshKeyRecord): Promise<void> {
    setBusy(true);
    try {
      setKeys(await setSshKeyEnabled(key.id, !key.enabled));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealFolder(key: SshKeyRecord): Promise<void> {
    try {
      await systemOpenService.revealInFileManager(parentDirectory(key.privateKeyPath));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshRevealFailed"));
    }
  }

  async function handleChangePassphrase(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingKey) {
      return;
    }
    const previous = editingKey.hasPassphrase ? oldPassphrase : "";
    if (previous === newPassphrase) {
      toast.error(t("settings.sshPassphraseUnchanged"));
      return;
    }
    setBusy(true);
    try {
      setKeys(await changeSshKeyPassphrase(editingKey.id, previous, newPassphrase));
      setEditingKey(null);
      resetEditPassphraseForm();
      toast.success(t("settings.sshPassphraseUpdated"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshPassphraseChangeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDeletion) {
      return;
    }
    const deletingGenerated = pendingDeletion.origin === "generated";
    setBusy(true);
    try {
      setKeys(await deleteSshKey(pendingDeletion.id));
      setPendingDeletion(null);
      toast.success(deletingGenerated ? t("settings.sshKeyDeleted") : t("settings.sshKeyRemoved"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="w-full space-y-2">
        <div className="flex w-full items-center justify-between gap-3">
          <SettingsFieldHeading
            className="mb-0"
            icon={<KeyRound />}
            tip={t("settings.sshHint")}
            tipAria={t("settings.sshTipAria")}
          >
            {t("settings.sshKeysTitle")}
          </SettingsFieldHeading>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => setCreateOpen(true)}
            >
              <Plus aria-hidden="true" />
              {t("settings.sshAdd")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border h-8 shadow-none"
              disabled={busy || loading}
              onClick={() => {
                void handleScanLocal();
              }}
            >
              <ScanSearch aria-hidden="true" />
              {t("settings.sshScan")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border h-8 shadow-none"
              disabled={busy}
              onClick={() => {
                void handlePick();
              }}
            >
              {t("settings.sshPick")}
            </Button>
          </div>
        </div>

        <div className="border-border min-w-0 overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={settingsTableHeadClassName}>
                  {t("settings.sshKeyName")}
                </TableHead>
                <TableHead className={settingsTableHeadClassName}>
                  {t("settings.sshFilePath")}
                </TableHead>
                <TableHead className={settingsTableHeadClassName}>
                  {t("settings.sshPublicKey")}
                </TableHead>
                <TableHead className={cn(settingsTableHeadClassName, "w-[4.5rem]")}>
                  {t("settings.apiKeyStatus")}
                </TableHead>
                <TableHead className={cn(settingsTableHeadClassName, "w-[9.5rem]")}>
                  {t("settings.apiKeyActions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
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
              ) : keys.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className={cn(
                      settingsTableCellClassName,
                      "text-muted-foreground py-6 text-center text-xs",
                    )}
                  >
                    {t("settings.sshEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className={cn(settingsTableCellClassName, "max-w-[8rem]")}>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <span className="block min-w-0 flex-1 cursor-default truncate text-xs font-medium">
                              {key.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-sm break-all text-left text-wrap"
                          >
                            {key.name}
                          </TooltipContent>
                        </Tooltip>
                        {key.hasPassphrase ? (
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <span
                                className="text-muted-foreground inline-flex shrink-0"
                                aria-label={t("settings.sshHasPassphrase")}
                              >
                                <Lock className="size-3.5" aria-hidden="true" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{t("settings.sshHasPassphrase")}</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={cn(settingsTableCellClassName, "max-w-[12rem]")}>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("settings.dataCopyPath")}
                            className="text-muted-foreground group/sshpath block min-w-0 w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                            onClick={() => {
                              void handleCopyPath(key.privateKeyPath);
                            }}
                          >
                            <span
                              className="block w-full min-w-0 overflow-hidden font-mono text-[11px] leading-5 whitespace-nowrap text-ellipsis underline-offset-2 group-hover/sshpath:underline"
                              style={{ direction: "rtl" }}
                            >
                              <bdi style={{ direction: "ltr" }}>{key.privateKeyPath}</bdi>
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-sm break-all font-mono text-left text-wrap"
                        >
                          {key.privateKeyPath}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={cn(settingsTableCellClassName, "max-w-[12rem]")}>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("settings.sshCopyPublicKey")}
                            className="text-muted-foreground group/sshpub block min-w-0 w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                            onClick={() => {
                              void handleCopyPublicKey(key.publicKey);
                            }}
                          >
                            <span className="block min-w-0 w-full truncate font-mono text-[11px] underline-offset-2 group-hover/sshpub:underline">
                              {maskPublicKey(key.publicKey)}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-md break-all font-mono text-[11px] text-left text-wrap"
                        >
                          {key.publicKey}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={settingsTableCellClassName}>
                      <Badge
                        variant={key.enabled ? "default" : "secondary"}
                        className={cn(
                          "h-4 px-1.5 text-[10px]",
                          !key.enabled && "text-muted-foreground",
                        )}
                      >
                        {key.enabled ? t("settings.sshKeyEnabled") : t("settings.sshKeyDisabled")}
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
                                key.enabled
                                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                                  : "border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
                              )}
                              aria-label={
                                key.enabled
                                  ? t("settings.disableSshKey")
                                  : t("settings.enableSshKey")
                              }
                              disabled={busy}
                              onClick={() => {
                                void handleToggleEnabled(key);
                              }}
                            >
                              {key.enabled ? (
                                <PowerOff aria-hidden="true" />
                              ) : (
                                <Power aria-hidden="true" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {key.enabled ? t("settings.disableSshKey") : t("settings.enableSshKey")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7"
                              aria-label={t("settings.sshEditPassphrase")}
                              disabled={busy}
                              onClick={() => openEditPassphrase(key)}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("settings.sshEditPassphrase")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7"
                              aria-label={t("settings.sshRevealFolder")}
                              disabled={busy}
                              onClick={() => {
                                void handleRevealFolder(key);
                              }}
                            >
                              <FolderOpen aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("settings.sshRevealFolder")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive size-7"
                              aria-label={t("settings.sshDeleteKey", {
                                name: key.name,
                              })}
                              disabled={busy}
                              onClick={() => setPendingDeletion(key)}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("settings.delete")}</TooltipContent>
                        </Tooltip>
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && !busy) {
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="space-y-6" onSubmit={(event) => void handleCreate(event)}>
            <DialogHeader>
              <DialogTitle>{t("settings.sshAddTitle")}</DialogTitle>
            </DialogHeader>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="ssh-key-name">{t("settings.sshKeyName")}</FieldLabel>
                <Input
                  id="ssh-key-name"
                  className={settingsFieldClassName}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("settings.sshNamePlaceholder")}
                  disabled={busy}
                  autoFocus
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || name.trim().length === 0}>
                {t("settings.sshAdd")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingKey != null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditingKey(null);
            resetEditPassphraseForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="space-y-6" onSubmit={(event) => void handleChangePassphrase(event)}>
            <DialogHeader>
              <DialogTitle>{t("settings.sshEditPassphraseTitle")}</DialogTitle>
              <DialogDescription>
                {t("settings.sshEditPassphraseDescription", {
                  name: editingKey?.name ?? "",
                })}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="gap-4">
              {editingKey?.hasPassphrase ? (
                <Field>
                  <FieldLabel htmlFor="ssh-old-passphrase">
                    {t("settings.sshOldPassphrase")}
                  </FieldLabel>
                  <Input
                    id="ssh-old-passphrase"
                    className={settingsFieldClassName}
                    type="password"
                    value={oldPassphrase}
                    onChange={(event) => setOldPassphrase(event.target.value)}
                    placeholder={t("settings.sshOldPassphrasePlaceholder")}
                    disabled={busy}
                    autoComplete="current-password"
                    autoFocus
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="ssh-new-passphrase">
                  {t("settings.sshNewPassphrase")}
                </FieldLabel>
                <Input
                  id="ssh-new-passphrase"
                  className={settingsFieldClassName}
                  type="password"
                  value={newPassphrase}
                  onChange={(event) => setNewPassphrase(event.target.value)}
                  placeholder={t("settings.sshNewPassphrasePlaceholder")}
                  disabled={busy}
                  autoComplete="new-password"
                  autoFocus={!editingKey?.hasPassphrase}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditingKey(null);
                  resetEditPassphraseForm();
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {t("settings.sshSavePassphrase")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDeletion != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletion(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.sshDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t(
                pendingDeletion?.origin === "generated"
                  ? "settings.sshDeleteConfirmGenerated"
                  : "settings.sshDeleteConfirmImported",
                { name: pendingDeletion?.name ?? "" },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPendingDeletion(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void handleDelete();
              }}
            >
              {t("settings.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function maskPublicKey(value: string): string {
  if (value.length <= 28) {
    return value;
  }
  return `${value.slice(0, 16)}…${value.slice(-8)}`;
}
