import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { FileEntry } from "../types";
import { PreviewModal } from "../components/files";
import { useTranslation } from "react-i18next";

type PreviewState = {
  name: string;
  url: string;
  index: number;
};

type UseFilePreviewProps = {
  files: FileEntry[];
  fetchFileBlob: (name: string) => Promise<Blob>;
  onError: (error: unknown, defaultMessage: string) => void;
  onDownload: (name: string) => void;
  onRequestDelete: (name: string) => void;
  isAdmin: boolean;
  isLoading: boolean;
};

type UseFilePreviewResult = {
  openPreview: (name: string) => void;
  closePreview: () => void;
  handlePreviewAfterDelete: (deletedName: string, nextFiles: FileEntry[]) => Promise<void>;
  previewModal: React.ReactNode;
};

export const useFilePreview = ({
  files,
  fetchFileBlob,
  onError,
  onDownload,
  onRequestDelete,
  isAdmin,
  isLoading,
}: UseFilePreviewProps): UseFilePreviewResult => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const openPreview = useCallback(
    async (name: string) => {
      try {
        const blob = await fetchFileBlob(name);
        const url = URL.createObjectURL(blob);
        const index = files.findIndex((file) => file.name === name);
        if (preview?.url) {
          URL.revokeObjectURL(preview.url);
        }
        setPreview({ name, url, index: index >= 0 ? index : 0 });
      } catch (error) {
        onError(error, t("FileBrowser.previewLoadError"));
      }
    },
    [fetchFileBlob, files, onError, preview?.url, t]
  );

  const closePreview = useCallback(() => {
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  }, [preview?.url]);

  const navigatePreview = useCallback(
    async (direction: -1 | 1) => {
      if (!preview) return;
      const newIndex = preview.index + direction;
      if (newIndex < 0 || newIndex >= files.length) return;
      const nextFile = files[newIndex];
      try {
        const blob = await fetchFileBlob(nextFile.name);
        const url = URL.createObjectURL(blob);
        if (preview.url) URL.revokeObjectURL(preview.url);
        setPreview({ name: nextFile.name, url, index: newIndex });
      } catch (error) {
        onError(error, t("FileBrowser.previewLoadError"));
      }
    },
    [fetchFileBlob, files, onError, preview, t]
  );

  const handlePreviewAfterDelete = useCallback(
    async (deletedName: string, nextFiles: FileEntry[]) => {
      if (!preview) return;

      if (preview.name === deletedName) {
        if (nextFiles.length > 0) {
          const nextIndex = Math.min(preview.index, nextFiles.length - 1);
          const nextFile = nextFiles[nextIndex];
          try {
            const blob = await fetchFileBlob(nextFile.name);
            const url = URL.createObjectURL(blob);
            if (preview.url) {
              URL.revokeObjectURL(preview.url);
            }
            setPreview({ name: nextFile.name, url, index: nextIndex });
          } catch (error) {
            onError(error, t("FileBrowser.previewLoadError"));
            closePreview();
          }
        } else {
          closePreview();
        }
      } else {
        const newIndex = nextFiles.findIndex((file) => file.name === preview.name);
        if (newIndex >= 0 && newIndex !== preview.index) {
          setPreview({ ...preview, index: newIndex });
        }
      }
    },
    [closePreview, fetchFileBlob, onError, preview, t]
  );

  useEffect(() => {
    if (!preview) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePreview(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigatePreview(1);
      }
      if (event.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePreview, navigatePreview, preview]);

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

  const previewModal = useMemo(() => {
    if (!preview) return null;

    return (
      <PreviewModal
        open
        previewName={preview.name}
        previewUrl={preview.url}
        index={preview.index}
        count={files.length}
        isAdmin={isAdmin}
        isLoading={isLoading}
        onCancel={closePreview}
        onPrev={() => navigatePreview(-1)}
        onNext={() => navigatePreview(1)}
        onDownload={() => onDownload(preview.name)}
        onRequestDelete={() => onRequestDelete(preview.name)}
      />
    );
  }, [
    closePreview,
    files.length,
    isAdmin,
    isLoading,
    navigatePreview,
    onDownload,
    onRequestDelete,
    preview,
  ]);

  return { openPreview, closePreview, handlePreviewAfterDelete, previewModal };
};
