import type { TFunction } from "i18next";
import type { UploadItem, UploadItemStatus } from "./useUpload";

export type UploadQueueItemView = {
  id: string;
  name: string;
  status: UploadItemStatus;
  statusLabel: string;
  totalBytes: number;
  message: string;
  progress: number;
  canRetry: boolean;
  showCancel: boolean;
};

export type UseUploadQueueResult = {
  viewItems: UploadQueueItemView[];
  doneCount: number;
  totalCount: number;
};

const getStatusLabel = (status: UploadItemStatus, t: TFunction) => {
  switch (status) {
    case "queued":
      return t("UploadForm.statusQueued");
    case "uploading":
      return t("UploadForm.statusUploading");
    case "success":
      return t("UploadForm.statusSuccess");
    default:
      return t("UploadForm.statusError");
  }
};

export const useUploadQueue = (items: UploadItem[], t: TFunction): UseUploadQueueResult => {
  const doneCount = items.filter((item) => item.status === "success").length;
  const totalCount = items.length;
  const viewItems = items.map((item) => ({
    id: item.id,
    name: item.file.name,
    status: item.status,
    statusLabel: getStatusLabel(item.status, t),
    totalBytes: item.totalBytes,
    message: item.message,
    progress: item.progress,
    canRetry: item.canRetry,
    showCancel: item.status === "queued" || item.status === "uploading",
  }));

  return { viewItems, doneCount, totalCount };
};
