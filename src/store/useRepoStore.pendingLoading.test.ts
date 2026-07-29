import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitIdentity, GitRepoState, GitStatusResult } from "@/types/git";

vi.mock("@/services/git", () => ({
  gitService: {
    getStatus: vi.fn(),
    getRepoState: vi.fn(),
    getLog: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    getIdentity: vi.fn(),
    listBranches: vi.fn(),
    listTags: vi.fn(),
  },
}));

import { gitService } from "@/services/git";
import {
  beginRepoPendingOp,
  clearRepoPendingOpsForTest,
  endRepoPendingOp,
} from "@/utils/repoPendingOps";

import { beginRepoSwitch, restoreRepoSession, useRepoStore } from "./useRepoStore";

const statusA: GitStatusResult = {
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  detached: false,
  entries: [
    {
      path: "a.txt",
      indexStatus: "M",
      worktreeStatus: ".",
    },
  ],
};

const statusB: GitStatusResult = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  detached: false,
  entries: [],
};

const identity: GitIdentity = { name: "Dev", email: "dev@example.com" };

const idleRepoState: GitRepoState = {
  kind: "clean",
  merging: false,
  oursLabel: "",
  theirsLabel: "",
  conflictCount: 0,
  conflictPaths: [],
};

const branchStub = {
  name: "main",
  isCurrent: true,
  isDefault: true,
  isRemote: false,
  tipShortId: "abc1234",
  tipAuthoredAt: "",
  tipAuthorName: "",
};

describe("useRepoStore 切仓后保留进行中 loading", () => {
  beforeEach(() => {
    clearRepoPendingOpsForTest();
    useRepoStore.getState().reset();
    vi.mocked(gitService.getStatus).mockResolvedValue(statusA);
    vi.mocked(gitService.getRepoState).mockResolvedValue(idleRepoState);
    vi.mocked(gitService.getLog).mockResolvedValue({
      commits: [],
      hasMore: false,
    });
  });

  afterEach(() => {
    clearRepoPendingOpsForTest();
    useRepoStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("A 提交未完成时切到 B 再切回 A，refreshStatus 后仍保持 loading", async () => {
    let resolveCommit!: (_id: string) => void;
    const commitPromise = new Promise<string>((resolve) => {
      resolveCommit = resolve;
    });
    vi.mocked(gitService.commit).mockReturnValue(commitPromise);

    useRepoStore.setState({
      repoPath: "/repo/a",
      status: statusA,
      identity,
      branches: [branchStub],
      tags: [],
      commits: [],
      commitMessage: "feat: work",
      loading: false,
      error: null,
    });

    const commitTask = useRepoStore.getState().commit();

    expect(useRepoStore.getState().loading).toBe(true);

    // 切到 B（离开前会写入 A 的会话缓存）
    beginRepoSwitch("/repo/b");
    useRepoStore.setState({
      status: statusB,
      identity,
      branches: [branchStub],
      loading: false,
    });

    // 模拟 B 的 soft refresh 完成
    vi.mocked(gitService.getStatus).mockResolvedValue(statusB);
    await useRepoStore.getState().refreshStatus();
    expect(useRepoStore.getState().repoPath).toBe("/repo/b");
    expect(useRepoStore.getState().loading).toBe(false);

    // 切回 A：还原会话后再 soft refresh（与 RepoPage 一致）
    vi.mocked(gitService.getStatus).mockResolvedValue(statusA);
    restoreRepoSession("/repo/a");
    expect(useRepoStore.getState().loading).toBe(true);

    await useRepoStore.getState().refreshStatus();
    // 提交仍在进行：loading 不得被 refreshStatus 清掉
    expect(useRepoStore.getState().loading).toBe(true);
    expect(useRepoStore.getState().repoPath).toBe("/repo/a");

    resolveCommit("deadbeef");
    await commitTask;
    expect(useRepoStore.getState().loading).toBe(false);
    expect(useRepoStore.getState().commitMessage).toBe("");
  });

  it("还原会话时若该仓仍有 pending，loading 为 true", () => {
    useRepoStore.setState({
      repoPath: "/repo/a",
      status: statusA,
      identity,
      branches: [branchStub],
      tags: [],
      commits: [],
      commitMessage: "wip",
      loading: false,
    });
    beginRepoSwitch("/repo/b");
    beginRepoPendingOp("/repo/a");

    restoreRepoSession("/repo/a");
    expect(useRepoStore.getState().loading).toBe(true);

    endRepoPendingOp("/repo/a");
  });

  it("A 推送未完成时切到 B，仍向 A 推送并写回 A 会话", async () => {
    let resolvePush!: (value: { ok: true; remote: string; elapsedMs: number }) => void;
    const pushPromise = new Promise<{ ok: true; remote: string; elapsedMs: number }>((resolve) => {
      resolvePush = resolve;
    });
    vi.mocked(gitService.push).mockReturnValue(pushPromise);
    vi.mocked(gitService.listBranches).mockResolvedValue([branchStub]);
    vi.mocked(gitService.getStatus).mockResolvedValue({ ...statusA, ahead: 0 });
    vi.mocked(gitService.getLog).mockResolvedValue({ commits: [], hasMore: false });

    useRepoStore.setState({
      repoPath: "/repo/a",
      status: { ...statusA, ahead: 1, upstream: "origin/main" },
      identity,
      branches: [branchStub],
      tags: [],
      commits: [],
      loading: false,
      error: null,
    });

    const pushTask = useRepoStore.getState().push({ repoPath: "/repo/a" });

    beginRepoSwitch("/repo/b");
    useRepoStore.setState({
      status: statusB,
      identity,
      branches: [branchStub],
      loading: false,
    });

    resolvePush({ ok: true, remote: "origin", elapsedMs: 12 });
    await pushTask;

    expect(gitService.push).toHaveBeenCalledWith(
      "/repo/a",
      expect.objectContaining({ remote: "origin", branch: "main" }),
    );
    expect(useRepoStore.getState().repoPath).toBe("/repo/b");

    // 切回 A：会话应已被 patch 为推送后的 status
    restoreRepoSession("/repo/a");
    expect(useRepoStore.getState().status?.ahead).toBe(0);
  });
});
