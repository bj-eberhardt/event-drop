import { useTranslation } from "react-i18next";
import { useFileBrowser } from "../hooks/useFileBrowser";
import { FileList } from "./FileList";
import { ArchiveIcon, FolderIcon, RenameIcon } from "../../../components/ui/icons";

type FileBrowserMode = "admin" | "guest";

type FileBrowserProps = {
  eventId: string;
  mode: FileBrowserMode;
};

export function FileBrowser({ eventId, mode }: FileBrowserProps) {
  const { t } = useTranslation();
  const {
    files,
    folders,
    currentFolder,
    statusMessage,
    statusTone,
    isLoading,
    isZipDownloading,
    zipStatusMessage,
    zipStatusTone,
    fetchFiles,
    openPreview,
    downloadFile,
    downloadZip,
    requestDelete,
    openRename,
    previewModal,
    deleteDialog,
    renameDialog,
  } = useFileBrowser({ eventId, mode });
  const canDelete = mode === "admin";
  const canRename = mode === "admin";

  return (
    <div className="form-card" data-testid={`filebrowser-${mode}`}>
      <div className="label-row">
        <h2>
          {currentFolder
            ? t("FileBrowser.titleFolder", { folder: currentFolder })
            : t("FileBrowser.titleRoot")}
        </h2>
        {files.length > 0 || folders.length > 0 ? (
          <button
            className="ghost icon-text-btn"
            type="button"
            onClick={downloadZip}
            disabled={isLoading || isZipDownloading}
            aria-label={t("FileBrowser.downloadZip")}
            data-testid="filebrowser-download-zip"
          >
            {isZipDownloading ? (
              <span className="zip-download-spinner" aria-hidden />
            ) : (
              <ArchiveIcon />
            )}
            {isZipDownloading ? t("FileBrowser.zipDownloading") : t("FileBrowser.downloadZip")}
          </button>
        ) : null}
      </div>
      {zipStatusMessage ? (
        <p
          className={`helper${zipStatusTone ? ` status ${zipStatusTone}` : ""}`}
          data-testid="zip-download-status"
        >
          {zipStatusMessage}
        </p>
      ) : null}
      {currentFolder ? (
        <div className="helper folder-helper">
          <span className="folder-name">
            {t("FileBrowser.folderName", { folder: currentFolder })}
          </span>
          <button
            className="link-btn back-link"
            type="button"
            onClick={() => {
              fetchFiles("", { pushHistory: true });
            }}
            disabled={isLoading}
            data-testid="filebrowser-back"
          >
            {t("FileBrowser.back")}
          </button>
        </div>
      ) : null}
      {folders.length > 0 ? (
        <div className="folder-grid" data-testid="filebrowser-folders">
          {folders.map((folder) => (
            <div key={folder} className="folder-tile" data-testid="filebrowser-folder">
              <button
                className="folder-tile-button"
                type="button"
                onClick={() => {
                  fetchFiles(folder, { pushHistory: true });
                }}
                disabled={isLoading}
                title={folder}
              >
                <FolderIcon />
                <span className="folder-tile-name">{folder}</span>
              </button>
              {canRename ? (
                <button
                  className="icon-btn folder-rename-btn"
                  type="button"
                  onClick={() => openRename(folder)}
                  disabled={isLoading}
                  title={t("FileBrowser.renameAction")}
                  aria-label={t("FileBrowser.renameAction")}
                  data-testid="filebrowser-folder-rename"
                >
                  <RenameIcon />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {files.length === 0 && folders.length === 0 ? (
        <p className="helper">{isLoading ? t("FileBrowser.loading") : t("FileBrowser.noFiles")}</p>
      ) : files.length === 0 ? (
        <p className="helper">{t("FileBrowser.onlyFolders")}</p>
      ) : (
        <FileList
          files={files}
          canDelete={canDelete}
          isLoading={isLoading}
          onOpenPreview={openPreview}
          onDownload={downloadFile}
          onRequestDelete={requestDelete}
          t={t}
        />
      )}
      {statusMessage ? (
        <p className={`helper${statusTone ? ` status ${statusTone}` : ""}`}>{statusMessage}</p>
      ) : null}
      {previewModal}
      {deleteDialog}
      {renameDialog}
    </div>
  );
}
