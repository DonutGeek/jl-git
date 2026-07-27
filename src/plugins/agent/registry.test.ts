import { describe, expect, it } from "vitest";

import {
  AGENT_EXTENSIONS,
  AGENT_SKILLS,
  getAgentPluginByMentionId,
} from "@/plugins/agent/registry";

describe("鲸灵内置技能注册表", () => {
  it("注册简历与 Skill Creator，且 id/mentionId 唯一", () => {
    expect(AGENT_SKILLS.map((skill) => skill.id)).toEqual(["resume", "skill-creator"]);
    expect(new Set(AGENT_EXTENSIONS.map((item) => item.id)).size).toBe(AGENT_EXTENSIONS.length);
    expect(new Set(AGENT_EXTENSIONS.map((item) => item.mentionId)).size).toBe(
      AGENT_EXTENSIONS.length,
    );
  });

  it("可通过 mentionId 找到 Skill Creator", () => {
    expect(getAgentPluginByMentionId("plugin:skill-creator")?.id).toBe("skill-creator");
  });
});
