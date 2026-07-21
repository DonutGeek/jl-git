/**
 * 从 package.json 提取主要技术栈，并按该 Git 用户改动证据过滤「实际用过」的项。
 */

export interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface TechRule {
  /** 简历展示名 */
  label: string;
  /** 匹配的 npm 包名（小写） */
  packages: readonly string[];
  /** 路径线索 */
  pathHints: readonly RegExp[];
  /** 代码/提交文案线索 */
  contentHints: readonly RegExp[];
  /** 排序权重，越大越靠前 */
  weight: number;
}

/** 有简历技术含量的栈规则（不含 eslint/prettier/lodash 等杂项） */
const TECH_RULES: readonly TechRule[] = [
  {
    label: "Vue 3",
    packages: ["vue"],
    pathHints: [/\.vue$/i],
    contentHints: [/from\s+['"]vue['"]/, /createApp\s*\(/, /<script\s+setup/i],
    weight: 100,
  },
  {
    label: "Vue 2",
    packages: ["vue"],
    pathHints: [/\.vue$/i],
    contentHints: [/Vue\.extend\s*\(/, /new\s+Vue\s*\(/, /vue-template-compiler/],
    weight: 100,
  },
  {
    label: "React",
    packages: ["react", "react-dom"],
    pathHints: [/\.jsx$/i, /\.tsx$/i],
    contentHints: [/from\s+['"]react['"]/, /React\.(createElement|FC|memo)/],
    weight: 100,
  },
  {
    label: "Next.js",
    packages: ["next"],
    pathHints: [/next\.config\./i, /(^|\/)app\//i, /(^|\/)pages\//i],
    contentHints: [/from\s+['"]next\//],
    weight: 95,
  },
  {
    label: "Nuxt",
    packages: ["nuxt", "nuxt3"],
    pathHints: [/nuxt\.config\./i],
    contentHints: [/from\s+['"]#app['"]/, /defineNuxt/],
    weight: 95,
  },
  {
    label: "TypeScript",
    packages: ["typescript"],
    pathHints: [/\.tsx?$/i],
    contentHints: [/:\s*(string|number|boolean|interface|type)\b/],
    weight: 90,
  },
  {
    label: "Vuex",
    packages: ["vuex"],
    pathHints: [/store\//i, /vuex/i],
    contentHints: [/from\s+['"]vuex['"]/, /map(State|Getters|Actions|Mutations)/],
    weight: 80,
  },
  {
    label: "Pinia",
    packages: ["pinia"],
    pathHints: [/stores?\//i, /pinia/i],
    contentHints: [/from\s+['"]pinia['"]/, /defineStore\s*\(/],
    weight: 80,
  },
  {
    label: "Redux",
    packages: ["redux", "@reduxjs/toolkit", "react-redux"],
    pathHints: [/redux/i, /store\//i],
    contentHints: [/createSlice\s*\(/, /use(Selector|Dispatch)\s*\(/],
    weight: 80,
  },
  {
    label: "Vue Router",
    packages: ["vue-router"],
    pathHints: [/router\//i, /routes?\./i],
    contentHints: [/from\s+['"]vue-router['"]/, /createRouter\s*\(/],
    weight: 75,
  },
  {
    label: "React Router",
    packages: ["react-router", "react-router-dom"],
    pathHints: [/router\//i, /routes?\./i],
    contentHints: [/from\s+['"]react-router/, /BrowserRouter|Routes|useNavigate/],
    weight: 75,
  },
  {
    label: "Vant",
    packages: ["vant"],
    pathHints: [/vant/i],
    contentHints: [/from\s+['"]vant['"]/, /van-[a-z]/i],
    weight: 70,
  },
  {
    label: "Element UI",
    packages: ["element-ui"],
    pathHints: [/element-ui/i],
    contentHints: [/from\s+['"]element-ui['"]/, /el-[a-z]/i],
    weight: 70,
  },
  {
    label: "Element Plus",
    packages: ["element-plus"],
    pathHints: [/element-plus/i],
    contentHints: [/from\s+['"]element-plus['"]/, /el-[a-z]/i],
    weight: 70,
  },
  {
    label: "Ant Design",
    packages: ["antd", "@ant-design/icons"],
    pathHints: [/antd/i],
    contentHints: [/from\s+['"]antd['"]/],
    weight: 70,
  },
  {
    label: "Ant Design Vue",
    packages: ["ant-design-vue"],
    pathHints: [/ant-design-vue/i],
    contentHints: [/from\s+['"]ant-design-vue['"]/],
    weight: 70,
  },
  {
    label: "Webpack",
    packages: ["webpack", "webpack-dev-server", "webpack-cli"],
    pathHints: [/webpack\.config\./i, /phoenix\.config\./i],
    contentHints: [/webpack|svg-sprite-loader|url-loader/i],
    weight: 85,
  },
  {
    label: "Vite",
    packages: ["vite", "@vitejs/plugin-vue", "@vitejs/plugin-react"],
    pathHints: [/vite\.config\./i],
    contentHints: [/from\s+['"]vite['"]/, /defineConfig\s*\(/],
    weight: 85,
  },
  {
    label: "Rollup",
    packages: ["rollup"],
    pathHints: [/rollup\.config\./i],
    contentHints: [/from\s+['"]rollup['"]/],
    weight: 70,
  },
  {
    label: "Sass",
    packages: ["sass", "node-sass", "sass-loader"],
    pathHints: [/\.s[ac]ss$/i],
    contentHints: [/@use\s+|@import\s+['"].+\.s[ac]ss/],
    weight: 50,
  },
  {
    label: "Less",
    packages: ["less", "less-loader"],
    pathHints: [/\.less$/i],
    contentHints: [],
    weight: 50,
  },
  {
    label: "Tailwind CSS",
    packages: ["tailwindcss"],
    pathHints: [/tailwind\.config\./i],
    contentHints: [/@tailwind|@apply\b/],
    weight: 65,
  },
  {
    label: "Axios",
    packages: ["axios"],
    pathHints: [/api\//i, /request\./i, /http\./i],
    contentHints: [/from\s+['"]axios['"]/, /axios\.(get|post|put|delete|create)/],
    weight: 60,
  },
  {
    label: "ECharts",
    packages: ["echarts", "vue-echarts"],
    pathHints: [/echarts/i],
    contentHints: [/from\s+['"]echarts['"]/, /echarts\.init/],
    weight: 60,
  },
  {
    label: "Three.js",
    packages: ["three"],
    pathHints: [],
    contentHints: [/from\s+['"]three['"]/],
    weight: 70,
  },
  {
    label: "Socket.IO",
    packages: ["socket.io-client", "socket.io"],
    pathHints: [],
    contentHints: [/from\s+['"]socket\.io/],
    weight: 60,
  },
  {
    label: "GraphQL",
    packages: ["graphql", "@apollo/client", "apollo-client"],
    pathHints: [/\.graphql$/i, /\.gql$/i],
    contentHints: [/gql`|useQuery\s*\(|ApolloClient/],
    weight: 70,
  },
  {
    label: "Jest",
    packages: ["jest", "@types/jest"],
    pathHints: [/\.test\.[jt]sx?$/i, /\.spec\.[jt]sx?$/i, /__tests__\//i],
    contentHints: [/describe\s*\(|it\s*\(|expect\s*\(/],
    weight: 55,
  },
  {
    label: "Vitest",
    packages: ["vitest"],
    pathHints: [/\.test\.[jt]sx?$/i, /\.spec\.[jt]sx?$/i],
    contentHints: [/from\s+['"]vitest['"]/],
    weight: 55,
  },
  {
    label: "Playwright",
    packages: ["@playwright/test", "playwright"],
    pathHints: [/playwright/i, /e2e\//i],
    contentHints: [/from\s+['"]@playwright\/test['"]/],
    weight: 55,
  },
  {
    label: "Electron",
    packages: ["electron"],
    pathHints: [/electron/i],
    contentHints: [/from\s+['"]electron['"]/],
    weight: 85,
  },
  {
    label: "Tauri",
    packages: ["@tauri-apps/api", "@tauri-apps/cli"],
    pathHints: [/tauri\.conf\./i, /src-tauri\//i],
    contentHints: [/from\s+['"]@tauri-apps\//],
    weight: 85,
  },
  {
    label: "svg-sprite-loader",
    packages: ["svg-sprite-loader"],
    pathHints: [/svg/i, /icons?\//i],
    contentHints: [/svg-sprite-loader|symbolId/i],
    weight: 45,
  },
];

/** 明确忽略的依赖前缀/包（无简历技术栈价值） */
const SKIP_PACKAGE_PATTERN =
  /^(?:eslint|prettier|husky|lint-staged|core-js|regenerator-runtime|@types\/|babel-plugin-|@babel\/|postcss-loader|css-loader|style-loader|file-loader|url-loader|html-webpack-plugin|mini-css-extract-plugin|terser-webpack-plugin|optimize-css-assets|compression-webpack-plugin|copy-webpack-plugin|friendly-errors|portfinder|chalk|ora|rimraf|cross-env|npm-run-all|concurrently|nodemon|@vue\/cli-|vue-cli-service|webpack-merge|webpack-bundle-analyzer|cache-loader|thread-loader|vue-loader|vue-style-loader|vue-template-compiler)$/i;

const MAX_TECH_STACK = 8;

/** 解析 package.json 文本 → 主要技术栈候选（尚未按作者使用过滤） */
export function extractTechFromPackageJson(
  raw: string,
  options?: { preferVue2?: boolean },
): string[] {
  let pkg: PackageJsonLike;
  try {
    pkg = JSON.parse(raw) as PackageJsonLike;
  } catch {
    return [];
  }

  const versions = new Map<string, string>();
  for (const group of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (!group) continue;
    for (const [name, version] of Object.entries(group)) {
      const key = name.trim().toLowerCase();
      if (!key || SKIP_PACKAGE_PATTERN.test(key)) continue;
      versions.set(key, String(version));
    }
  }

  if (versions.size === 0) {
    return [];
  }

  const vueVersion = versions.get("vue") ?? "";
  const isVue2 =
    options?.preferVue2 === true ||
    /^[\^~]?2\./.test(vueVersion.trim()) ||
    versions.has("vue-template-compiler");
  const isVue3 =
    !isVue2 &&
    (/^[\^~]?3\./.test(vueVersion.trim()) ||
      versions.has("@vitejs/plugin-vue") ||
      (versions.has("vue") && !versions.has("vue-template-compiler")));

  const matched = new Map<string, number>();

  for (const rule of TECH_RULES) {
    if (rule.label === "Vue 2" && !isVue2 && versions.has("vue")) continue;
    if (rule.label === "Vue 3" && !isVue3 && versions.has("vue")) continue;
    if (rule.label.startsWith("Vue") && !versions.has("vue")) continue;

    const hit = rule.packages.some((pkgName) => versions.has(pkgName.toLowerCase()));
    if (!hit) continue;
    // Vue 2/3 互斥
    if (rule.label === "Vue 2" && isVue3) continue;
    if (rule.label === "Vue 3" && isVue2) continue;
    matched.set(rule.label, Math.max(matched.get(rule.label) ?? 0, rule.weight));
  }

  // 未命中规则但出现在依赖里的「主框架感」包：仅保留少量知名栈
  const EXTRA_LABELS: Record<string, { label: string; weight: number }> = {
    jquery: { label: "jQuery", weight: 40 },
    express: { label: "Express", weight: 70 },
    koa: { label: "Koa", weight: 70 },
    nestjs: { label: "NestJS", weight: 75 },
    "@nestjs/core": { label: "NestJS", weight: 75 },
    svelte: { label: "Svelte", weight: 90 },
    "solid-js": { label: "Solid", weight: 90 },
  };
  for (const [pkgName, meta] of Object.entries(EXTRA_LABELS)) {
    if (versions.has(pkgName) && !matched.has(meta.label)) {
      matched.set(meta.label, meta.weight);
    }
  }

  return [...matched.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label)
    .slice(0, MAX_TECH_STACK);
}

export interface TechUsageEvidence {
  paths: readonly string[];
  texts: readonly string[];
  subjects: readonly string[];
}

/**
 * 在 package.json 候选中，只保留有使用证据（路径/代码/提交说明）的技术栈。
 * 若完全无证据可匹配，回退为候选中权重最高的若干主栈（避免空技术栈）。
 */
export function filterTechByAuthorUsage(
  packageTech: readonly string[],
  evidence: TechUsageEvidence,
): string[] {
  if (packageTech.length === 0) {
    return inferTechFromUsageOnly(evidence);
  }

  const haystack = [
    ...evidence.paths,
    ...evidence.texts,
    ...evidence.subjects,
  ].join("\n");

  const used: string[] = [];
  for (const label of packageTech) {
    const rule = TECH_RULES.find((item) => item.label === label);
    if (!rule) {
      // 扩展标签：有路径/文案命中包名片段则保留
      const token = label.toLowerCase().replace(/\s+/g, "");
      if (token && haystack.toLowerCase().includes(token)) {
        used.push(label);
      }
      continue;
    }
    if (ruleIndicatesUsage(rule, evidence, haystack)) {
      used.push(label);
    }
  }

  if (used.length > 0) {
    return used.slice(0, MAX_TECH_STACK);
  }

  // 无细粒度命中时：保留框架/语言/构建类主栈（仍来自 package.json）
  const fallbackKeep = new Set([
    "Vue 2",
    "Vue 3",
    "React",
    "Next.js",
    "Nuxt",
    "TypeScript",
    "Webpack",
    "Vite",
    "Electron",
    "Tauri",
  ]);
  return packageTech.filter((label) => fallbackKeep.has(label)).slice(0, MAX_TECH_STACK);
}

function ruleIndicatesUsage(
  rule: TechRule,
  evidence: TechUsageEvidence,
  haystack: string,
): boolean {
  if (evidence.paths.some((path) => rule.pathHints.some((re) => re.test(path)))) {
    return true;
  }
  if (rule.contentHints.some((re) => re.test(haystack))) {
    return true;
  }
  // 包名出现在路径或 diff 中
  return rule.packages.some((pkgName) => {
    const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i").test(haystack);
  });
}

/** 无 package.json 时，仅从改动证据推断少量技术栈 */
function inferTechFromUsageOnly(evidence: TechUsageEvidence): string[] {
  const haystack = [
    ...evidence.paths,
    ...evidence.texts,
    ...evidence.subjects,
  ].join("\n");
  const hit = new Map<string, number>();
  for (const rule of TECH_RULES) {
    if (rule.label === "Vue 2" || rule.label === "Vue 3") {
      // 仅路径 .vue 时标为 Vue（版本未知用 Vue）
      if (evidence.paths.some((path) => /\.vue$/i.test(path))) {
        hit.set("Vue", 100);
      }
      continue;
    }
    if (ruleIndicatesUsage(rule, evidence, haystack)) {
      hit.set(rule.label, rule.weight);
    }
  }
  return [...hit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, MAX_TECH_STACK);
}

/** 合并多个 package.json 解析结果（按首次出现顺序 + 权重去重） */
export function mergePackageTech(lists: readonly (readonly string[])[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const label of list) {
      if (seen.has(label)) continue;
      // Vue 2/3 冲突时保留先出现的
      if (label === "Vue 2" && seen.has("Vue 3")) continue;
      if (label === "Vue 3" && seen.has("Vue 2")) continue;
      seen.add(label);
      order.push(label);
    }
  }
  return order.slice(0, MAX_TECH_STACK);
}
