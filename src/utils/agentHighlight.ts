import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import objectivec from "highlight.js/lib/languages/objectivec";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scala from "highlight.js/lib/languages/scala";
import scss from "highlight.js/lib/languages/scss";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import vbnet from "highlight.js/lib/languages/vbnet";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

let registered = false;

function ensureLanguagesRegistered(): void {
  if (registered) {
    return;
  }
  registered = true;

  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("shell", shell);
  hljs.registerLanguage("powershell", powershell);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("kotlin", kotlin);
  hljs.registerLanguage("swift", swift);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("csharp", csharp);
  hljs.registerLanguage("ruby", ruby);
  hljs.registerLanguage("php", php);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("scss", scss);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("dockerfile", dockerfile);
  hljs.registerLanguage("ini", ini);
  hljs.registerLanguage("graphql", graphql);
  hljs.registerLanguage("lua", lua);
  hljs.registerLanguage("r", r);
  hljs.registerLanguage("scala", scala);
  hljs.registerLanguage("perl", perl);
  hljs.registerLanguage("objectivec", objectivec);
  hljs.registerLanguage("vbnet", vbnet);
  hljs.registerLanguage("plaintext", plaintext);

  // 别名：围栏语言标签常见写法
  hljs.registerAliases(["ts", "tsx", "mts", "cts"], { languageName: "typescript" });
  hljs.registerAliases(["js", "jsx", "mjs", "cjs"], { languageName: "javascript" });
  hljs.registerAliases(["html", "htm", "xhtml", "svg"], { languageName: "xml" });
  hljs.registerAliases(["yml"], { languageName: "yaml" });
  hljs.registerAliases(["sh", "zsh"], { languageName: "bash" });
  hljs.registerAliases(["ps1", "pwsh"], { languageName: "powershell" });
  hljs.registerAliases(["py"], { languageName: "python" });
  hljs.registerAliases(["rs"], { languageName: "rust" });
  hljs.registerAliases(["md", "mkd"], { languageName: "markdown" });
  hljs.registerAliases(["docker"], { languageName: "dockerfile" });
  hljs.registerAliases(["toml", "conf", "cfg", "properties"], { languageName: "ini" });
  hljs.registerAliases(["cs"], { languageName: "csharp" });
  hljs.registerAliases(["c++", "h", "hpp", "cc"], { languageName: "cpp" });
  hljs.registerAliases(["objc", "m", "mm"], { languageName: "objectivec" });
  hljs.registerAliases(["text", "txt", "plain"], { languageName: "plaintext" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 规范化围栏语言标签；未知时返回 null（走纯文本转义） */
export function resolveHighlightLanguage(language: string | undefined): string | null {
  ensureLanguagesRegistered();
  const raw = language?.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const resolved = hljs.getLanguage(raw);
  return resolved ? raw : null;
}

/**
 * 高亮代码为 HTML（仅含 hljs 转义后的文本与 span）。
 * 未知语言返回转义纯文本。
 */
export function highlightAgentCode(code: string, language?: string): string {
  ensureLanguagesRegistered();
  const lang = resolveHighlightLanguage(language);
  if (!lang) {
    return escapeHtml(code);
  }
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}
