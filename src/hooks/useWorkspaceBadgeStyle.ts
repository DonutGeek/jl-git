import { useEffect, useState, type CSSProperties } from "react";

import { useThemeStore } from "@/store/useThemeStore";
import {
  adaptWorkspaceColorForTheme,
  workspaceBadgeStyle,
  workspaceColorRing,
} from "@/utils/workspaceColor";

/** 当前文档是否为暗色（含 system 跟随） */
export function useDocumentDark(): boolean {
  const mode = useThemeStore((state) => state.mode);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      setSystemDark(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  if (mode === "dark") {
    return true;
  }
  if (mode === "light") {
    return false;
  }
  return systemDark;
}

/** 分组徽章 style：用户色自动适配昼夜 */
export function useWorkspaceBadgeStyle(
  color: unknown,
): Pick<CSSProperties, "color" | "backgroundColor"> {
  const dark = useDocumentDark();
  return workspaceBadgeStyle(color, dark);
}

/** 展示用适配色（色点 / 边框等） */
export function useAdaptedWorkspaceColor(color: unknown): string {
  const dark = useDocumentDark();
  return adaptWorkspaceColorForTheme(color, dark);
}

/** 拖拽高亮描边 */
export function useWorkspaceColorRing(color: unknown): string {
  const dark = useDocumentDark();
  return workspaceColorRing(color, dark);
}
