export default {
  // 大批量暂存时 eslint --fix 易被 Task killed；格式化留在 pre-commit，ESLint 走 pnpm check / pre-push
  "*.{js,mjs,cjs,jsx,ts,tsx}": "prettier --write --ignore-unknown",
  "*.{css,json,jsonc,html,yml,yaml}": "prettier --write --ignore-unknown",
  "*.rs": () => "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check",
};
