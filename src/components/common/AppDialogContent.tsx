import type { ComponentProps, ReactNode } from "react";
import { AlertDialogContent, AlertDialogHeader } from "@/components/ui/alert-dialog";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AppDialogSize = "sm" | "md" | "lg" | "xl" | "2xl";

const DIALOG_SIZE_CLASS: Record<AppDialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

const DIALOG_CONTENT_CLASS =
  "gap-5 p-5 sm:rounded-lg [&_[data-slot=dialog-header]]:gap-1.5 [&_[data-slot=dialog-header]]:pr-6 [&_[data-slot=dialog-header]]:text-left [&_[data-slot=dialog-title]]:text-base [&_[data-slot=dialog-title]]:leading-6 [&_[data-slot=dialog-description]]:leading-5 [&_[data-slot=dialog-footer]]:pt-1";

const ALERT_DIALOG_CONTENT_CLASS =
  "gap-5 p-5 sm:rounded-lg [&_[data-slot=alert-dialog-header]]:gap-1.5 [&_[data-slot=alert-dialog-title]]:text-base [&_[data-slot=alert-dialog-title]]:leading-6 [&_[data-slot=alert-dialog-description]]:leading-5 [&_[data-slot=alert-dialog-footer]]:pt-1";

interface AppDialogContentProps extends Omit<ComponentProps<typeof DialogContent>, "size"> {
  size?: AppDialogSize;
}

interface AppAlertDialogContentProps extends Omit<
  ComponentProps<typeof AlertDialogContent>,
  "size"
> {
  size?: AppDialogSize;
}

interface AppAlertDialogHeaderProps {
  children: ReactNode;
}

/** JLGit 业务弹窗统一外壳：只组合 shadcn Dialog，不修改基础组件。 */
export function AppDialogContent({ size = "md", className, ...props }: AppDialogContentProps) {
  return (
    <DialogContent
      data-jlgit-dialog
      className={cn(className, DIALOG_CONTENT_CLASS, DIALOG_SIZE_CLASS[size])}
      {...props}
    />
  );
}

/** JLGit 确认弹窗统一外壳：视觉与普通弹窗同源，同时保留 AlertDialog 语义。 */
export function AppAlertDialogContent({
  size = "md",
  className,
  ...props
}: AppAlertDialogContentProps) {
  return (
    <AlertDialogContent
      data-jlgit-alert-dialog
      className={cn(className, ALERT_DIALOG_CONTENT_CLASS, DIALOG_SIZE_CLASS[size])}
      {...props}
    />
  );
}

/** 二次确认统一头部：保持紧凑，仅承载标题与必要说明。 */
export function AppAlertDialogHeader({ children }: AppAlertDialogHeaderProps) {
  return <AlertDialogHeader>{children}</AlertDialogHeader>;
}
