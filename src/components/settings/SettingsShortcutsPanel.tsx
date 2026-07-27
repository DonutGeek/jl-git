import type { ReactNode } from "react";
import { GitBranch, LayoutGrid, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
import { SettingsPreferenceGroup } from "@/components/settings/SettingsPreferenceGroup";
import { SettingsPreferenceRow } from "@/components/settings/SettingsPreferenceRow";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

interface ShortcutItem {
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
  const primaryModifier = isMacPlatform() ? "⌘" : "Ctrl";

  const groups: ShortcutGroup[] = [
    {
      id: "general",
      labelKey: "settings.shortcutsGeneralGroup",
      icon: <Zap />,
      shortcuts: [
        {
          labelKey: "settings.shortcutSwitchRepository",
          keys: [primaryModifier, "K"],
        },
        {
          labelKey: "settings.shortcutNewTab",
          keys: [primaryModifier, "T"],
        },
        {
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
          labelKey: "settings.shortcutCommit",
          keys: [primaryModifier, "Enter"],
        },
        {
          labelKey: "settings.shortcutPull",
          keys: [primaryModifier, "⇧", "L"],
        },
        {
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
          labelKey: "settings.shortcutWorkspace",
          keys: [primaryModifier, "1"],
        },
        {
          labelKey: "settings.shortcutChanges",
          keys: [primaryModifier, "2"],
        },
        {
          labelKey: "settings.shortcutHistory",
          keys: [primaryModifier, "3"],
        },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("settings.shortcutsPreviewDescription")}
      </p>
      {groups.map((group) => (
        <section key={group.id}>
          <SettingsFieldHeading icon={group.icon}>{t(group.labelKey)}</SettingsFieldHeading>
          <SettingsPreferenceGroup>
            {group.shortcuts.map((shortcut) => (
              <SettingsPreferenceRow key={shortcut.labelKey} label={t(shortcut.labelKey)}>
                <ShortcutKeys keys={shortcut.keys} />
              </SettingsPreferenceRow>
            ))}
          </SettingsPreferenceGroup>
        </section>
      ))}
    </div>
  );
}
