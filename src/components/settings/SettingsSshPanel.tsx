import { useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound, Lock, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createSshKey,
  deleteSshKey,
  importSshKeyFromDisk,
  listSshKeys,
  type SshKeyRecord,
} from "@/services/ssh/ssh.keys";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";

/** 设置表单控件：与其它设置分区同系 */
const settingsFieldClassName =
  "border-border h-8 px-2.5 shadow-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40";

/** 设置 → SSH：登记密钥（可设口令）、列表、复制公钥 */
export function SettingsSshPanel() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<SshKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<SshKeyRecord | null>(null);

  useEffect(() => {
    let active = true;
    void listSshKeys()
      .then((next) => {
        if (active) {
          setKeys(next);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(toUserMessage(error) || t("settings.sshLoadFailed"));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  function resetCreateForm(): void {
    setName("");
    setPassphrase("");
    setPassphraseConfirm("");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (passphrase !== passphraseConfirm) {
      toast.error(t("settings.sshPassphraseMismatch"));
      return;
    }
    setBusy(true);
    try {
      const next = await createSshKey(name, passphrase);
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

  async function handleCopy(key: SshKeyRecord): Promise<void> {
    try {
      await copyToClipboard(key.publicKey);
      toast.success(t("settings.sshPublicKeyCopied"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.sshCopyFailed"));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDeletion) {
      return;
    }
    setBusy(true);
    try {
      setKeys(await deleteSshKey(pendingDeletion.id));
      setPendingDeletion(null);
      toast.success(t("settings.sshKeyDeleted"));
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
              disabled={busy}
              onClick={() => {
                void handlePick();
              }}
            >
              {t("settings.sshPick")}
            </Button>
          </div>
        </div>

        <div className="border-border overflow-hidden rounded-md border">
          <div className="bg-muted/40 text-muted-foreground grid grid-cols-[minmax(100px,0.8fr)_minmax(160px,1.7fr)_88px] gap-3 border-b px-3 py-2 text-[11px] font-medium">
            <span>{t("settings.sshKeyName")}</span>
            <span>{t("settings.sshPublicKey")}</span>
            <span>{t("settings.apiKeyActions")}</span>
          </div>
          {loading ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-xs">
              {t("common.loading")}
            </p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-xs">
              {t("settings.sshEmpty")}
            </p>
          ) : (
            <ul>
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="grid grid-cols-[minmax(100px,0.8fr)_minmax(160px,1.7fr)_88px] items-center gap-3 px-3 py-3 not-last:border-b"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate text-xs font-medium">{key.name}</span>
                      </TooltipTrigger>
                      <TooltipContent>{key.name}</TooltipContent>
                    </Tooltip>
                    {key.hasPassphrase ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="text-muted-foreground inline-flex"
                            aria-label={t("settings.sshHasPassphrase")}
                          >
                            <Lock className="size-3.5" aria-hidden="true" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t("settings.sshHasPassphrase")}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground truncate font-mono text-[11px]">
                        {maskPublicKey(key.publicKey)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md break-all font-mono text-[11px]">
                      {key.publicKey}
                    </TooltipContent>
                  </Tooltip>
                  <span className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          aria-label={t("settings.sshCopyPublicKey")}
                          disabled={busy}
                          onClick={() => {
                            void handleCopy(key);
                          }}
                        >
                          <Copy aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("settings.sshCopyPublicKey")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive size-7"
                          aria-label={t("settings.sshDeleteKey", { name: key.name })}
                          disabled={busy}
                          onClick={() => setPendingDeletion(key)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("settings.delete")}</TooltipContent>
                    </Tooltip>
                  </span>
                </li>
              ))}
            </ul>
          )}
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
          <form className="space-y-4" onSubmit={(event) => void handleCreate(event)}>
            <DialogHeader>
              <DialogTitle>{t("settings.sshAddTitle")}</DialogTitle>
              <DialogDescription>{t("settings.sshAddDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-[11px]">
                {t("settings.sshKeyName")}
              </label>
              <Input
                className={settingsFieldClassName}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("settings.sshNamePlaceholder")}
                disabled={busy}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-[11px]">
                {t("settings.sshPassphrase")}
              </label>
              <Input
                className={settingsFieldClassName}
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder={t("settings.sshPassphrasePlaceholder")}
                disabled={busy}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-[11px]">
                {t("settings.sshPassphraseConfirm")}
              </label>
              <Input
                className={settingsFieldClassName}
                type="password"
                value={passphraseConfirm}
                onChange={(event) => setPassphraseConfirm(event.target.value)}
                placeholder={t("settings.sshPassphraseConfirmPlaceholder")}
                disabled={busy}
                autoComplete="new-password"
              />
            </div>
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
              {t("settings.sshDeleteConfirm", {
                name: pendingDeletion?.name ?? "",
              })}
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
