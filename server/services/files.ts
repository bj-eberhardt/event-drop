import path from "node:path";
import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import fs from "node:fs";
import archiver from "archiver";
import { DATA_ROOT_PATH } from "../config.js";
import { FILES_DIR_NAME, UPLOAD_DIR_NAME } from "../constants.js";
import { FileEntry, ListFilesResult, MoveUploadedFilesResult } from "../types.js";

export const filesDir = (rootEventFolder: string, folder?: string | null) =>
  path.join(DATA_ROOT_PATH, rootEventFolder, FILES_DIR_NAME, folder || "");

export const uploadDir = (rootEventFolder: string, folder?: string | null) =>
  path.join(DATA_ROOT_PATH, rootEventFolder, UPLOAD_DIR_NAME, folder || "");

export const listFiles = async (dir: string): Promise<ListFilesResult> => {
  let entries: FileEntry[] = [];
  const folders: string[] = [];

  try {
    const directoryContent = await readdir(dir, { withFileTypes: true });
    const fileNames: string[] = [];

    for (const d of directoryContent) {
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
      })
    );
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      entries = [];
    } else {
      throw error;
    }
  }

  return { files: entries, folders };
};

export const moveUploadedFiles = async (
  rootEventFolderName: string,
  folder: string,
  uploads: Express.Multer.File[]
): Promise<MoveUploadedFilesResult> => {
  if (!uploads.length) return { moved: 0 };
  const targetDir = filesDir(rootEventFolderName, folder);
  await mkdir(targetDir, { recursive: true });

  let moved = 0;
  for (const file of uploads) {
    const parsed = path.parse(file.originalname);
    let counter = 0;
    while (true) {
      const suffix = counter === 0 ? "" : `_${counter}`;
      const candidate = `${parsed.name}${suffix}${parsed.ext}`;
      const targetPath = path.join(targetDir, candidate);
      try {
        await copyFile(file.path, targetPath, fs.constants.COPYFILE_EXCL);
        await unlink(file.path);
        moved += 1;
        break;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err?.code === "EEXIST") {
          counter += 1;
          continue;
        }
        throw error;
      }
    }
  }

  return { moved };
};

export const createZipArchive = (dir: string) => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.directory(dir, false);
  return archive;
};

export const ensureFilesDir = (rootEventFolder: string) => {
  const target = filesDir(rootEventFolder);
  fs.mkdirSync(target, { recursive: true });
  return target;
};
export const ensureUploadsDir = (rootEventFolder: string) => {
  const target = uploadDir(rootEventFolder);
  fs.mkdirSync(target, { recursive: true });
  return target;
};
