import { describe, expect, it } from "vitest";

import { buildAgentSystemPrompt } from "@/prompts/agent";
import { buildMultiAgentSystemPrompt } from "@/prompts/agent/multi";

const SKILL_ONLY_TERMS = /resume|简历|matchedcommits|author matching/i;
const SKILL_CREATOR_ONLY_TERMS =
  /skill creator|技能创建|SKILL\.md|openai\.yaml|awaiting-input/i;

describe("通用 Agent Prompt 隔离", () => {
  it("单仓 Prompt 不携带简历技能术语", () => {
    const prompt = buildAgentSystemPrompt(
      "zh-CN",
      "Repository status: clean",
    );
    expect(prompt).not.toMatch(SKILL_ONLY_TERMS);
    expect(prompt).not.toMatch(SKILL_CREATOR_ONLY_TERMS);
  });

  it("多仓 Prompt 不携带简历技能术语", () => {
    const prompt = buildMultiAgentSystemPrompt(
      "zh-CN",
      "Registered repositories: A",
    );
    expect(prompt).not.toMatch(SKILL_ONLY_TERMS);
    expect(prompt).not.toMatch(SKILL_CREATOR_ONLY_TERMS);
  });
});
