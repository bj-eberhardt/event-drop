import { isFolderNameValid } from "./folderValidation";

type UploadPresetV1 = {
  v: 1;
  f: string;
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  const hasBuffer = typeof Buffer !== "undefined";
  const base64 = hasBuffer
    ? Buffer.from(bytes).toString("base64")
    : btoa(String.fromCharCode(...Array.from(bytes)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (token: string): Uint8Array | null => {
  if (!token) return null;
  const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(padLen)}`;

  try {
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(padded, "base64"));
    }
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};

export const encodeUploadPreset = (args: { folder: string }): string => {
  const folder = args.folder.trim();
  const payload: UploadPresetV1 = { v: 1, f: folder };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return encodeBase64Url(bytes);
};

export const decodeUploadPreset = (token: string): { folder: string } | null => {
  const bytes = decodeBase64Url(token);
  if (!bytes) return null;

  try {
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<UploadPresetV1> | null;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.f !== "string") return null;
    const folder = parsed.f.trim();
    if (folder.length === 0 || folder.length > 32) return null;
    if (!isFolderNameValid(folder)) return null;
    return { folder };
  } catch {
    return null;
  }
};
