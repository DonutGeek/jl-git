export default {
  "*.{js,mjs,cjs,jsx,ts,tsx}": [
    "eslint --fix --max-warnings=0 --no-warn-ignored",
    "prettier --write --ignore-unknown",
  ],
  "*.{css,json,jsonc,html,yml,yaml}": "prettier --write --ignore-unknown",
  "*.rs": () => "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check",
};
