import type { PointerEventHandler } from "react";
import { useMemo, useRef } from "react";
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
  const swipeRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startTargetIgnored: boolean;
    isHorizontalDrag: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startTargetIgnored: false,
    isHorizontalDrag: false,
  });

  const swipeEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    const coarse =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const touchPoints = typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0;
    return coarse || touchPoints > 0;
  }, []);

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

  const stageIsTall = previewKind === "image" || previewKind === "video" || previewKind === "pdf";
  const stageClassName = stageIsTall ? "preview-stage preview-stage--tall" : "preview-stage";

  const canPrev = index > 0;
  const canNext = index < count - 1;

  const shouldIgnoreSwipeStart = (target: EventTarget | null) => {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest("button,a,input,select,textarea,video,audio,iframe"));
  };

  const resetSwipe = () => {
    swipeRef.current.pointerId = null;
    swipeRef.current.startTargetIgnored = false;
    swipeRef.current.isHorizontalDrag = false;
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!swipeEnabled) return;
    if (previewStatus !== "ready") return;
    const coarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const isTouchLike = event.pointerType === "touch" || (coarse && event.pointerType === "mouse");
    if (!isTouchLike) return;
    if (shouldIgnoreSwipeStart(event.target)) return;
    if (swipeRef.current.pointerId != null) return;

    swipeRef.current.pointerId = event.pointerId;
    swipeRef.current.startX = event.clientX;
    swipeRef.current.startY = event.clientY;
    swipeRef.current.lastX = event.clientX;
    swipeRef.current.lastY = event.clientY;
    swipeRef.current.startTargetIgnored = false;
    swipeRef.current.isHorizontalDrag = false;
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (swipeRef.current.pointerId !== event.pointerId) return;

    swipeRef.current.lastX = event.clientX;
    swipeRef.current.lastY = event.clientY;

    const dx = event.clientX - swipeRef.current.startX;
    const dy = event.clientY - swipeRef.current.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!swipeRef.current.isHorizontalDrag) {
      if (absDy >= 12 && absDy > absDx * 1.2) {
        resetSwipe();
        return;
      }
      if (absDx >= 12 && absDx > absDy * 1.2) {
        swipeRef.current.isHorizontalDrag = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (swipeRef.current.isHorizontalDrag) {
      event.preventDefault();
    }
  };

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    if (swipeRef.current.pointerId !== event.pointerId) return;

    const dx = swipeRef.current.lastX - swipeRef.current.startX;
    const dy = swipeRef.current.lastY - swipeRef.current.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const SWIPE_THRESHOLD_PX = 50;
    const isSwipe =
      swipeRef.current.isHorizontalDrag && absDx >= SWIPE_THRESHOLD_PX && absDx > absDy * 1.5;

    resetSwipe();
    if (!isSwipe) return;

    if (dx < 0) {
      if (canNext) onNext();
    } else {
      if (canPrev) onPrev();
    }
  };

  const handlePointerCancel: PointerEventHandler<HTMLDivElement> = (event) => {
    if (swipeRef.current.pointerId !== event.pointerId) return;
    resetSwipe();
  };

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
            disabled={!canPrev}
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
            disabled={!canNext}
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
      <div
        className={stageClassName}
        data-testid="preview-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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
      </div>
    </ModalDialog>
  );
}
