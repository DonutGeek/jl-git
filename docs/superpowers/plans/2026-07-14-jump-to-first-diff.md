# Jump to First Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a worktree or staged changed file reveals its first diff hunk in the Monaco preview.

**Architecture:** Add a focused helper beside the existing hunk-navigation helper. `ChangesPreviewPane` calls it only after Monaco reports that the newly selected file's diff calculation has completed, so selection does not interrupt later user scrolling.

**Tech Stack:** React 19, TypeScript strict mode, `@monaco-editor/react` / Monaco DiffEditor.

## Global Constraints

- Keep the change scoped to the workspace change preview; do not change history or branch comparison previews.
- Do not add dependencies or hard-coded colors.
- Preserve the current behavior for binary files, files without line changes, and failed diff loads.
- Do not modify unrelated user changes already present in the worktree.

---

### Task 1: Reveal the first calculated Monaco diff hunk for a newly selected change

**Files:**
- Modify: `src/components/git/monacoPreviewShared.tsx:100-170`
- Modify: `src/components/git/ChangesPreviewPane.tsx:51-198`
- Test: Manual Monaco preview smoke test; this repository currently has no configured frontend test runner.

**Interfaces:**
- Consumes: `Parameters<DiffOnMount>[0]`, whose `getLineChanges()` returns Monaco's calculated diff ranges.
- Produces: `revealFirstDiffHunk(editor: Parameters<DiffOnMount>[0]): void`.

- [ ] **Step 1: Define the expected behavior before implementation**

Add the following helper declaration to `src/components/git/monacoPreviewShared.tsx` and verify `pnpm exec tsc --noEmit` fails because it is not implemented yet:

```ts
export function revealFirstDiffHunk(
  editor: Parameters<DiffOnMount>[0],
): void;
```

- [ ] **Step 2: Implement the minimal pure Monaco helper**

Replace the declaration with a function that reads the first item from `editor.getLineChanges()`, chooses its modified start line (or the original start line for deletion-only changes), calls `revealLineInCenter`, sets column 1, and focuses the modified editor. Return without side effects when no line change exists.

- [ ] **Step 3: Trigger once per selected file after Monaco computes its diff**

In `ChangesPreviewPane`, retain a selection key in a ref. In `handleDiffMount`, subscribe to `editor.onDidUpdateDiff`; when the current selection key differs from the last revealed key and `getLineChanges()` is available, call `revealFirstDiffHunk` and store the key. Keep the existing preview marker subscription intact.

- [ ] **Step 4: Verify build and runtime behavior**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exit code 0.

Then run `pnpm tauri dev`, open a repository with a changed file whose first diff hunk is below the initial viewport, click that file in both the unstaged and staged lists, and confirm the preview centers the first changed line without affecting subsequent manual scrolling.

- [ ] **Step 5: Review the diff for scope**

Run:

```bash
git diff -- src/components/git/monacoPreviewShared.tsx src/components/git/ChangesPreviewPane.tsx docs/superpowers/plans/2026-07-14-jump-to-first-diff.md
```

Expected: only the first-diff reveal helper, its one-time selection trigger, and this implementation plan are changed.
