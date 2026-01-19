import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileEntry } from "../../../types";
import { PreviewModal } from "../components/PreviewModal";
import { useTranslation } from "react-i18next";

type PreviewStatus = "loading" | "ready" | "error";
type PreviewKind = "image" | "video" | "audio" | "pdf" | "other";

type PreviewState = {
  name: string;
  url: string | null;
  index: number;
  status: PreviewStatus;
  kind: PreviewKind;
  typeLabel: string;
};

type UseFilePreviewProps = {
  files: FileEntry[];
  fetchFileBlob: (name: string) => Promise<Blob>;
  fetchPreviewBlob: (
    name: string,
    options: { width?: number; height?: number; quality?: number; format?: "jpeg" | "webp" | "png" }
  ) => Promise<Blob>;
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
  fetchPreviewBlob,
  onError,
  onDownload,
  onRequestDelete,
  isAdmin,
  isLoading,
}: UseFilePreviewProps): UseFilePreviewResult => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const requestIdRef = useRef(0);
  const imageExtensions = useMemo(() => new Set(["jpg", "jpeg", "png", "webp"]), []);

  const MAX_PREVIEW_SIZE = 1500;
  const getPreviewSize = useCallback(() => {
    if (typeof window === "undefined") return { width: undefined, height: undefined };
    const width = Math.min(MAX_PREVIEW_SIZE, Math.max(320, Math.floor(window.innerWidth * 0.9)));
    const height = Math.min(MAX_PREVIEW_SIZE, Math.max(240, Math.floor(window.innerHeight * 0.8)));
    return { width, height };
  }, []);

  const shouldUsePreview = useCallback(
    (name: string) => {
      const dot = name.lastIndexOf(".");
      if (dot <= 0 || dot >= name.length - 1) return false;
      return imageExtensions.has(name.slice(dot + 1).toLowerCase());
    },
    [imageExtensions]
  );

  const getTypeLabel = useCallback(
    (name: string, mimeType?: string) => {
      if (mimeType) return mimeType;
      const dotIndex = name.lastIndexOf(".");
      if (dotIndex > 0 && dotIndex < name.length - 1) {
        return name.slice(dotIndex + 1).toUpperCase();
      }
      return t("FileBrowser.previewUnknownType");
    },
    [t]
  );

  const loadPreview = useCallback(
    async (name: string, index: number) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }

      setPreview({
        name,
        index,
        url: null,
        status: "loading",
        kind: "other",
        typeLabel: t("FileBrowser.previewLoading"),
      });

      try {
        const { width, height } = getPreviewSize();
        const blob = shouldUsePreview(name)
          ? await fetchPreviewBlob(name, { width, height, quality: 80, format: "jpeg" })
          : await fetchFileBlob(name);
        if (requestIdRef.current !== requestId) return;
        const mimeType = blob.type || "";
        const typeLabel = getTypeLabel(name, mimeType);
        let kind: PreviewKind = "other";
        if (mimeType.startsWith("image/")) kind = "image";
        else if (mimeType.startsWith("video/")) kind = "video";
        else if (mimeType.startsWith("audio/")) kind = "audio";
        else if (mimeType === "application/pdf") kind = "pdf";

        const shouldCreateUrl = kind !== "other";
        const url = shouldCreateUrl ? URL.createObjectURL(blob) : null;
        setPreview({
          name,
          index,
          url,
          status: "ready",
          kind,
          typeLabel,
        });
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        setPreview((current) =>
          current && current.name === name
            ? { ...current, status: "error", typeLabel: getTypeLabel(name) }
            : current
        );
        onError(error, t("FileBrowser.previewLoadError"));
      }
    },
    [
      fetchFileBlob,
      fetchPreviewBlob,
      getPreviewSize,
      getTypeLabel,
      onError,
      preview?.url,
      shouldUsePreview,
      t,
    ]
  );

  const openPreview = useCallback(
    async (name: string) => {
      const index = files.findIndex((file) => file.name === name);
      await loadPreview(name, index >= 0 ? index : 0);
    },
    [files, loadPreview]
  );

  const closePreview = useCallback(() => {
    requestIdRef.current += 1;
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
      await loadPreview(nextFile.name, newIndex);
    },
    [files, loadPreview, preview]
  );

  const handlePreviewAfterDelete = useCallback(
    async (deletedName: string, nextFiles: FileEntry[]) => {
      if (!preview) return;

      if (preview.name === deletedName) {
        if (nextFiles.length > 0) {
          const nextIndex = Math.min(preview.index, nextFiles.length - 1);
          const nextFile = nextFiles[nextIndex];
          await loadPreview(nextFile.name, nextIndex);
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
    [closePreview, loadPreview, preview]
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
        previewUrl={preview.url ?? ""}
        index={preview.index}
        count={files.length}
        isAdmin={isAdmin}
        isLoading={isLoading}
        previewStatus={preview.status}
        previewKind={preview.kind}
        previewTypeLabel={preview.typeLabel}
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
