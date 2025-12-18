import path from "node:path";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import fs from "node:fs";
import archiver from "archiver";
import { DATA_ROOT_PATH } from "../config.js";
import { FILES_DIR_NAME } from "../constants.js";
import { FileEntry, ListFilesResult, MoveUploadedFilesResult } from "../types.js";

export const filesDir = (subdomain: string, folder?: string | null) =>
  path.join(DATA_ROOT_PATH, subdomain, FILES_DIR_NAME, folder || "");

export const listFiles = async (dir: string): Promise<ListFilesResult> => {
  let entries: FileEntry[] = [];
  let folders: string[] = [];

  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    const fileNames: string[] = [];

    for (const d of dirents) {
      if (d.isDirectory()) {
        folders.push(d.name);
      } else if (d.isFile()) {
        fileNames.push(d.name);
      }
    }

    entries = await Promise.all(
      fileNames.map(async (name) => {
        const s = await stat(path.join(dir, name));
        return { name, size: s.size, createdAt: s.mtime.toISOString() };
      }),
    );
  } catch (error: any) {
    if (error.code === "ENOENT") {
      entries = [];
    } else {
      throw error;
    }
  }

  return { files: entries, folders };
};

export const moveUploadedFiles = async (
  subdomain: string,
  folder: string | null,
  uploads: Express.Multer.File[],
  findUniqueName: (dir: string, originalName: string) => string,
): Promise<MoveUploadedFilesResult> => {
  if (!uploads.length || !folder) return { moved: 0 };

  const targetDir = filesDir(subdomain, folder);
  await mkdir(targetDir, { recursive: true });

  let moved = 0;
  for (const file of uploads) {
    const unique = findUniqueName(targetDir, file.filename);
    await rename(file.path, path.join(targetDir, unique));
    moved += 1;
  }

  return { moved };
};

export const createZipArchive = (dir: string) => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.directory(dir, false);
  return archive;
};

export const ensureFilesDir = (subdomain: string) => {
  const target = filesDir(subdomain);
  fs.mkdirSync(target, { recursive: true });
  return target;
};


