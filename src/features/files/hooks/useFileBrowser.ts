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
import { FOLDER_PATTERN, isFolderNameValid } from "../../../lib/folderValidation";
import { ModalDialog } from "../../../components/ui/ModalDialog";

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
  openRename: (folder: string) => void;
  previewModal: React.ReactNode;
  deleteDialog: React.ReactNode;
  renameDialog: React.ReactNode;
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
  const [renameCandidate, setRenameCandidate] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameTouched, setRenameTouched] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameErrorMessage, setRenameErrorMessage] = useState("");
  const isAdmin = mode === "admin";
  const deleteFileRef = useRef<(name: string) => void>(() => {});
  const initialLoadKeyRef = useRef<string | null>(null);
  const initialLoadRequestRef = useRef<Promise<void> | null>(null);

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

  const openRename = useCallback(
    (folder: string) => {
      if (!isAdmin) return;
      setRenameCandidate(folder);
      setRenameValue(folder);
      setRenameTouched(false);
      setRenameErrorMessage("");
    },
    [isAdmin]
  );

  const cancelRename = useCallback(() => {
    setRenameCandidate(null);
    setRenameValue("");
    setRenameTouched(false);
    setRenameErrorMessage("");
  }, []);

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
    const initialKey = `${eventId}:${mode}:${initialFolder}`;
    if (initialLoadKeyRef.current !== initialKey && !initialLoadRequestRef.current) {
      initialLoadKeyRef.current = initialKey;
      initialLoadRequestRef.current = fetchFiles(initialFolder, { replaceHistory: false })
        .catch(() => {
          showError(t("AdminView.serverUnavailable"));
          setIsLoading(false);
        })
        .finally(() => {
          initialLoadRequestRef.current = null;
        });
    }

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

  const renameTrimmed = renameValue.trim();
  const isRenameValid = isFolderNameValid(renameTrimmed);
  const isRenameChanged = Boolean(renameCandidate && renameTrimmed !== renameCandidate);
  const showRenameError = renameTouched && !isRenameValid;

  const confirmRename = useCallback(async () => {
    if (!renameCandidate) return;
    setRenameTouched(true);
    const trimmed = renameValue.trim();
    if (!isFolderNameValid(trimmed) || trimmed === renameCandidate) {
      return;
    }
    clear();
    setRenameErrorMessage("");
    setIsRenaming(true);
    try {
      await apiClient.renameFolder(eventId, { folder: renameCandidate, to: trimmed });
      showSuccess(t("FileBrowser.renameSuccess"));
      cancelRename();
      await fetchFiles(currentFolder, { replaceHistory: true });
    } catch (error) {
      if (error instanceof ApiError) {
        const errorKey = (error.body as { errorKey?: string } | undefined)?.errorKey;
        if (errorKey === "FOLDER_ALREADY_EXISTS") {
          setRenameErrorMessage(t("FileBrowser.renameConflict"));
        } else {
          setRenameErrorMessage(error.message || t("FileBrowser.renameError"));
        }
      } else {
        handleApiError(error, t("FileBrowser.renameError"));
      }
    } finally {
      setIsRenaming(false);
    }
  }, [
    apiClient,
    cancelRename,
    clear,
    currentFolder,
    eventId,
    fetchFiles,
    handleApiError,
    renameCandidate,
    renameValue,
    showSuccess,
    t,
  ]);

  const renameDialog = createElement(
    ModalDialog,
    {
      open: Boolean(renameCandidate),
      title: t("FileBrowser.renameTitle", { folder: renameCandidate ?? "" }),
      onCancel: cancelRename,
      showDefaultActions: false,
      footerSlot: createElement(
        "div",
        {
          className: "modal-controls",
          style: { padding: "12px 14px", justifyContent: "flex-end" },
        },
        createElement(
          "button",
          {
            type: "button",
            className: "ghost",
            onClick: cancelRename,
            disabled: isRenaming,
            "data-testid": "rename-folder-cancel",
          },
          t("FileBrowser.renameCancel")
        ),
        createElement(
          "button",
          {
            type: "button",
            className: "primary",
            onClick: confirmRename,
            disabled: !isRenameValid || !isRenameChanged || isRenaming,
            "data-testid": "rename-folder-confirm",
          },
          t("FileBrowser.renameConfirm")
        )
      ),
    },
    createElement(
      "label",
      { className: "field" },
      createElement("span", null, t("FileBrowser.renameLabel")),
      createElement("input", {
        type: "text",
        placeholder: t("FileBrowser.renamePlaceholder"),
        pattern: FOLDER_PATTERN,
        maxLength: 32,
        value: renameValue,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          setRenameValue(event.target.value);
          if (!renameTouched) setRenameTouched(true);
        },
        onBlur: () => setRenameTouched(true),
        disabled: isRenaming,
        "data-testid": "rename-folder-input",
      }),
      createElement("p", { className: "hint" }, t("FileBrowser.renameHint")),
      showRenameError
        ? createElement(
            "p",
            { className: "helper status bad", "data-testid": "rename-folder-error" },
            t("FileBrowser.renameInvalid")
          )
        : null,
      renameErrorMessage
        ? createElement("p", { className: "helper status bad" }, renameErrorMessage)
        : null
    )
  );

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
    openRename,
    previewModal,
    deleteDialog,
    renameDialog,
  };
};
