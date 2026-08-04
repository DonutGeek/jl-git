import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";

interface ButtonLoadingContentProps {
  loading: boolean;
  children: ReactNode;
  loadingLabel?: ReactNode;
}

/** 异步按钮统一的加载反馈，保留动作文案并显示旋转指示器。 */
export function ButtonLoadingContent({
  loading,
  children,
  loadingLabel,
}: ButtonLoadingContentProps) {
  return (
    <>
      {loading ? <Spinner className="size-3.5" aria-hidden="true" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </>
  );
}
