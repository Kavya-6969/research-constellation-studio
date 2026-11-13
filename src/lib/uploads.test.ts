import { describe, expect, it } from "vitest";
import { kindForFile, storagePath, uploadCard, validateUpload, MAX_UPLOAD_BYTES } from "./uploads";

describe("uploads", () => {
  it("maps research files to the right card type", () => {
    expect(kindForFile("Attention.PDF")).toBe("paper");
    expect(kindForFile("glue.csv")).toBe("dataset");
    expect(kindForFile("train.py")).toBe("code");
    expect(kindForFile("figure.png")).toBe("note");
    expect(kindForFile("setup.exe")).toBeNull();
  });
  it("accepts files up to 20 MB and rejects larger, empty or unsupported ones", () => {
    expect(validateUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(validateUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 })).toContain("20 MB");
    expect(validateUpload({ name: "a.pdf", size: 0 })).toContain("empty");
    expect(validateUpload({ name: "a.exe", size: 10 })).toContain("supported");
  });
  it("stores files inside the uploader's own folder with a safe name", () => {
    expect(storagePath("user-1", "ws-1", "abc", "My Paper (v2).pdf")).toBe("user-1/ws-1/abc-My-Paper-v2-.pdf");
    expect(storagePath("user-1", "ws-1", "abc", "../../etc").startsWith("user-1/ws-1/abc-")).toBe(true);
  });
  it("builds a card that links to the stored file", () => {
    const card = uploadCard({ path: "u/w/x-glue.csv", name: "glue.csv", size: 2048, type: "text/csv" });
    expect(card).toMatchObject({ kind: "dataset", title: "glue", meta: "CSV · 2.0 KB · uploaded", file: { path: "u/w/x-glue.csv" } });
  });
});
