import type { TFunction } from "i18next";
import { formatFileSize } from "../../../lib/format";
import type { UploadItem } from "../hooks/useUpload";
import { useUploadQueue } from "../hooks/useUploadQueue";

type UploadQueueProps = {
  items: UploadItem[];
  overallProgress: number;
  doneCount: number;
  totalCount: number;
  onPauseItem: (id: string) => void;
  onResumeItem: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onRetryAll: () => void;
  onRetry: (id: string) => void;
  onClear: (id: string) => void;
  onCancel: (id: string) => void;
  t: TFunction;
};

export function UploadQueue({
  items,
  overallProgress,
  doneCount,
  totalCount,
  onPauseItem,
  onResumeItem,
  onPauseAll,
  onResumeAll,
  onRetryAll,
  onRetry,
  onClear,
  onCancel,
  t,
}: UploadQueueProps) {
  const { queueItems } = useUploadQueue(items, t);

  if (queueItems.length === 0) return null;

  const hasActive = queueItems.some(
    (item) => item.status === "queued" || item.status === "uploading"
  );
  const hasPaused = queueItems.some((item) => item.status === "paused");
  const hasRetryableErrors = queueItems.some((item) => item.status === "error" && item.canRetry);

  return (
    <div className="upload-queue">
      <div className="upload-queue-header">
        <p className="helper" data-testid="upload-queue-summary">
          {t("UploadForm.queueSummary", {
            progress: overallProgress,
            done: doneCount,
            total: totalCount,
          })}
        </p>
        <div className="upload-queue-controls">
          {hasRetryableErrors ? (
            <button
              type="button"
              className="ghost"
              onClick={onRetryAll}
              data-testid="upload-retry-all"
            >
              {t("UploadForm.retryAll")}
            </button>
          ) : null}
          {hasActive ? (
            <button
              type="button"
              className="ghost"
              onClick={onPauseAll}
              data-testid="upload-pause-all"
            >
              {t("UploadForm.pauseAll")}
            </button>
          ) : null}
          {hasPaused ? (
            <button
              type="button"
              className="ghost"
              onClick={onResumeAll}
              data-testid="upload-resume-all"
            >
              {t("UploadForm.resumeAll")}
            </button>
          ) : null}
        </div>
      </div>
      <div className="upload-list">
        {queueItems.map((item) => (
          <div
            key={item.id}
            className={`upload-item upload-${item.status}`}
            data-testid="upload-item"
          >
            <div className="upload-info">
              <div className="upload-name">{item.name}</div>
              <div className="upload-meta">
                <span className={`upload-status ${item.status}`} data-testid="upload-status">
                  {item.statusLabel}
                </span>
                <span className="upload-size">{formatFileSize(item.totalBytes)}</span>
              </div>
            </div>
            <div className="upload-progress">
              <div className="upload-progress-track">
                <div className="upload-progress-bar" style={{ width: `${item.progress}%` }} />
              </div>
              <span className="upload-progress-label">{item.progress}%</span>
            </div>
            {item.status === "error" && item.message ? (
              <span className="upload-message" data-testid="upload-message">
                {item.message}
              </span>
            ) : null}
            <div className="upload-actions">
              {item.status === "uploading" ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onPauseItem(item.id)}
                  data-testid="upload-pause"
                >
                  {t("UploadForm.pause")}
                </button>
              ) : null}
              {item.status === "paused" ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onResumeItem(item.id)}
                  data-testid="upload-resume"
                >
                  {t("UploadForm.resume")}
                </button>
              ) : null}
              {item.showCancel ? (
                <button type="button" className="ghost" onClick={() => onCancel(item.id)}>
                  {t("UploadForm.cancel")}
                </button>
              ) : null}
              {item.status === "error" ? (
                <>
                  {item.canRetry ? (
                    <button type="button" className="ghost" onClick={() => onRetry(item.id)}>
                      {t("UploadForm.retry")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onClear(item.id)}
                    aria-label={t("UploadForm.clear")}
                    title={t("UploadForm.clear")}
                    data-testid="upload-clear"
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
