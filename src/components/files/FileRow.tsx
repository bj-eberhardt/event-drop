import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "../../types";
import { formatFileSize } from "../../lib/format";
import type { TFunction } from "i18next";
import { DownloadIcon, TrashIcon } from "../ui/icons";

type FileRowProps = {
  file: FileEntry;
  canDelete: boolean;
  isLoading: boolean;
  onOpenPreview: (name: string) => void;
  onDownload: (name: string) => void;
  onRequestDelete: (name: string) => void;
  t: TFunction;
};

export function FileRow({
  file,
  canDelete,
  isLoading,
  onOpenPreview,
  onDownload,
  onRequestDelete,
  t,
}: FileRowProps) {
  const nameRef = useRef<HTMLButtonElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const update = () => {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [file.name]);

  return (
    <div className="file-row" key={file.name} data-testid="file-row">
      <div className="file-meta">
        <button
          className="link-btn"
          ref={nameRef}
          onClick={() => onOpenPreview(file.name)}
          data-testid="file-open"
        >
          {file.name}
        </button>
        <span className="helper">
          {formatFileSize(file.size)} | {new Date(file.createdAt).toLocaleString()}
        </span>
        {isTruncated ? <span className="file-name-full">{file.name}</span> : null}
      </div>
      <div className="file-actions">
        <button
          className="icon-btn"
          type="button"
          title={t("FileBrowser.download")}
          aria-label={t("FileBrowser.download")}
          onClick={() => onDownload(file.name)}
          disabled={isLoading}
          data-testid="file-download"
        >
          <DownloadIcon />
        </button>
        {canDelete ? (
          <button
            className="icon-btn danger-btn"
            type="button"
            title={t("FileBrowser.delete")}
            aria-label={t("FileBrowser.delete")}
            onClick={() => onRequestDelete(file.name)}
            disabled={isLoading}
            data-testid="file-delete"
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
