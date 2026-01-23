import { ModalDialog } from "../../../components/ui/ModalDialog";
import {
  DownloadIcon,
  TrashIcon,
  PrevIcon,
  NextIcon,
  CloseIcon,
} from "../../../components/ui/icons";
import { useTranslation } from "react-i18next";

type PreviewModalProps = {
  open: boolean;
  previewName: string;
  previewUrl: string;
  previewStatus: "loading" | "ready" | "error";
  previewKind: "image" | "video" | "audio" | "pdf" | "other";
  previewTypeLabel: string;
  index: number;
  count: number;
  isAdmin: boolean;
  isLoading: boolean;
  onCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
  onRequestDelete: () => void;
};

export function PreviewModal({
  open,
  previewName,
  previewUrl,
  previewStatus,
  previewKind,
  previewTypeLabel,
  index,
  count,
  isAdmin,
  isLoading,
  onCancel,
  onPrev,
  onNext,
  onDownload,
  onRequestDelete,
}: PreviewModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  const showLoading = previewStatus === "loading";
  const showImage = previewStatus === "ready" && previewKind === "image" && previewUrl;
  const showVideo = previewStatus === "ready" && previewKind === "video" && previewUrl;
  const showAudio = previewStatus === "ready" && previewKind === "audio" && previewUrl;
  const showPdf = previewStatus === "ready" && previewKind === "pdf" && previewUrl;
  const showUnavailable =
    previewStatus === "ready" &&
    previewKind !== "image" &&
    previewKind !== "video" &&
    previewKind !== "audio" &&
    previewKind !== "pdf";
  const showError = previewStatus === "error";

  return (
    <ModalDialog
      open
      title={previewName}
      subtitle={t("FileBrowser.previewNav", { index: index + 1, count })}
      onCancel={onCancel}
      closeOnEscape
      showDefaultActions={false}
      headerSlot={
        <>
          <button
            className="icon-btn"
            onClick={onPrev}
            disabled={index <= 0}
            title={t("FileBrowser.previewPrev")}
            aria-label={t("FileBrowser.previewPrev")}
            data-testid="preview-prev"
          >
            <PrevIcon />
          </button>
          <button
            className="icon-btn"
            onClick={onDownload}
            title={t("FileBrowser.download")}
            aria-label={t("FileBrowser.download")}
            data-testid="preview-download"
          >
            <DownloadIcon />
          </button>
          <button
            className="icon-btn"
            onClick={onNext}
            disabled={index >= count - 1}
            title={t("FileBrowser.previewNext")}
            aria-label={t("FileBrowser.previewNext")}
            data-testid="preview-next"
          >
            <NextIcon />
          </button>
          <button
            className="icon-btn"
            onClick={onCancel}
            title={t("FileBrowser.previewClose")}
            aria-label={t("FileBrowser.previewClose")}
            data-testid="preview-close"
          >
            <CloseIcon />
          </button>
        </>
      }
      footerSlot={
        isAdmin ? (
          <div className="modal-footer">
            <button
              className="icon-btn danger-btn"
              type="button"
              onClick={onRequestDelete}
              disabled={isLoading}
              title={t("FileBrowser.delete")}
              aria-label={t("FileBrowser.delete")}
            >
              <TrashIcon /> {t("FileBrowser.delete")}
            </button>
          </div>
        ) : null
      }
    >
      {showLoading ? (
        <div className="preview-placeholder" data-testid="preview-loading">
          <span className="preview-spinner" aria-hidden="true" />
          <span>{t("FileBrowser.previewLoading")}</span>
        </div>
      ) : null}
      {showImage ? (
        <img
          src={previewUrl}
          alt={previewName}
          className="preview-image"
          data-testid="preview-image"
        />
      ) : null}
      {showVideo ? (
        <video src={previewUrl} controls className="preview-media" data-testid="preview-video" />
      ) : null}
      {showAudio ? (
        <audio src={previewUrl} controls className="preview-audio" data-testid="preview-audio" />
      ) : null}
      {showPdf ? (
        <iframe
          src={previewUrl}
          title={previewName}
          className="preview-pdf"
          data-testid="preview-pdf"
        />
      ) : null}
      {showUnavailable ? (
        <div className="preview-placeholder" data-testid="preview-unavailable">
          <strong>{t("FileBrowser.previewUnavailable")}</strong>
          <span className="preview-type">
            {t("FileBrowser.previewTypeLabel", { type: previewTypeLabel })}
          </span>
        </div>
      ) : null}
      {showError ? (
        <div className="preview-placeholder" data-testid="preview-error">
          <strong>{t("FileBrowser.previewLoadError")}</strong>
        </div>
      ) : null}
    </ModalDialog>
  );
}
