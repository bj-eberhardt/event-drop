import type { TFunction } from "i18next";
import { formatFileSize } from "../../lib/format";
import type { UploadItem } from "../../hooks/useUpload";
import { useUploadQueue } from "../../hooks/useUploadQueue";

type UploadQueueProps = {
  items: UploadItem[];
  overallProgress: number;
  onRetry: (id: string) => void;
  onClear: (id: string) => void;
  onCancel: (id: string) => void;
  t: TFunction;
};

export function UploadQueue({
  items,
  overallProgress,
  onRetry,
  onClear,
  onCancel,
  t,
}: UploadQueueProps) {
  const { viewItems, doneCount, totalCount } = useUploadQueue(items, t);

  if (viewItems.length === 0) return null;

  return (
    <div className="upload-queue">
      <p className="helper">
        {t("UploadForm.queueSummary", {
          progress: overallProgress,
          done: doneCount,
          total: totalCount,
        })}
      </p>
      <div className="upload-list">
        {viewItems.map((item) => (
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
