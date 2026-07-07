import { create } from "zustand";
import { EV } from "@dama/shared";
import { api } from "../lib/api";
import { connectSocket, getSocket } from "../lib/socket";

/**
 * dmStore — Direct Messages between friends. REAL, PERSISTED chat.
 *
 * loadConversations() → GET /api/dm (the left-pane conversation list).
 * openThread(userId)  → GET /api/dm/:userId (messages + channelId, marks read).
 * send(userId, body)  → POST /api/dm/:userId then append the persisted message.
 * unreadTotal()       → GET /api/dm/unread-total (nav badge).
 *
 * LIVE: on first use we subscribe ONCE to the shared socket's EV.chatMessage.
 * When a DM lands for the currently-open channel we append it (de-duped by id);
 * either way we refresh the conversation list + unread total so previews and
 * badges stay live. Nothing here is fabricated — every line is a stored message.
 */

/** Wire shape from the server (chat-service.ts → WireMessage). */
export type DmMessage = {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
};

/** A friend I share a DM channel with (chat-service author select + presence). */
export type DmUser = {
  id: string;
  displayName: string;
  tag?: string;
  avatarUrl: string | null;
};

/** One row in the conversation list (GET /api/dm). */
export type DmConversation = {
  channelId: string;
  user: DmUser;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
};

type DmStore = {
  conversations: DmConversation[];
  unread: number;
  /** the currently-open thread (right pane), or null */
  openUserId: string | null;
  openChannelId: string | null;
  openUser: DmUser | null;
  messages: DmMessage[];

  loadingList: boolean;
  loadingThread: boolean;
  sending: boolean;
  error: string | null;

  loadConversations: () => Promise<void>;
  openThread: (userId: string) => Promise<void>;
  closeThread: () => void;
  send: (userId: string, body: string) => Promise<void>;
  unreadTotal: () => Promise<number>;
  clearError: () => void;
};

/** Wire payload the server relays for a live DM (dm.ts). */
type ChatMessageEvent = {
  channelId: string;
  message: DmMessage;
  kind?: string;
  from?: string;
};

let subscribed = false;

export const useDmStore = create<DmStore>((set, get) => {
  // Subscribe ONCE (lazily on first store use) to live inbound DMs. The socket is
  // shared with online play + presence, so we only attach our own listener and
  // never removeAllListeners.
  const ensureSubscribed = () => {
    if (subscribed) return;
    subscribed = true;

    const onChatMessage = (p: ChatMessageEvent) => {
      if (!p || p.kind !== "dm" || !p.message) return;
      // Append to the open thread if it matches, de-duping by message id.
      if (p.channelId && p.channelId === get().openChannelId) {
        set((s) =>
          s.messages.some((m) => m.id === p.message.id)
            ? s
            : { messages: [...s.messages, p.message] },
        );
        // We're viewing this thread → mark it read so the badge doesn't climb.
        api
          .post(`/api/dm-channel/${p.channelId}/read`, {})
          .catch(() => {});
      }
      // Always refresh previews + unread badge (best-effort).
      void get().loadConversations();
      void get().unreadTotal();
    };

    connectSocket()
      .then((s) => {
        s.off(EV.chatMessage, onChatMessage);
        s.on(EV.chatMessage, onChatMessage);
      })
      .catch(() => {
        // live updates unavailable; REST load/send still work. Retry attach on
        // the raw socket in case it connects later.
        const s = getSocket();
        s.off(EV.chatMessage, onChatMessage);
        s.on(EV.chatMessage, onChatMessage);
      });
  };

  return {
    conversations: [],
    unread: 0,
    openUserId: null,
    openChannelId: null,
    openUser: null,
    messages: [],
    loadingList: false,
    loadingThread: false,
    sending: false,
    error: null,

    loadConversations: async () => {
      ensureSubscribed();
      set({ loadingList: true });
      try {
        const { conversations } = await api.get<{ conversations: DmConversation[] }>("/api/dm");
        set({ conversations });
      } catch {
        // leave prior list in place; surface nothing loud for a background refresh
      } finally {
        set({ loadingList: false });
      }
    },

    openThread: async (userId: string) => {
      ensureSubscribed();
      set({
        loadingThread: true,
        error: null,
        openUserId: userId,
        // reset thread state so we never flash a previous friend's messages
        openChannelId: null,
        openUser: null,
        messages: [],
      });
      try {
        const { channelId, user, messages } = await api.get<{
          channelId: string;
          user: DmUser;
          messages: DmMessage[];
        }>(`/api/dm/${userId}`);
        // Ignore if the user navigated to a different thread mid-flight.
        if (get().openUserId !== userId) return;
        set({ openChannelId: channelId, openUser: user, messages });
        // Opening marks read server-side → refresh unread + previews.
        void get().unreadTotal();
        void get().loadConversations();
      } catch (e) {
        if (get().openUserId !== userId) return;
        const code = (e as { code?: string })?.code;
        const message =
          code === "NOT_FRIENDS"
            ? "You can only message friends. Add them first."
            : "Couldn't open this conversation.";
        set({ error: message });
      } finally {
        if (get().openUserId === userId) set({ loadingThread: false });
      }
    },

    closeThread: () => {
      set({ openUserId: null, openChannelId: null, openUser: null, messages: [], error: null });
    },

    send: async (userId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed || get().sending) return;
      set({ sending: true, error: null });
      try {
        const { message } = await api.post<{ message: DmMessage }>(`/api/dm/${userId}`, {
          body: trimmed,
        });
        // Append our sent message if this thread is still open (de-dupe by id).
        if (get().openUserId === userId) {
          set((s) =>
            s.messages.some((m) => m.id === message.id)
              ? s
              : { messages: [...s.messages, message] },
          );
        }
        void get().loadConversations();
      } catch (e) {
        const code = (e as { code?: string })?.code;
        set({
          error:
            code === "NOT_FRIENDS"
              ? "You can only message friends."
              : "Message failed to send.",
        });
      } finally {
        set({ sending: false });
      }
    },

    unreadTotal: async () => {
      try {
        const { total } = await api.get<{ total: number }>("/api/dm/unread-total");
        set({ unread: total });
        return total;
      } catch {
        return get().unread;
      }
    },

    clearError: () => set({ error: null }),
  };
});
