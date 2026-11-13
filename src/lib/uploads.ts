// Pure, browser-safe rules for which research files can be uploaded and how they appear on the canvas.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export type UploadKind = "paper" | "dataset" | "code" | "note";
export type UploadedFile = { path: string; name: string; size: number; type: string };

const KINDS: Record<UploadKind, string[]> = {
  paper: ["pdf", "doc", "docx", "txt", "md", "tex", "rtf"],
  dataset: ["csv", "tsv", "json", "jsonl", "xlsx", "xls", "parquet"],
  code: ["py", "ipynb", "ts", "tsx", "js", "jsx", "r", "jl", "c", "cpp", "h", "java", "go", "rs", "sh", "yaml", "yml", "toml"],
  note: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
};
export const ACCEPTED_EXTENSIONS = Object.values(KINDS).flat();
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function kindForFile(name: string): UploadKind | null {
  const ext = extensionOf(name);
  for (const k of Object.keys(KINDS) as UploadKind[]) if (KINDS[k].includes(ext)) return k;
  return null;
}

/** Returns an error message for the person uploading, or null when the file is accepted. */
export function validateUpload(file: { name: string; size: number }): string | null {
  if (!kindForFile(file.name)) return `“${file.name}” isn't a supported file type.`;
  if (file.size <= 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `“${file.name}” is larger than 20 MB.`;
  return null;
}

/** Files live under the uploader's own folder, which is what the storage access rules check. */
export function storagePath(userId: string, workspaceId: string, id: string, name: string) {
  const safe = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-100) || "file";
  return `${userId}/${workspaceId}/${id}-${safe}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function uploadCard(file: UploadedFile) {
  const kind = kindForFile(file.name) ?? "paper";
  const title = file.name.replace(/\.[^.]+$/, "") || file.name;
  return {
    kind, title, file,
    meta: `${extensionOf(file.name).toUpperCase()} · ${formatBytes(file.size)} · uploaded`,
    tags: kind === "dataset" ? ["Datasets"] : kind === "note" ? ["Figure"] : [],
  };
}
