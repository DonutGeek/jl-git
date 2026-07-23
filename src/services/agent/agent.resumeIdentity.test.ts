import { describe, expect, it } from "vitest";

import {
  buildResumeIdentityRequest,
  extractDeclaredResumeAuthors,
  parseDeclaredResumeAuthors,
} from "@/services/agent/agent.resumeIdentity";
import type { AgentChatMessage } from "@/types/ai";

function message(
  id: string,
  role: AgentChatMessage["role"],
  content: string,
): AgentChatMessage {
  return {
    id,
    role,
    content,
    createdAt: "2026-07-23T00:00:00.000Z",
  };
}

describe("parseDeclaredResumeAuthors", () => {
  it("解析用户主动声明的 Git 作者名与提交邮箱", () => {
    expect(
      parseDeclaredResumeAuthors(
        "Git 作者名：DonutGeek；提交邮箱：Me@Example.com",
      ),
    ).toEqual([{ name: "DonutGeek", email: "me@example.com" }]);
  });

  it("支持多个 Name <email> 身份", () => {
    expect(
      parseDeclaredResumeAuthors(
        "Alice <alice@example.com>, Bob <bob@example.com>",
      ),
    ).toEqual([
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ]);
  });
});

describe("extractDeclaredResumeAuthors", () => {
  it("不会把普通 Git 问答里的邮箱自动当成用户身份", () => {
    expect(
      extractDeclaredResumeAuthors([
        message("u1", "user", "为什么提交作者是 bot@example.com？"),
        message("a1", "assistant", "这是仓库提交元数据中的作者邮箱。"),
        message("u2", "user", "帮我生成项目简历"),
      ]),
    ).toEqual([]);
  });

  it("身份追问后允许用户只回复邮箱", () => {
    expect(
      extractDeclaredResumeAuthors([
        message("u1", "user", "帮我生成项目简历"),
        message("a1", "assistant", buildResumeIdentityRequest("zh-CN")),
        message("u2", "user", "me@example.com"),
      ]),
    ).toEqual([{ name: "", email: "me@example.com" }]);
  });
});
