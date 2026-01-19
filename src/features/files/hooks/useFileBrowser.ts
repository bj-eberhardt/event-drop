import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClient, ApiError } from "../../../api/client";
import type { FileEntry } from "../../../types";
import { downloadBlob } from "../../../lib/download";
import { useSessionStore } from "../../../lib/sessionStore";
import { buildFolderPath, FileBrowserMode, getFolderFromLocation } from "../../../lib/navigation";
import { DeleteFileDialog } from "../components/DeleteFileDialog";
import { useFilePreview } from "./useFilePreview";
import { useTimedFeedback } from "../../../shared/hooks/useTimedFeedback";

type UseFileBrowserProps = {
  eventId: string;
  mode: FileBrowserMode;
};

type UseFileBrowserResult = {
  files: FileEntry[];
  folders: string[];
  currentFolder: string;
  statusMessage: string;
  statusTone: "good" | "bad" | "";
  isLoading: boolean;
  isZipDownloading: boolean;
  zipStatusMessage: string;
  zipStatusTone: "good" | "bad" | "";
  fetchFiles: (
    folderParam?: string,
    opts?: { pushHistory?: boolean; replaceHistory?: boolean }
  ) => Promise<void>;
  openPreview: (name: string) => void;
  downloadFile: (name: string) => void;
  downloadZip: () => void;
  requestDelete: (name: string) => void;
  previewModal: React.ReactNode;
  deleteDialog: React.ReactNode;
};

export const useFileBrowser = ({ eventId, mode }: UseFileBrowserProps): UseFileBrowserResult => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isZipDownloading, setIsZipDownloading] = useState(false);
  const { message: feedbackMessage, showError, showSuccess, clear } = useTimedFeedback();
  const {
    message: zipFeedback,
    showError: showZipError,
    showSuccess: showZipSuccess,
    clear: clearZipFeedback,
  } = useTimedFeedback();
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [skipDeletePrompt, setSkipDeletePrompt] = useState(false);
  const isAdmin = mode === "admin";
  const deleteFileRef = useRef<(name: string) => void>(() => {});

  const { adminToken, guestToken, skipDeleteConfirm, setSkipDeleteConfirm } = useSessionStore();
  const apiClient = useMemo(() => {
    return mode === "admin"
      ? ApiClient.withAdminToken(adminToken ?? "")
      : ApiClient.withGuestToken(guestToken ?? "");
  }, [adminToken, guestToken, mode]);

  const handleApiError = useCallback(
    (error: unknown, defaultMessage: string) => {
      if (error instanceof ApiError) {
        showError(error.message || defaultMessage);
      } else if (error instanceof Error) {
        showError(error.message || defaultMessage);
      } else {
        showError(defaultMessage);
      }
    },
    [showError]
  );

  const fetchFiles = useCallback(
    async (folderParam?: string, opts?: { pushHistory?: boolean; replaceHistory?: boolean }) => {
      const folder = folderParam ?? "";
      clear();
      setIsLoading(true);
      try {
        const response = await apiClient.listFiles(eventId, { folder });
        setFiles(response.files || []);
        setFolders(response.folders || []);
        const effectiveFolder = folder || response.folder || "";
        setCurrentFolder(effectiveFolder);
        const target = buildFolderPath(mode, eventId, effectiveFolder);
        if (opts?.pushHistory) {
          window.history.pushState({}, "", target);
        } else if (opts?.replaceHistory !== false) {
          window.history.replaceState({}, "", target);
        }
      } catch (error) {
        handleApiError(error, t("FileBrowser.loadError"));
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, buildFolderPath, clear, eventId, handleApiError, mode, t]
  );

  const fetchFileBlob = useCallback(
    async (name: string) => {
      return await apiClient.downloadFile(eventId, {
        filename: name,
        folder: currentFolder || undefined,
      });
    },
    [apiClient, currentFolder, eventId]
  );

  const fetchPreviewBlob = useCallback(
    async (
      name: string,
      options: {
        width?: number;
        height?: number;
        quality?: number;
        format?: "jpeg" | "webp" | "png";
      }
    ) => {
      return await apiClient.downloadPreview(eventId, {
        filename: name,
        folder: currentFolder || undefined,
        width: options.width,
        height: options.height,
        quality: options.quality,
        format: options.format,
        fit: "inside",
      });
    },
    [apiClient, currentFolder, eventId]
  );

  const downloadFile = useCallback(
    async (name: string) => {
      try {
        const blob = await fetchFileBlob(name);
        downloadBlob(blob, name);
      } catch (error) {
        handleApiError(error, t("FileBrowser.downloadError"));
      }
    },
    [fetchFileBlob, handleApiError, t]
  );

  const requestDelete = useCallback(
    (name: string) => {
      if (!isAdmin) return;
      if (skipDeleteConfirm) {
        deleteFileRef.current(name);
        return;
      }
      setDeleteCandidate(name);
      setSkipDeletePrompt(false);
    },
    [isAdmin, skipDeleteConfirm]
  );

  const cancelDelete = useCallback(() => {
    setDeleteCandidate(null);
    setSkipDeletePrompt(false);
  }, []);

  const { openPreview, handlePreviewAfterDelete, previewModal } = useFilePreview({
    files,
    fetchFileBlob,
    fetchPreviewBlob,
    onError: handleApiError,
    onDownload: downloadFile,
    onRequestDelete: requestDelete,
    isAdmin,
    isLoading,
  });

  const deleteFile = useCallback(
    async (name: string) => {
      if (!isAdmin) return;
      clear();
      setIsLoading(true);
      try {
        await apiClient.deleteFile(eventId, {
          filename: name,
          folder: currentFolder || undefined,
        });

        const response = await apiClient.listFiles(eventId, { folder: currentFolder || "" });
        const nextFiles = response.files || [];
        setFiles(nextFiles);
        setFolders(response.folders || []);
        const effectiveFolder = currentFolder || response.folder || "";
        setCurrentFolder(effectiveFolder);

        await handlePreviewAfterDelete(name, nextFiles);

        showSuccess(t("FileBrowser.deleteSuccess"));
      } catch (error) {
        handleApiError(error, t("FileBrowser.deleteError"));
      } finally {
        setIsLoading(false);
      }
    },
    [
      apiClient,
      clear,
      currentFolder,
      eventId,
      handleApiError,
      handlePreviewAfterDelete,
      isAdmin,
      showSuccess,
      t,
    ]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteCandidate) return;
    if (skipDeletePrompt) {
      setSkipDeleteConfirm(true);
    }
    await deleteFile(deleteCandidate);
    setDeleteCandidate(null);
    setSkipDeletePrompt(false);
  }, [deleteCandidate, deleteFile, setSkipDeleteConfirm, skipDeletePrompt]);

  deleteFileRef.current = deleteFile;

  const downloadZip = useCallback(async () => {
    clearZipFeedback();
    setIsZipDownloading(true);
    try {
      const blob = await apiClient.downloadZip(eventId, currentFolder || undefined);
      downloadBlob(blob, `${eventId}-files.zip`);
      showZipSuccess(t("FileBrowser.zipSuccess"));
    } catch (error) {
      if (error instanceof ApiError) {
        showZipError(error.message || t("FileBrowser.zipError"));
      } else if (error instanceof Error) {
        showZipError(error.message || t("FileBrowser.zipError"));
      } else {
        showZipError(t("FileBrowser.zipError"));
      }
    } finally {
      setIsZipDownloading(false);
    }
  }, [apiClient, clearZipFeedback, currentFolder, eventId, showZipError, showZipSuccess, t]);

  useEffect(() => {
    const initialFolder = getFolderFromLocation(mode, eventId);
    fetchFiles(initialFolder, { replaceHistory: false }).catch(() => {
      showError(t("AdminView.serverUnavailable"));
      setIsLoading(false);
    });

    const onPop = () => {
      const folder = getFolderFromLocation(mode, eventId);
      fetchFiles(folder, { replaceHistory: false }).catch(() => {
        showError(t("AdminView.serverUnavailable"));
      });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [eventId, fetchFiles, mode, showError, t]);

  const deleteDialog = createElement(DeleteFileDialog, {
    open: Boolean(deleteCandidate),
    filename: deleteCandidate ?? "",
    confirmLabel: t("FileBrowser.delete"),
    cancelLabel: t("NewEventView.cancel"),
    message: t("FileBrowser.deleteConfirm", { name: deleteCandidate ?? "" }),
    skipPrompt: skipDeletePrompt,
    onToggleSkipPrompt: setSkipDeletePrompt,
    onCancel: cancelDelete,
    onConfirm: confirmDelete,
    skipLabel: t("FileBrowser.deleteSkipConfirm"),
  });

  return {
    files,
    folders,
    currentFolder,
    statusMessage: feedbackMessage?.text || "",
    statusTone: (feedbackMessage?.tone as "good" | "bad" | "") || "",
    isLoading,
    isZipDownloading,
    zipStatusMessage: zipFeedback?.text || "",
    zipStatusTone: (zipFeedback?.tone as "good" | "bad" | "") || "",
    fetchFiles,
    openPreview,
    downloadFile,
    downloadZip,
    requestDelete,
    previewModal,
    deleteDialog,
  };
};
