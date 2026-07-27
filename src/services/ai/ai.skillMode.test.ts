import { describe, expect, it } from "vitest";

import { buildResumeIdentityRequest } from "@/services/agent/agent.resumeIdentity";
import {
  SKILL_CREATOR_ARTIFACT_MARKER,
  SKILL_CREATOR_AWAITING_INPUT_MARKER,
  getAgentSkillMode,
  isResumeSkillTurn,
  isSkillCreatorTurn,
} from "@/services/ai/ai.skillMode";
import type { AgentChatMessage } from "@/types/ai";

function message(
  id: string,
  role: AgentChatMessage["role"],
  content: string,
  mentions?: AgentChatMessage["mentions"],
): AgentChatMessage {
  return {
    id,
    role,
    content,
    createdAt: "2026-07-23T00:00:00.000Z",
    ...(mentions ? { mentions } : {}),
  };
}

describe("isResumeSkillTurn", () => {
  it("显式 @简历时启用技能", () => {
    expect(
      isResumeSkillTurn([
        message("u1", "user", "处理这个项目", [{ type: "plugin", id: "resume", name: "简历" }]),
      ]),
    ).toBe(true);
  });

  it("普通 Git 问答出现简历二字不会误触发", () => {
    expect(isResumeSkillTurn([message("u1", "user", "这个仓库里有个 resume 模板文件吗？")])).toBe(
      false,
    );
  });

  it("身份追问后的声明无需再次 @简历", () => {
    expect(
      isResumeSkillTurn([
        message("u1", "user", "帮我生成项目简历"),
        message("a1", "assistant", buildResumeIdentityRequest("zh-CN")),
        message("u2", "user", "提交邮箱：me@example.com"),
      ]),
    ).toBe(true);
  });

  it("简历成稿后的普通 Git 问题立即回到通用模式", () => {
    expect(
      isResumeSkillTurn([
        message("a1", "assistant", "## 项目经历\n\n### 项目 A"),
        message("u1", "user", "当前分支落后远端几个提交？"),
      ]),
    ).toBe(false);
  });
});

describe("isSkillCreatorTurn", () => {
  it("显式 @技能创建时启用技能", () => {
    const messages = [
      message("u1", "user", "帮我设计这个能力", [
        { type: "plugin", id: "skill-creator", name: "技能创建" },
      ]),
    ];

    expect(isSkillCreatorTurn(messages)).toBe(true);
    expect(getAgentSkillMode(messages)).toBe("skill-creator");
  });

  it("明确创建 Skill 的自然语言请求会启用技能", () => {
    expect(
      isSkillCreatorTurn([message("u1", "user", "帮我创建一个 Codex Skill 来审查提交信息")]),
    ).toBe(true);
  });

  it("询问仓库中的 SKILL.md 不会误触发", () => {
    expect(isSkillCreatorTurn([message("u1", "user", "这个仓库里有没有 SKILL.md 文件？")])).toBe(
      false,
    );
  });

  it("澄清问题后的回答延续技能", () => {
    expect(
      isSkillCreatorTurn([
        message("u1", "user", "请创建一个 Skill"),
        message("a1", "assistant", `它应处理哪些请求？\n${SKILL_CREATOR_AWAITING_INPUT_MARKER}`),
        message("u2", "user", "用于检查 Conventional Commits"),
      ]),
    ).toBe(true);
  });

  it("成稿后的普通 Git 问题回到通用模式", () => {
    const messages = [
      message("a1", "assistant", `### SKILL.md\n${SKILL_CREATOR_ARTIFACT_MARKER}`),
      message("u1", "user", "当前分支有几个未提交文件？"),
    ];

    expect(isSkillCreatorTurn(messages)).toBe(false);
    expect(getAgentSkillMode(messages)).toBeNull();
  });

  it("成稿后的明确修改请求延续技能", () => {
    expect(
      isSkillCreatorTurn([
        message("a1", "assistant", `### SKILL.md\n${SKILL_CREATOR_ARTIFACT_MARKER}`),
        message("u1", "user", "修改这个 Skill，增加两个触发示例"),
      ]),
    ).toBe(true);
  });
});
