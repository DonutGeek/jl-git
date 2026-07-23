import { describe, expect, it } from "vitest";

import { buildSkillCreatorSystemPrompt } from "@/prompts/skillCreator";

describe("Skill Creator Prompt", () => {
  it("包含技能包契约与隔离边界", () => {
    const prompt = buildSkillCreatorSystemPrompt(
      "zh-CN",
      "Repository status: clean",
    );

    expect(prompt).toContain("SKILL.md");
    expect(prompt).toContain("agents/openai.yaml");
    expect(prompt).toContain("jlgit-skill-creator:awaiting-input");
    expect(prompt).toContain("jlgit-skill-creator:artifact");
    expect(prompt).toContain("Do not infer personal identity");
    expect(prompt).toContain("cannot save files");
    expect(prompt).not.toMatch(/resume|简历|matchedCommits/i);
  });

  it("将仓库信息限定为可选证据", () => {
    const prompt = buildSkillCreatorSystemPrompt(
      "en",
      "Registered repositories: demo",
    );

    expect(prompt).toContain("Optional repository context");
    expect(prompt).toContain("Registered repositories: demo");
  });
});
