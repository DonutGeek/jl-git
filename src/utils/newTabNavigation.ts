/** 新标签页仪表盘可被外部导航直接打开的视图 */
export type NewTabProjectManagerView = "open" | "clone";

export interface NewTabLocationState {
  projectManagerView?: NewTabProjectManagerView;
}

export function parseNewTabLocationState(state: unknown): NewTabProjectManagerView | null {
  if (!state || typeof state !== "object") {
    return null;
  }
  const view = (state as NewTabLocationState).projectManagerView;
  return view === "open" || view === "clone" ? view : null;
}

export function newTabLocationState(view: NewTabProjectManagerView): NewTabLocationState {
  return { projectManagerView: view };
}
