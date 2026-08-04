import { useState, type KeyboardEvent, type ReactNode } from "react";
import { GitBranch, LayoutGrid, Pencil, RotateCcw, Trash2, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
import { SettingsPreferenceGroup } from "@/components/settings/SettingsPreferenceGroup";
import { SettingsPreferenceRow } from "@/components/settings/SettingsPreferenceRow";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { useShortcutStore, type ShortcutId } from "@/store/useShortcutStore";
import { shortcutBindingFromKeyboardEvent } from "@/utils/shortcutBinding";

interface ShortcutItem {
  id: ShortcutId;
  labelKey: string;
  keys: string[];
}

interface ShortcutGroup {
  id: string;
  labelKey: string;
  icon: ReactNode;
  shortcuts: ShortcutItem[];
}

function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup aria-label={keys.join(" + ")}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function SettingsShortcutsPanel() {
  const { t } = useTranslation();
  const bindings = useShortcutStore((state) => state.bindings);
  const setBinding = useShortcutStore((state) => state.setBinding);
  const resetBinding = useShortcutStore((state) => state.resetBinding);
  const [editing, setEditing] = useState<ShortcutId | null>(null);
  const primaryModifier = isMacPlatform() ? "⌘" : "Ctrl";

  const groups: ShortcutGroup[] = [
    {
      id: "general",
      labelKey: "settings.shortcutsGeneralGroup",
      icon: <Zap />,
      shortcuts: [
        {
          id: "switchRepository",
          labelKey: "settings.shortcutSwitchRepository",
          keys: [primaryModifier, "K"],
        },
        {
          id: "newTab",
          labelKey: "settings.shortcutNewTab",
          keys: [primaryModifier, "T"],
        },
        {
          id: "openSettings",
          labelKey: "settings.shortcutOpenSettings",
          keys: [primaryModifier, ","],
        },
      ],
    },
    {
      id: "git",
      labelKey: "settings.shortcutsGitGroup",
      icon: <GitBranch />,
      shortcuts: [
        {
          id: "commit",
          labelKey: "settings.shortcutCommit",
          keys: [primaryModifier, "Enter"],
        },
        {
          id: "pull",
          labelKey: "settings.shortcutPull",
          keys: [primaryModifier, "⇧", "L"],
        },
        {
          id: "push",
          labelKey: "settings.shortcutPush",
          keys: [primaryModifier, "⇧", "P"],
        },
      ],
    },
    {
      id: "navigation",
      labelKey: "settings.shortcutsNavigationGroup",
      icon: <LayoutGrid />,
      shortcuts: [
        {
          id: "workspace",
          labelKey: "settings.shortcutWorkspace",
          keys: [primaryModifier, "1"],
        },
        {
          id: "changes",
          labelKey: "settings.shortcutChanges",
          keys: [primaryModifier, "2"],
        },
        {
          id: "history",
          labelKey: "settings.shortcutHistory",
          keys: [primaryModifier, "3"],
        },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("settings.shortcutsDescription")}
      </p>
      {groups.map((group) => (
        <section key={group.id}>
          <SettingsFieldHeading icon={group.icon}>{t(group.labelKey)}</SettingsFieldHeading>
          <SettingsPreferenceGroup>
            {group.shortcuts.map((shortcut) => (
              <SettingsPreferenceRow key={shortcut.id} label={t(shortcut.labelKey)}>
                <div className="flex items-center gap-1">
                  {editing === shortcut.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      autoFocus
                      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        const binding = shortcutBindingFromKeyboardEvent(event.nativeEvent);
                        if (!binding) return;
                        if (setBinding(shortcut.id, binding)) {
                          setEditing(null);
                          return;
                        }
                        toast.error(t("settings.shortcutsDuplicate"));
                      }}
                    >
                      {t("settings.shortcutsRecording")}
                    </Button>
                  ) : bindings[shortcut.id] ? (
                    <ShortcutKeys
                      keys={bindings[shortcut.id]!.split("+").map((key) =>
                        key === "Mod" ? primaryModifier : key === "Shift" ? "⇧" : key,
                      )}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {t("settings.shortcutsDisabled")}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setEditing(shortcut.id)}
                    aria-label={t("settings.shortcutsEdit")}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setBinding(shortcut.id, null)}
                    aria-label={t("settings.shortcutsDelete")}
                  >
                    <Trash2 />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => resetBinding(shortcut.id)}
                    aria-label={t("settings.shortcutsReset")}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              </SettingsPreferenceRow>
            ))}
          </SettingsPreferenceGroup>
        </section>
      ))}
    </div>
  );
}
