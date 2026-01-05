import type { Readable } from "node:stream";
import type { Buffer } from "node:buffer";
import type { Archiver } from "archiver";
import type {
  DeleteFileResult,
  ErrorAdditionalParams,
  ErrorKey,
  ErrorResponse,
  EventConfig,
  ListFilesResult,
  MoveUploadedFilesResult,
} from "../types.js";

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse };

export const createStorageError = (params: {
  message: string;
  errorKey: ErrorKey;
  property?: string;
  additionalParams?: ErrorAdditionalParams;
  secured?: boolean;
  eventId?: string;
}): ErrorResponse => ({
  message: params.message,
  errorKey: params.errorKey,
  property: params.property,
  additionalParams: params.additionalParams ?? {},
  secured: params.secured,
  eventId: params.eventId,
});

export const ok = <T>(data: T): StorageResult<T> => ({ ok: true, data });

export const fail = (error: ErrorResponse): StorageResult<never> => ({ ok: false, error });

export type FileStreamData = {
  stream: Readable;
  size: number;
  lastModified: Date;
};

export type FileBufferData = {
  buffer: Buffer;
  size: number;
  lastModified: Date;
};

export type ZipStreamData = {
  stream: Archiver;
};

export interface EventStore {
  ensureBaseDir(): Promise<void>;
  isEventIdAvailable(eventId: string): Promise<StorageResult<boolean>>;
  getEvent(eventId: string): Promise<StorageResult<EventConfig>>;
  saveEvent(project: EventConfig): Promise<StorageResult<EventConfig>>;
  createEvent(project: EventConfig): Promise<StorageResult<EventConfig>>;
  deleteEvent(eventId: string): Promise<StorageResult<void>>;
}

export interface FileStore {
  listFiles(eventId: string, folder?: string | null): Promise<StorageResult<ListFilesResult>>;
  moveUploadedFiles(
    eventId: string,
    folder: string,
    uploads: Express.Multer.File[]
  ): Promise<StorageResult<MoveUploadedFilesResult>>;
  getFileStream(
    eventId: string,
    folder: string,
    filename: string
  ): Promise<StorageResult<FileStreamData>>;
  getFileBuffer(
    eventId: string,
    folder: string,
    filename: string
  ): Promise<StorageResult<FileBufferData>>;
  deleteFile(
    eventId: string,
    folder: string,
    filename: string
  ): Promise<StorageResult<DeleteFileResult>>;
  createZipStream(eventId: string, folder?: string | null): Promise<StorageResult<ZipStreamData>>;
  ensureFilesDir(eventId: string): string;
}
