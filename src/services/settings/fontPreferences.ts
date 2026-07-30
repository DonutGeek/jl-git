import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_FILE = "ui-settings.json";
const CLIENT_FONT_KEY = "clientFont";
const EDITOR_FONT_KEY = "editorFont";

export interface FontPreferences {
  clientFont: string | null;
  editorFont: string | null;
}

const store = new LazyStore(STORE_FILE);

export async function getFontPreferences(): Promise<FontPreferences> {
  const [clientFont, editorFont] = await Promise.all([
    store.get<unknown>(CLIENT_FONT_KEY),
    store.get<unknown>(EDITOR_FONT_KEY),
  ]);
  return {
    clientFont: typeof clientFont === "string" ? clientFont : null,
    editorFont: typeof editorFont === "string" ? editorFont : null,
  };
}

export async function setFontPreferences(preferences: {
  clientFont: string;
  editorFont: string;
}): Promise<void> {
  await Promise.all([
    store.set(CLIENT_FONT_KEY, preferences.clientFont),
    store.set(EDITOR_FONT_KEY, preferences.editorFont),
  ]);
  await store.save();
}
