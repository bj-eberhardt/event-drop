import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { ApiClient, ApiError } from "../api/client";
import type { FileEntry } from "../types";
import { downloadBlob } from "../lib/download";
import { useSessionStore } from "../lib/sessionStore";
import { DeleteFileDialog } from "../components/files";
import { useFilePreview } from "./useFilePreview";
import { useTimedFeedback } from "./useTimedFeedback";

type FileBrowserMode = "admin" | "guest";

type UseFileBrowserProps = {
  subdomain: string;
  mode: FileBrowserMode;
  t: TFunction;
};

type UseFileBrowserResult = {
  files: FileEntry[];
  folders: string[];
  currentFolder: string;
  statusMessage: string;
  statusTone: "good" | "bad" | "";
  isLoading: boolean;
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

const adminBasePath = "/admin";
const guestBasePath = "/";

const getBasePath = (mode: FileBrowserMode, subdomain: string): string => {
  const pathname = window.location.pathname;
  const normalized =
    pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (mode === "admin") {
    const candidate = `/${subdomain}/admin`;
    if (normalized === candidate || normalized.startsWith(`${candidate}/`)) return candidate;
    return adminBasePath;
  }
  const candidate = `/${subdomain}`;
  if (normalized === candidate || normalized.startsWith(`${candidate}/`)) return candidate;
  return guestBasePath;
};

const getFolderFromLocation = (mode: FileBrowserMode, subdomain: string): string => {
  const base = getBasePath(mode, subdomain);
  if (!window.location.pathname.startsWith(base)) return "";
  const parts = window.location.pathname.substring(base.length);
  if (!parts) return "";
  const trimmed = parts.startsWith("/") ? parts.slice(1) : parts;
  return trimmed ? decodeURIComponent(trimmed) : "";
};

const navigateToFolder = (mode: FileBrowserMode, subdomain: string, folder: string): string => {
  const base = getBasePath(mode, subdomain);
  return folder ? `${base}${base.endsWith("/") ? "" : "/"}${encodeURIComponent(folder)}` : base;
};

export const useFileBrowser = ({
  subdomain,
  mode,
  t,
}: UseFileBrowserProps): UseFileBrowserResult => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { message: feedbackMessage, showError, showSuccess, clear } = useTimedFeedback();
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
        const response = await apiClient.listFiles(subdomain, { folder });
        setFiles(response.files || []);
        setFolders(response.folders || []);
        const effectiveFolder = folder || response.folder || "";
        setCurrentFolder(effectiveFolder);
        const target = navigateToFolder(mode, subdomain, effectiveFolder);
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
    [apiClient, clear, handleApiError, mode, subdomain, t]
  );

  const fetchFileBlob = useCallback(
    async (name: string) => {
      return await apiClient.downloadFile(subdomain, {
        filename: name,
        folder: currentFolder || undefined,
      });
    },
    [apiClient, currentFolder, subdomain]
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
      return await apiClient.downloadPreview(subdomain, {
        filename: name,
        folder: currentFolder || undefined,
        width: options.width,
        height: options.height,
        quality: options.quality,
        format: options.format,
        fit: "inside",
      });
    },
    [apiClient, currentFolder, subdomain]
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
        const targetPath = currentFolder ? `${currentFolder}/${name}` : name;
        await apiClient.deleteFile(subdomain, { filename: targetPath });

        const response = await apiClient.listFiles(subdomain, { folder: currentFolder || "" });
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
      handleApiError,
      handlePreviewAfterDelete,
      isAdmin,
      showSuccess,
      subdomain,
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
    try {
      const blob = await apiClient.downloadZip(subdomain, currentFolder || undefined);
      downloadBlob(blob, `${subdomain}-files.zip`);
    } catch (error) {
      handleApiError(error, t("FileBrowser.zipError"));
    }
  }, [apiClient, currentFolder, handleApiError, subdomain, t]);

  useEffect(() => {
    const initialFolder = getFolderFromLocation(mode, subdomain);
    fetchFiles(initialFolder, { replaceHistory: false }).catch(() => {
      showError(t("AdminView.serverUnavailable"));
      setIsLoading(false);
    });

    const onPop = () => {
      const folder = getFolderFromLocation(mode, subdomain);
      fetchFiles(folder, { replaceHistory: false }).catch(() => {
        showError(t("AdminView.serverUnavailable"));
      });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [fetchFiles, mode, showError, subdomain, t]);

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
    fetchFiles,
    openPreview,
    downloadFile,
    downloadZip,
    requestDelete,
    previewModal,
    deleteDialog,
  };
};
