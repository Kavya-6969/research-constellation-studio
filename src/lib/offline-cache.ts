// Browser-safe local cache for workspaces. Pass any Storage-like object (localStorage in the app).
import type { TimelineEvent } from "./timeline";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export type CachedWorkspace = { id: string; nodes: unknown[]; edges: unknown[]; timeline: TimelineEvent[]; updatedAt: string; dirty: boolean };
export type CachedList = { id: string; name: string }[];

const PREFIX = "glimpse:ws:";
const listKey = (userId: string) => `glimpse:list:${userId}`;
const wsKey = (userId: string, id: string) => `${PREFIX}${userId}:${id}`;

function read<T>(storage: StorageLike, key: string): T | null {
  try { const raw = storage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(storage: StorageLike, key: string, value: unknown): boolean {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const readWorkspace = (s: StorageLike, userId: string, id: string) => read<CachedWorkspace>(s, wsKey(userId, id));
export const writeWorkspace = (s: StorageLike, userId: string, ws: CachedWorkspace) => write(s, wsKey(userId, ws.id), ws);
export const removeWorkspace = (s: StorageLike, userId: string, id: string) => s.removeItem(wsKey(userId, id));
export const readList = (s: StorageLike, userId: string) => read<CachedList>(s, listKey(userId)) ?? [];
export const writeList = (s: StorageLike, userId: string, list: CachedList) => write(s, listKey(userId), list);

/** Mark a cached workspace as synced, but only if nothing newer was written since `updatedAt`. */
export function markSynced(s: StorageLike, userId: string, id: string, updatedAt: string) {
  const ws = readWorkspace(s, userId, id);
  if (ws && ws.updatedAt === updatedAt) writeWorkspace(s, userId, { ...ws, dirty: false });
}

/** Every cached workspace for this user with local changes not yet saved to the cloud. */
export function listDirty(s: StorageLike, userId: string): CachedWorkspace[] {
  const out: CachedWorkspace[] = [];
  const prefix = `${PREFIX}${userId}:`;
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (!key?.startsWith(prefix)) continue;
    const ws = read<CachedWorkspace>(s, key);
    if (ws?.dirty) out.push(ws);
  }
  return out;
}
