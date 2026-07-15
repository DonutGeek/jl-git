import { describe, expect, it } from "vitest";

import { parseRemoteRepository } from "./remoteRepository";

describe("parseRemoteRepository", () => {
  it.each([
    [
      "https://github.com/DonutGeek/developer-portal-service.git",
      "github",
      "developer-portal-service.git",
    ],
    ["git@gitlab.com:group/web.git", "gitlab", "web.git"],
    ["ssh://git@gitee.com/team/tool.git", "gitee", "tool.git"],
    ["https://bitbucket.org/team/api.git", "bitbucket", "api.git"],
    ["git@code.example.com:team/workspace.git", "unknown", "workspace.git"],
  ])("parses %s", (url, provider, repositoryName) => {
    expect(parseRemoteRepository(url)).toEqual({ provider, repositoryName, url });
  });

  it("keeps a repository name without the git suffix", () => {
    expect(parseRemoteRepository("https://github.com/acme/portal")).toEqual({
      provider: "github",
      repositoryName: "portal",
      url: "https://github.com/acme/portal",
    });
  });

  it("returns null for an address without a repository path", () => {
    expect(parseRemoteRepository("git@github.com")).toBeNull();
  });
});
