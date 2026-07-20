import { create } from "zustand";

import { emptyResumeHelperIdentity } from "@/services/resume/resume.identity";
import type { AgentChatMessage } from "@/types/ai";
import type { ResumeHelperIdentity, ResumeProjectProfile } from "@/types/resumeHelper";

interface ResumeHelperState {
  profiles: ResumeProjectProfile[];
  profilesLoading: boolean;
  profilesError: string | null;
  messages: AgentChatMessage[];
  identity: ResumeHelperIdentity;
  identityReady: boolean;
  /** 来自设置 → Git 的公共账号，用于匹配提交 */
  gitAuthors: Array<{ name: string; email: string }>;
  setProfilesLoading: (loading: boolean) => void;
  setProfiles: (profiles: ResumeProjectProfile[], error?: string | null) => void;
  setIdentity: (identity: ResumeHelperIdentity) => void;
  patchIdentity: (patch: Partial<ResumeHelperIdentity>) => void;
  setGitAuthors: (authors: Array<{ name: string; email: string }>) => void;
  appendMessage: (message: AgentChatMessage) => void;
  updateMessage: (id: string, patch: Partial<AgentChatMessage>) => void;
  removeMessage: (id: string) => void;
  resetConversation: () => void;
}

export const useResumeHelperStore = create<ResumeHelperState>((set) => ({
  profiles: [],
  profilesLoading: false,
  profilesError: null,
  messages: [],
  identity: emptyResumeHelperIdentity(),
  identityReady: false,
  gitAuthors: [],

  setProfilesLoading(loading) {
    set({ profilesLoading: loading });
  },

  setProfiles(profiles, error = null) {
    set({ profiles, profilesError: error, profilesLoading: false });
  },

  setIdentity(identity) {
    set({ identity, identityReady: true });
  },

  patchIdentity(patch) {
    set((state) => ({
      identity: {
        displayName: patch.displayName?.trim() ?? state.identity.displayName,
        phone: patch.phone?.trim() ?? state.identity.phone,
        email: patch.email?.trim() ?? state.identity.email,
      },
    }));
  },

  setGitAuthors(authors) {
    set({ gitAuthors: authors });
  },

  appendMessage(message) {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  updateMessage(id, patch) {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    }));
  },

  removeMessage(id) {
    set((state) => ({
      messages: state.messages.filter((message) => message.id !== id),
    }));
  },

  resetConversation() {
    set({ messages: [] });
  },
}));
