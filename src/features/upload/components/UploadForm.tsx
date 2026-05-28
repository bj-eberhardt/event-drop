import { useTranslation } from "react-i18next";
import { ApiClient } from "../../../api/client";
import { formatFileSize } from "../../../lib/format";
import { useUpload } from "../hooks/useUpload";
import { UploadQueue } from "./UploadQueue";
import {
  FOLDER_PATTERN,
  isFolderNameValid,
  isOptionalFolderNameValid,
} from "../../../lib/folderValidation";

type UploadFormProps = {
  eventId: string;
  apiClient: ApiClient;
  allowedMimeTypes: string[];
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  uploadFolderHint?: string | null;
  requireUploadFolder?: boolean;
  fixedFromName?: string;
  onRefreshFiles: () => void;
  successDismissMs?: number;
};

export function UploadForm({
  eventId,
  apiClient,
  allowedMimeTypes,
  uploadMaxFileSizeBytes,
  uploadMaxTotalSizeBytes,
  uploadFolderHint,
  requireUploadFolder = false,
  fixedFromName,
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
    batchDoneCount,
    batchTotalCount,
    overallProgress,
    pauseUploadItem,
    resumeUploadItem,
    pauseAll,
    resumeAll,
    retryAll,
    handleFileChange,
    clearUploadItem,
    retryUploadItem,
    cancelUploadItem,
    isUploading,
  } = useUpload({
    apiClient,
    eventId,
    allowedMimeTypes,
    uploadMaxFileSizeBytes,
    uploadMaxTotalSizeBytes,
    onRefreshFiles,
    successDismissMs,
    initialFromName: fixedFromName,
  });

  const maxSizeExceeded =
    uploadMaxFileSizeBytes > 0 && selectionStats.maxBytes > uploadMaxFileSizeBytes;
  const totalSizeExceeded =
    uploadMaxTotalSizeBytes > 0 && selectionStats.totalBytes > uploadMaxTotalSizeBytes;
  const isFromNameValid = requireUploadFolder
    ? isFolderNameValid(fromName)
    : isOptionalFolderNameValid(fromName);
  const effectiveUploadFolderHint = uploadFolderHint?.trim();
  const fixedFrom = fixedFromName?.trim() || "";
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
        <span>{effectiveUploadFolderHint ? "Ordnername" : t("UploadForm.fromLabel")}</span>
        <input
          type="text"
          placeholder={t("UploadForm.fromPlaceholder")}
          pattern={FOLDER_PATTERN}
          maxLength={32}
          value={fromName}
          onChange={(event) => setFromName(event.target.value)}
          title={t("UploadForm.fromTitle")}
          disabled={Boolean(fixedFrom) || isUploading}
          readOnly={Boolean(fixedFrom)}
          data-testid="upload-from-input"
        />
        {fixedFrom ? (
          <p className="hint">{t("UploadForm.fromLockedHint", { folder: fixedFrom })}</p>
        ) : effectiveUploadFolderHint ? (
          <p className="hint">{effectiveUploadFolderHint}</p>
        ) : (
          <p className="hint">{t("UploadForm.fromHint")}</p>
        )}
        {!isFromNameValid ? (
          <p className="helper status bad">
            {requireUploadFolder && fromName.trim().length === 0
              ? t("UploadForm.fromRequired")
              : t("UploadForm.fromInvalid")}
          </p>
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
        doneCount={batchDoneCount}
        totalCount={batchTotalCount}
        onPauseItem={pauseUploadItem}
        onResumeItem={resumeUploadItem}
        onPauseAll={pauseAll}
        onResumeAll={resumeAll}
        onRetryAll={retryAll}
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
