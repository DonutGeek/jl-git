/** Monaco 主题 API 的最小形状，避免依赖 React 包装库 */
export interface MonacoThemeHost {
  editor: {
    defineTheme: (name: string, theme: Record<string, unknown>) => void;
    setTheme: (name: string) => void;
  };
}
