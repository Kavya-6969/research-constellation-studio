import { describe, expect, it } from "vitest";
import { listDirty, markSynced, readList, readWorkspace, writeList, writeWorkspace, type StorageLike } from "./offline-cache";

function memory(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
}
const ws = (id: string, dirty: boolean, updatedAt = "a") => ({ id, nodes: [{ id: "n" }], edges: [], timeline: [], updatedAt, dirty });

describe("offline cache", () => {
  it("keeps offline edits as pending until synced", () => {
    const s = memory();
    writeWorkspace(s, "u1", ws("w1", true));
    writeWorkspace(s, "u1", ws("w2", false));
    expect(listDirty(s, "u1").map((w) => w.id)).toEqual(["w1"]);
    markSynced(s, "u1", "w1", "a");
    expect(listDirty(s, "u1")).toEqual([]);
  });
  it("does not clear pending state when a newer local edit happened during sync", () => {
    const s = memory();
    writeWorkspace(s, "u1", ws("w1", true, "new"));
    markSynced(s, "u1", "w1", "old");
    expect(readWorkspace(s, "u1", "w1")?.dirty).toBe(true);
  });
  it("separates cached data between users", () => {
    const s = memory();
    writeWorkspace(s, "u1", ws("w1", true));
    writeList(s, "u1", [{ id: "w1", name: "Mine" }]);
    expect(listDirty(s, "u2")).toEqual([]);
    expect(readList(s, "u2")).toEqual([]);
    expect(readWorkspace(s, "u2", "w1")).toBeNull();
  });
});
