import path from "node:path";
import fs from "node:fs";
import { copyFile, mkdir, readdir, stat, unlink, readFile } from "node:fs/promises";
import archiver from "archiver";
import { DATA_ROOT_PATH } from "../../config.js";
import { FILES_DIR_NAME } from "../../constants.js";
import {
  DeleteFileResult,
  FileEntry,
  ListFilesResult,
  MoveUploadedFilesResult,
} from "../../types.js";
import { createStorageError, fail, ok, FileStore, StorageResult } from "../types.js";

const filesDir = (eventId: string, folder?: string | null) =>
  path.join(DATA_ROOT_PATH, eventId, FILES_DIR_NAME, folder || "");

const resolveFilePath = (eventId: string, folder: string, filename: string) =>
  path.resolve(DATA_ROOT_PATH, eventId, FILES_DIR_NAME, folder || "", filename);

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  Boolean(error) && typeof error === "object" && "code" in (error as NodeJS.ErrnoException);

const fileNotFound = (): StorageResult<never> =>
  fail(
    createStorageError({
      message: "File not found.",
      errorKey: "FILE_NOT_FOUND",
      property: "filename",
    })
  );

const statFile = async (filePath: string): Promise<StorageResult<fs.Stats>> => {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return fileNotFound();
    return ok(stats);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") return fileNotFound();
    throw error;
  }
};

export const createFsFileStore = (): FileStore => {
  const listFiles = async (
    eventId: string,
    folder?: string | null
  ): Promise<StorageResult<ListFilesResult>> => {
    let entries: FileEntry[] = [];
    const folders: string[] = [];
    const dir = filesDir(eventId, folder);

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

    return ok({ files: entries, folders });
  };

  const moveUploadedFiles = async (
    eventId: string,
    folder: string,
    uploads: Express.Multer.File[]
  ): Promise<StorageResult<MoveUploadedFilesResult>> => {
    if (!uploads.length) return ok({ moved: 0 });
    const targetDir = filesDir(eventId, folder);
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

    return ok({ moved });
  };

  const getFileStream = async (
    eventId: string,
    folder: string,
    filename: string
  ): Promise<StorageResult<{ stream: fs.ReadStream; size: number; lastModified: Date }>> => {
    const filePath = resolveFilePath(eventId, folder, filename);
    const statsResult = await statFile(filePath);
    if (!statsResult.ok) return statsResult;
    return ok({
      stream: fs.createReadStream(filePath),
      size: statsResult.data.size,
      lastModified: statsResult.data.mtime,
    });
  };

  const getFileBuffer = async (
    eventId: string,
    folder: string,
    filename: string
  ): Promise<StorageResult<{ buffer: Buffer; size: number; lastModified: Date }>> => {
    const filePath = resolveFilePath(eventId, folder, filename);
    const statsResult = await statFile(filePath);
    if (!statsResult.ok) return statsResult;
    const buffer = await readFile(filePath);
    return ok({ buffer, size: statsResult.data.size, lastModified: statsResult.data.mtime });
  };

  const deleteFile = async (
    eventId: string,
    folder: string,
    filename: string
  ): Promise<StorageResult<DeleteFileResult>> => {
    const filePath = resolveFilePath(eventId, folder, filename);
    const statsResult = await statFile(filePath);
    if (!statsResult.ok) return statsResult;
    await unlink(filePath);
    return ok({ ok: true, message: "File deleted." });
  };

  const createZipStream = async (
    eventId: string,
    folder?: string | null
  ): Promise<StorageResult<{ stream: archiver.Archiver }>> => {
    const dir = filesDir(eventId, folder);
    if (!fs.existsSync(dir)) {
      return fail(
        createStorageError({
          message: "No files available.",
          errorKey: "NO_FILES_AVAILABLE",
          property: "folder",
        })
      );
    }
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.directory(dir, false);
    return ok({ stream: archive });
  };

  const ensureFilesDir = (eventId: string) => {
    const target = filesDir(eventId);
    fs.mkdirSync(target, { recursive: true });
    return target;
  };

  return {
    listFiles,
    moveUploadedFiles,
    getFileStream,
    getFileBuffer,
    deleteFile,
    createZipStream,
    ensureFilesDir,
  };
};
