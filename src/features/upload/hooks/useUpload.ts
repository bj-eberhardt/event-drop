import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClient, ApiError, NetworkError } from "../../../api/client";
import { useTranslation } from "react-i18next";

export type SelectionStats = {
  count: number;
  totalBytes: number;
  maxBytes: number;
};

export type UploadItemStatus = "queued" | "uploading" | "success" | "error";
export type UploadErrorType = "network" | "validation" | "server" | "unknown";

export type UploadItem = {
  id: string;
  file: File;
  from?: string;
  status: UploadItemStatus;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  message: string;
  errorType?: UploadErrorType;
  canRetry: boolean;
};

export type UseUploadOptions = {
  apiClient: ApiClient;
  eventId: string;
  allowedMimeTypes?: string[];
  uploadMaxFileSizeBytes?: number;
  uploadMaxTotalSizeBytes?: number;
  onRefreshFiles?: () => void;
  maxParallelUploads?: number;
  successDismissMs?: number;
};

export type UseUploadResult = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  fromName: string;
  setFromName: (v: string) => void;
  selectionStats: SelectionStats;
  uploadSelectionWarning: string;
  uploadItems: UploadItem[];
  batchDoneCount: number;
  batchTotalCount: number;
  overallProgress: number;
  isUploading: boolean;
  handleFileChange: (fileList: FileList | null) => void;
  clearUploadItem: (id: string) => void;
  retryUploadItem: (id: string) => void;
  cancelUploadItem: (id: string) => void;
};

const createUploadId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function useUpload({
  apiClient,
  eventId,
  allowedMimeTypes = [],
  uploadMaxFileSizeBytes = 0,
  uploadMaxTotalSizeBytes = 0,
  onRefreshFiles,
  maxParallelUploads = 3,
  successDismissMs = 5000,
}: UseUploadOptions): UseUploadResult {
  const { t } = useTranslation();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fromName, setFromName] = useState("");
  const [selectionStats, setSelectionStats] = useState<SelectionStats>({
    count: 0,
    totalBytes: 0,
    maxBytes: 0,
  });
  const [uploadSelectionWarning, setUploadSelectionWarning] = useState("");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [batchItems, setBatchItems] = useState<UploadItem[]>([]);

  const activeUploadsRef = useRef<Set<string>>(new Set());
  const successTimeoutsRef = useRef<Map<string, number>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const canceledIdsRef = useRef<Set<string>>(new Set());

  const syncBatchItem = useCallback((next: UploadItem) => {
    setBatchItems((prev) => {
      const idx = prev.findIndex((v) => v.id === next.id);
      if (idx === -1) return [...prev, next];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const removeBatchItem = useCallback((id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const matchesMime = useCallback((mime: string, allowedList: string[]) => {
    if (!allowedList.length) return true;
    return allowedList.some((allowedType) => {
      if (!allowedType.includes("*")) return mime === allowedType;
      const [allowedMain] = allowedType.split("/");
      const [main] = mime.split("/");
      return allowedMain && allowedMain === main;
    });
  }, []);

  const updateSelectionStats = useCallback((fileList: FileList | null) => {
    if (!fileList) {
      setSelectionStats({ count: 0, totalBytes: 0, maxBytes: 0 });
      return;
    }
    let totalBytes = 0;
    let maxBytes = 0;
    let count = 0;
    Array.from(fileList).forEach((file) => {
      count += 1;
      totalBytes += file.size;
      if (file.size > maxBytes) maxBytes = file.size;
    });
    setSelectionStats({ count, totalBytes, maxBytes });
  }, []);

  const clearUploadItem = useCallback(
    (id: string) => {
      const timeoutId = successTimeoutsRef.current.get(id);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        successTimeoutsRef.current.delete(id);
      }
      setUploadItems((prev) => prev.filter((item) => item.id !== id));
      // If the user explicitly clears an item (error) or cancels it, it should not count
      // towards the batch progress anymore.
      removeBatchItem(id);
    },
    [removeBatchItem]
  );

  const cancelUploadItem = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        canceledIdsRef.current.add(id);
        controller.abort();
        abortControllersRef.current.delete(id);
      }
      clearUploadItem(id);
    },
    [clearUploadItem]
  );

  const retryUploadItem = useCallback((id: string) => {
    canceledIdsRef.current.delete(id);
    setUploadItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "queued",
              progress: 0,
              loadedBytes: 0,
              message: "",
              errorType: undefined,
              canRetry: false,
            }
          : item
      )
    );
    setBatchItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "queued",
              progress: 0,
              loadedBytes: 0,
              message: "",
              errorType: undefined,
              canRetry: false,
            }
          : item
      )
    );
  }, []);

  const scheduleSuccessCleanup = useCallback(
    (id: string) => {
      if (successDismissMs <= 0) return;
      const timeoutId = window.setTimeout(() => {
        // Success items disappear from the UI, but should still count towards the current batch.
        // Therefore: only remove from uploadItems, keep it in batchItems until the batch is complete.
        setUploadItems((prev) => prev.filter((item) => item.id !== id));
      }, successDismissMs);
      successTimeoutsRef.current.set(id, timeoutId);
    },
    [successDismissMs]
  );

  const startUpload = useCallback(
    async (item: UploadItem) => {
      if (activeUploadsRef.current.has(item.id)) return;
      activeUploadsRef.current.add(item.id);
      canceledIdsRef.current.delete(item.id);
      setUploadItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "uploading", message: "", errorType: undefined, canRetry: false }
            : entry
        )
      );
      syncBatchItem({
        ...item,
        status: "uploading",
        message: "",
        errorType: undefined,
        canRetry: false,
      });

      const controller = new AbortController();
      abortControllersRef.current.set(item.id, controller);

      try {
        await apiClient.uploadFile(eventId, {
          file: item.file,
          from: item.from,
          onProgress: ({ loaded, total }) => {
            if (canceledIdsRef.current.has(item.id)) return;
            setUploadItems((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      loadedBytes: loaded,
                      totalBytes: total || entry.totalBytes,
                      progress: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
                    }
                  : entry
              )
            );
            setBatchItems((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      loadedBytes: loaded,
                      totalBytes: total || entry.totalBytes,
                      progress: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
                    }
                  : entry
              )
            );
          },
          signal: controller.signal,
        });

        if (canceledIdsRef.current.has(item.id)) return;
        setUploadItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "success",
                  progress: 100,
                  loadedBytes: entry.totalBytes,
                  message: t("UploadForm.fileUploadSuccess"),
                }
              : entry
          )
        );
        setBatchItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "success",
                  progress: 100,
                  loadedBytes: entry.totalBytes,
                  message: t("UploadForm.fileUploadSuccess"),
                }
              : entry
          )
        );
        if (typeof onRefreshFiles === "function") onRefreshFiles();
        scheduleSuccessCleanup(item.id);
      } catch (error) {
        if (canceledIdsRef.current.has(item.id)) return;
        let message = t("AdminView.serverUnavailable");
        let errorType: UploadErrorType = "unknown";
        let canRetry = false;

        if (error instanceof ApiError) {
          message = error.message || message;
          if (error.status === 429) {
            errorType = "network";
            canRetry = true;
          } else {
            errorType = error.status >= 400 && error.status < 500 ? "validation" : "server";
          }
        } else if (error instanceof NetworkError) {
          message = t("UploadForm.networkError");
          errorType = "network";
          canRetry = true;
        } else if (error instanceof Error) {
          message = error.message || message;
        }

        setUploadItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "error", message, errorType, canRetry }
              : entry
          )
        );
        setBatchItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "error", message, errorType, canRetry }
              : entry
          )
        );
      } finally {
        activeUploadsRef.current.delete(item.id);
        abortControllersRef.current.delete(item.id);
        canceledIdsRef.current.delete(item.id);
      }
    },
    [apiClient, eventId, onRefreshFiles, scheduleSuccessCleanup, t]
  );

  const handleFileChange = useCallback(
    (fileList: FileList | null) => {
      updateSelectionStats(fileList);
      const files = fileList ? Array.from(fileList) : [];
      if (!files.length) return;

      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      if (uploadMaxTotalSizeBytes > 0 && totalBytes > uploadMaxTotalSizeBytes) {
        const rejectedItems = files.map((file) => ({
          id: createUploadId(),
          file,
          from: fromName.trim() || undefined,
          status: "error" as UploadItemStatus,
          progress: 0,
          loadedBytes: 0,
          totalBytes: file.size,
          message: t("UploadForm.totalLimitExceeded"),
          errorType: "validation" as UploadErrorType,
          canRetry: false,
        }));
        setUploadSelectionWarning(t("UploadForm.totalLimitExceeded"));
        setUploadItems((prev) => [...prev, ...rejectedItems]);
        setBatchItems((prev) => [...prev, ...rejectedItems]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        updateSelectionStats(null);
        return;
      }

      const acceptedItems: UploadItem[] = [];
      const rejectedItems: UploadItem[] = [];
      const snapshotFrom = fromName.trim() || undefined;

      files.forEach((file) => {
        if (!matchesMime(file.type || "", allowedMimeTypes)) {
          rejectedItems.push({
            id: createUploadId(),
            file,
            from: snapshotFrom,
            status: "error",
            progress: 0,
            loadedBytes: 0,
            totalBytes: file.size,
            message: t("UploadForm.fileTypeNotAllowed"),
            errorType: "validation",
            canRetry: false,
          });
          return;
        }

        if (uploadMaxFileSizeBytes > 0 && file.size > uploadMaxFileSizeBytes) {
          rejectedItems.push({
            id: createUploadId(),
            file,
            from: snapshotFrom,
            status: "error",
            progress: 0,
            loadedBytes: 0,
            totalBytes: file.size,
            message: t("UploadForm.fileTooLarge"),
            errorType: "validation",
            canRetry: false,
          });
          return;
        }

        acceptedItems.push({
          id: createUploadId(),
          file,
          from: snapshotFrom,
          status: "queued",
          progress: 0,
          loadedBytes: 0,
          totalBytes: file.size,
          message: "",
          canRetry: false,
        });
      });

      setUploadSelectionWarning("");
      setUploadItems((prev) => [...prev, ...rejectedItems, ...acceptedItems]);
      setBatchItems((prev) => [...prev, ...rejectedItems, ...acceptedItems]);

      if (fileInputRef.current) fileInputRef.current.value = "";
      updateSelectionStats(null);
    },
    [
      allowedMimeTypes,
      fromName,
      matchesMime,
      updateSelectionStats,
      uploadMaxFileSizeBytes,
      uploadMaxTotalSizeBytes,
      t,
    ]
  );

  useEffect(() => {
    const uploadingCount = uploadItems.filter((item) => item.status === "uploading").length;
    const availableSlots = Math.max(0, maxParallelUploads - uploadingCount);
    if (availableSlots === 0) return;

    const queuedItems = uploadItems.filter((item) => item.status === "queued");
    queuedItems.slice(0, availableSlots).forEach((item) => {
      void startUpload(item);
    });
  }, [maxParallelUploads, startUpload, uploadItems]);

  useEffect(() => {
    return () => {
      successTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      successTimeoutsRef.current.clear();
    };
  }, []);

  const overallProgress = useMemo(() => {
    const activeItems = batchItems.filter((item) => item.status !== "error");
    const totalBytes = activeItems.reduce((sum, item) => sum + item.totalBytes, 0);
    if (totalBytes <= 0) return 0;
    const loadedBytes = activeItems.reduce((sum, item) => sum + item.loadedBytes, 0);
    return Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
  }, [batchItems]);

  const { batchDoneCount, batchTotalCount } = useMemo(() => {
    const total = batchItems.length;
    const done = batchItems.filter((item) => item.status === "success").length;
    return { batchDoneCount: done, batchTotalCount: total };
  }, [batchItems]);

  useEffect(() => {
    // Once nothing is shown anymore, we can drop the internal batch history.
    // This keeps progress/counts stable while success items auto-dismiss,
    // but avoids showing stale totals once the queue UI disappears.
    if (uploadItems.length > 0) return;
    const hasActive = batchItems.some(
      (item) => item.status === "queued" || item.status === "uploading"
    );
    if (hasActive) return;
    if (batchItems.length === 0) return;
    setBatchItems([]);
  }, [batchItems, uploadItems.length]);

  const isUploading = uploadItems.some((item) => item.status === "uploading");

  return {
    fileInputRef,
    fromName,
    setFromName,
    selectionStats,
    uploadSelectionWarning,
    uploadItems,
    batchDoneCount,
    batchTotalCount,
    overallProgress,
    isUploading,
    handleFileChange,
    clearUploadItem,
    retryUploadItem,
    cancelUploadItem,
  };
}
