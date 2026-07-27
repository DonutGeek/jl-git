import { describe, expect, it } from "vitest";

import { languageFromPath } from "./monacoPreviewShared";

describe("languageFromPath", () => {
  it("识别 Web / TS / JS", () => {
    expect(languageFromPath("a.tsx")).toBe("typescript");
    expect(languageFromPath("a.mts")).toBe("typescript");
    expect(languageFromPath("a.js")).toBe("javascript");
    expect(languageFromPath("pkg.json")).toBe("json");
  });

  it("识别常用后端语言", () => {
    expect(languageFromPath("main.py")).toBe("python");
    expect(languageFromPath("types.pyi")).toBe("python");
    expect(languageFromPath("main.go")).toBe("go");
    expect(languageFromPath("lib.rs")).toBe("rust");
    expect(languageFromPath("App.java")).toBe("java");
    expect(languageFromPath("Main.kt")).toBe("kotlin");
    expect(languageFromPath("index.php")).toBe("php");
    expect(languageFromPath("app.rb")).toBe("ruby");
    expect(languageFromPath("View.swift")).toBe("swift");
    expect(languageFromPath("Program.cs")).toBe("csharp");
    expect(languageFromPath("main.c")).toBe("cpp");
    expect(languageFromPath("main.cpp")).toBe("cpp");
    expect(languageFromPath("main.dart")).toBe("dart");
    expect(languageFromPath("script.lua")).toBe("lua");
    expect(languageFromPath("analysis.r")).toBe("r");
  });

  it("Vue / Svelte / Astro 走 html", () => {
    expect(languageFromPath("src/views/TabBlock.vue")).toBe("html");
    expect(languageFromPath("App.svelte")).toBe("html");
    expect(languageFromPath("page.astro")).toBe("html");
  });

  it("识别配置与 Shell", () => {
    expect(languageFromPath("docker-compose.yml")).toBe("yaml");
    expect(languageFromPath("Cargo.toml")).toBe("ini");
    expect(languageFromPath("setup.sh")).toBe("shell");
    expect(languageFromPath("build.ps1")).toBe("powershell");
    expect(languageFromPath("run.bat")).toBe("bat");
    expect(languageFromPath("schema.graphql")).toBe("graphql");
    expect(languageFromPath("api.proto")).toBe("protobuf");
    expect(languageFromPath("main.tf")).toBe("hcl");
  });

  it("识别特殊文件名", () => {
    expect(languageFromPath("Dockerfile")).toBe("dockerfile");
    expect(languageFromPath("Dockerfile.prod")).toBe("dockerfile");
    expect(languageFromPath("Makefile")).toBe("shell");
    expect(languageFromPath(".gitignore")).toBe("ini");
    expect(languageFromPath(".env")).toBe("ini");
  });

  it("未知扩展为 plaintext", () => {
    expect(languageFromPath("notes.unknownext")).toBe("plaintext");
  });
});
