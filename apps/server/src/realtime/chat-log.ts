import { randomUUID } from "node:crypto";
import { getJSON, setJSON } from "./store.js";

/**
 * Reportable record of an EPHEMERAL socket chat message.
 *
 * WHY THIS EXISTS
 *
 * In-match chat and private-room chat are relayed, never persisted — there is no
 * `Message` row and no id. That left them as the only two chat surfaces with no
 * way to report an individual message: `POST /reports` requires a `messageId`
 * that resolves to a real row (for DM and guild), and the two STRANGER-FACING
 * surfaces had nothing to cite.
 *
 * The tempting shortcut is to let the client send the offending text along with
 * the report. Don't: it makes the "evidence" a string the accuser typed, so a
 * moderator would be acting on an unverifiable claim, and anyone could fabricate
 * a quote to get someone banned. Guild reports already snapshot the excerpt
 * SERVER-side (reports.ts reads the Message row) — this gives the ephemeral
 * surfaces the same integrity.
 *
 * So each relayed message gets an id and a short-lived Redis record. A report
 * cites the id; the server looks it up and snapshots the text itself.
 *
 * `participants` is captured AT SEND TIME and is what authorises a report. It
 * has to be stored rather than recomputed, because by the time someone reports,
 * the match may have settled and the room may be gone — and we still need to
 * know who was entitled to see that message.
 */
export type ChatLogRecord = {
  scope: "match" | "room";
  /** matchId, or the room code. */
  scopeId: string;
  /** userId of the author — the only person who can be accused of it. */
  from: string;
  body: string;
  at: number;
  /** userIds entitled to report this message (everyone who could see it). */
  participants: string[];
};

/**
 * 48h. Deliberately longer than a match or room lives: people report after the
 * game, often after cooling off. Short enough that this stays a rolling buffer
 * rather than a chat archive we never agreed to keep — these surfaces are
 * documented as ephemeral, and the Data Safety form says so.
 */
const CHAT_LOG_TTL = 48 * 60 * 60;

const chatMsgKey = (id: string) => `rt:chatmsg:${id}`;

/**
 * Record one relayed message and return the id to broadcast with it.
 *
 * Best-effort: a Redis failure must NOT stop the message being delivered. Chat
 * working matters more than chat being reportable, so a failure here degrades to
 * "this one message can't be reported" rather than breaking the conversation.
 */
export async function recordChatMessage(rec: Omit<ChatLogRecord, "at"> & { at?: number }): Promise<string | null> {
  const id = `cm_${randomUUID()}`;
  try {
    await setJSON(chatMsgKey(id), { ...rec, at: rec.at ?? Date.now() } satisfies ChatLogRecord, CHAT_LOG_TTL);
    return id;
  } catch {
    return null;
  }
}

/** Look up a recorded message for report verification. Null once it expires. */
export async function getChatMessage(id: string): Promise<ChatLogRecord | null> {
  return getJSON<ChatLogRecord>(chatMsgKey(id));
}
