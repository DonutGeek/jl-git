export type ChangesToolbarLeadingControl = "sort" | "tree-actions";

export function resolveChangesToolbarLeadingControl(
  view: "list" | "tree",
  searchOpen: boolean,
): ChangesToolbarLeadingControl | null {
  if (searchOpen) {
    return null;
  }
  return view === "tree" ? "tree-actions" : "sort";
}
