// Browser-safe persistence for the agent activity feed, kept per user and workspace.
import type { StorageLike } from "./offline-cache";

export type AgentLogEntry = {
  id: string; agent: string; text: string; time: string; at?: string; goal?: string; confidence?: number; steps?: string[];
  gate?: { type: "task"; task: string; target: string; state: string }
       | { type: "node"; proposal: { kind: string; title: string; summary: string; tags: string[] }; state: string };
};
export const AGENT_LOG_LIMIT = 200;
const key = (userId: string, workspaceId: string) => `glimpse:agentlog:${userId}:${workspaceId}`;

export function readAgentLog(s: StorageLike, userId: string, workspaceId: string): AgentLogEntry[] {
  try {
    const v = JSON.parse(s.getItem(key(userId, workspaceId)) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.text === "string") : [];
  } catch { return []; }
}
/** Feed is stored newest-first; only the newest entries are kept. */
export function writeAgentLog(s: StorageLike, userId: string, workspaceId: string, log: AgentLogEntry[]) {
  try { s.setItem(key(userId, workspaceId), JSON.stringify(log.slice(0, AGENT_LOG_LIMIT))); return true; } catch { return false; }
}
export const removeAgentLog = (s: StorageLike, userId: string, workspaceId: string) => s.removeItem(key(userId, workspaceId));
