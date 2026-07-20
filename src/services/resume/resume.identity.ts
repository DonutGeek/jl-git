import { LazyStore } from "@tauri-apps/plugin-store";

import type { ResumeHelperIdentity } from "@/types/resumeHelper";
import { isRecord } from "@/types/error";

const STORE_FILE = "resume-helper.json";
const IDENTITY_KEY = "identity";

const EMPTY_IDENTITY: ResumeHelperIdentity = {
  displayName: "",
  phone: "",
  email: "",
};

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

/** 读取简历帮联系信息（Git 账号见 settings → Git）。 */
export async function getResumeHelperIdentity(): Promise<ResumeHelperIdentity> {
  const store = await getStore();
  const saved = await store.get<unknown>(IDENTITY_KEY);
  return normalizeIdentity(saved);
}

/** 保存简历帮联系信息。 */
export async function setResumeHelperIdentity(
  identity: ResumeHelperIdentity,
): Promise<ResumeHelperIdentity> {
  const next = normalizeIdentity(identity);
  const store = await getStore();
  // 保留文件中可能存在的旧 gitAuthors 字段以外的数据时，整表覆盖为联系信息即可
  await store.set(IDENTITY_KEY, next);
  await store.save();
  return next;
}

export function emptyResumeHelperIdentity(): ResumeHelperIdentity {
  return { ...EMPTY_IDENTITY };
}

function normalizeIdentity(value: unknown): ResumeHelperIdentity {
  if (!isRecord(value)) {
    return { ...EMPTY_IDENTITY };
  }
  return {
    displayName: readString(value.displayName),
    phone: readString(value.phone),
    email: readString(value.email),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
