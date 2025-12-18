import { useTranslation } from "react-i18next";
import { ApiClient } from "../../api/client";
import { formatFileSize } from "../../lib/format";
import { useUpload } from "../../hooks";
import { UploadQueue } from "../upload/UploadQueue";
import { FOLDER_REGEX } from "../../constants";

type UploadFormProps = {
  subdomain: string;
  apiClient: ApiClient;
  allowedMimeTypes: string[];
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  onRefreshFiles: () => void;
  successDismissMs?: number;
};

export function UploadForm({
  subdomain,
  apiClient,
  allowedMimeTypes,
  uploadMaxFileSizeBytes,
  uploadMaxTotalSizeBytes,
  onRefreshFiles,
  successDismissMs,
}: UploadFormProps) {
  const { t } = useTranslation();

  const {
    fileInputRef,
    fromName,
    setFromName,
    selectionStats,
    uploadSelectionWarning,
    uploadItems,
    overallProgress,
    handleFileChange,
    clearUploadItem,
    retryUploadItem,
    cancelUploadItem,
    isUploading,
  } = useUpload({
    apiClient,
    subdomain,
    allowedMimeTypes,
    uploadMaxFileSizeBytes,
    uploadMaxTotalSizeBytes,
    onRefreshFiles,
    successDismissMs,
  });

  const maxSizeExceeded =
    uploadMaxFileSizeBytes > 0 && selectionStats.maxBytes > uploadMaxFileSizeBytes;
  const totalSizeExceeded =
    uploadMaxTotalSizeBytes > 0 && selectionStats.totalBytes > uploadMaxTotalSizeBytes;
  const trimmedFromName = fromName.trim();
  const isFromNameValid = trimmedFromName.length === 0 || FOLDER_REGEX.test(trimmedFromName);
  const statusHintParts: string[] = [];
  if (maxSizeExceeded) statusHintParts.push(t("UploadForm.singleLimitExceeded"));
  if (totalSizeExceeded) statusHintParts.push(t("UploadForm.totalLimitExceeded"));
  if (isUploading) statusHintParts.push(t("UploadForm.uploading"));

  return (
    <form
      className="form-card"
      onSubmit={(event) => {
        event.preventDefault();
      }}
      data-testid="upload-form"
    >
      <div className="label-row">
        <h2 data-testid="upload-title">{t("UploadForm.title")}</h2>
      </div>
      <label className="field">
        <span>{t("UploadForm.fromLabel")}</span>
        <input
          type="text"
          placeholder={t("UploadForm.fromPlaceholder")}
          pattern="[A-Za-z0-9 -]+"
          maxLength={32}
          value={fromName}
          onChange={(event) => setFromName(event.target.value)}
          title={t("UploadForm.fromTitle")}
          disabled={isUploading}
          data-testid="upload-from-input"
        />
        <p className="hint">{t("UploadForm.fromHint")}</p>
        {!isFromNameValid ? (
          <p className="helper status bad">{t("UploadForm.fromInvalid")}</p>
        ) : null}
      </label>
      <label className="field">
        <span>{t("UploadForm.filesLabel")}</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={!isFromNameValid || isUploading}
          onChange={(event) => {
            handleFileChange(event.currentTarget.files);
          }}
          data-testid="upload-files-input"
        />
        <p className="hint">{t("UploadForm.filesHint")}</p>
        <p className={`helper${maxSizeExceeded || totalSizeExceeded ? " status bad" : ""}`}>
          {selectionStats.count ? (
            <>
              {t("UploadForm.selectionStats", {
                maxSize: formatFileSize(selectionStats.maxBytes),
                totalSize: formatFileSize(selectionStats.totalBytes),
              })}{" "}
            </>
          ) : null}
          {uploadMaxFileSizeBytes > 0
            ? t("UploadForm.limitPerFile", { limit: formatFileSize(uploadMaxFileSizeBytes) })
            : ""}{" "}
          {uploadMaxTotalSizeBytes > 0
            ? t("UploadForm.limitTotal", { limit: formatFileSize(uploadMaxTotalSizeBytes) })
            : ""}
        </p>
      </label>
      {uploadSelectionWarning ? (
        <p className="helper status bad">{uploadSelectionWarning}</p>
      ) : null}
      <UploadQueue
        items={uploadItems}
        overallProgress={overallProgress}
        onRetry={retryUploadItem}
        onClear={clearUploadItem}
        onCancel={cancelUploadItem}
        t={t}
      />
      {statusHintParts.length ? (
        <p className={`helper${maxSizeExceeded || totalSizeExceeded ? " status bad" : ""}`}>
          {statusHintParts.join(" ")}
        </p>
      ) : null}
    </form>
  );
}
