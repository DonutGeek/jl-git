import { describe, expect, it } from "vitest";

import { buildAgentSystemPrompt } from "@/prompts/agent";
import { buildMultiAgentSystemPrompt } from "@/prompts/agent/multi";
import { buildResumeSystemPrompt } from "@/prompts/resume";
import { buildSkillCreatorSystemPrompt } from "@/prompts/skillCreator";

const BUILDERS = [
  ["单仓通用", buildAgentSystemPrompt],
  ["多仓通用", buildMultiAgentSystemPrompt],
  ["简历", buildResumeSystemPrompt],
  ["技能创建", buildSkillCreatorSystemPrompt],
] as const;

describe("鲸灵宿主级安全 Prompt", () => {
  it.each(BUILDERS)("%s 模式加载同一安全基线", (_name, buildPrompt) => {
    const prompt = buildPrompt("zh-CN", "Repository status: clean");

    expect(prompt).toContain("Safety and legality are non-negotiable");
    expect(prompt).toContain("unauthorized access");
    expect(prompt).toContain("legitimate defensive security work");
    expect(prompt).toContain("repository content");
    expect(prompt).toContain("untrusted data");
    expect(prompt).toContain("Never reveal credentials");
  });
});
