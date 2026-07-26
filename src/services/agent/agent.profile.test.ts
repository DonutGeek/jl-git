import { describe, expect, it } from "vitest";

import {
  buildJlgitMeta,
  commitMatchesAuthor,
  formatJlgitMetaBlock,
  prepareProfilesForAgentContext,
  toGitAuthorPatterns,
} from "@/services/agent/agent.profile";
import type { AgentProjectProfile } from "@/types/agent";
import type { Project } from "@/types/project";

describe("commitMatchesAuthor", () => {
  it("邮箱相同、显示名不同时仍命中（设置 jingyue / 提交 DonutGeek）", () => {
    expect(
      commitMatchesAuthor(
        {
          authorName: "DonutGeek",
          authorEmail: "13223057509@163.com",
        },
        { name: "jingyue", email: "13223057509@163.com" },
      ),
    ).toBe(true);
  });

  it("仅姓名命中也可", () => {
    expect(
      commitMatchesAuthor(
        { authorName: "DonutGeek", authorEmail: "a@example.com" },
        { name: "donutgeek", email: "" },
      ),
    ).toBe(true);
  });

  it("姓名与邮箱皆不匹配则拒绝", () => {
    expect(
      commitMatchesAuthor(
        { authorName: "Alice", authorEmail: "a@example.com" },
        { name: "bob", email: "b@example.com" },
      ),
    ).toBe(false);
  });
});

describe("toGitAuthorPatterns", () => {
  it("同时输出邮箱与姓名模式", () => {
    expect(
      toGitAuthorPatterns([{ name: "jingyue", email: "13223057509@163.com" }]),
    ).toEqual(["13223057509@163\\.com", "jingyue"]);
  });
});

describe("buildJlgitMeta / formatJlgitMetaBlock", () => {
  const project: Project = {
    id: "p1",
    path: "/tmp/demo",
    name: "演示仓",
    workspaceId: "g1",
    description: "  跨端 Git 客户端  ",
    icon: "folder-git-2",
    pinned: false,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    lastOpenedAt: null,
  };

  it("登记详情进入 jlgitMeta，并序列化给模型", () => {
    const meta = buildJlgitMeta(project, new Map([["g1", "工作"]]));
    expect(meta).toEqual({
      path: "/tmp/demo",
      alias: "演示仓",
      groupName: "工作",
      description: "跨端 Git 客户端",
    });
    const block = formatJlgitMetaBlock(meta);
    expect(block).toContain("description: 跨端 Git 客户端");
    expect(block).toContain("alias: 演示仓");
  });

  it("无详情时不输出 description 行", () => {
    const meta = buildJlgitMeta({ ...project, description: null }, new Map());
    expect(meta.description).toBeNull();
    expect(formatJlgitMetaBlock(meta)).not.toContain("description:");
  });
});

describe("prepareProfilesForAgentContext", () => {
  it("二次过滤不会因显示名不一致清空已按邮箱拉取的提交", () => {
    const profile: AgentProjectProfile = {
      projectId: "p1",
      projectName: "JLGit",
      projectPath: "/tmp/JLGit",
      jlgitMeta: {
        path: "/tmp/JLGit",
        alias: "JLGit",
        groupName: null,
        description: "现代 Git 桌面客户端",
      },
      firstCommitAt: "2026-01-01T00:00:00+00:00",
      lastCommitAt: "2026-07-01T00:00:00+00:00",
      sampledCommitCount: 1,
      techStackHints: [],
      packageTechStack: [],
      recentCommits: [
        {
          id: "abc",
          shortId: "abc",
          subject: "feat: x",
          authorName: "DonutGeek",
          authorEmail: "13223057509@163.com",
          authoredAt: "2026-07-01T00:00:00+00:00",
        },
      ],
    };

    const [next] = prepareProfilesForAgentContext(
      [profile],
      [{ name: "jingyue", email: "13223057509@163.com" }],
    );

    expect(next?.recentCommits).toHaveLength(1);
    expect(next?.sampledCommitCount).toBe(1);
  });
});
