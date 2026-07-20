import { createContext, useContext, type ReactNode } from "react";

interface HistoryWorkspaceContextValue {
  /** 为 false 时隐藏「在新窗口查看历史」（已在子弹窗内） */
  allowOpenInNewWindow: boolean;
}

const HistoryWorkspaceContext = createContext<HistoryWorkspaceContextValue>({
  allowOpenInNewWindow: true,
});

export function HistoryWorkspaceProvider({
  allowOpenInNewWindow = true,
  children,
}: {
  allowOpenInNewWindow?: boolean;
  children: ReactNode;
}) {
  return (
    <HistoryWorkspaceContext.Provider value={{ allowOpenInNewWindow }}>
      {children}
    </HistoryWorkspaceContext.Provider>
  );
}

export function useHistoryWorkspace(): HistoryWorkspaceContextValue {
  return useContext(HistoryWorkspaceContext);
}
