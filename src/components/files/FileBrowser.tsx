import { useTranslation } from "react-i18next";
import { useFileBrowser } from "../../hooks";
import { FileList } from "./FileList";
import { ArchiveIcon, FolderIcon } from "../ui/icons";

type FileBrowserMode = "admin" | "guest";

type FileBrowserProps = {
  subdomain: string;
  mode: FileBrowserMode;
};

export function FileBrowser({ subdomain, mode }: FileBrowserProps) {
  const { t } = useTranslation();
  const {
    files,
    folders,
    currentFolder,
    statusMessage,
    statusTone,
    isLoading,
    fetchFiles,
    openPreview,
    downloadFile,
    downloadZip,
    requestDelete,
    previewModal,
    deleteDialog,
  } = useFileBrowser({ subdomain, mode, t });
  const canDelete = mode === "admin";

  return (
    <div className="form-card" data-testid={`filebrowser-${mode}`}>
      <div className="label-row">
        <h2>
          {currentFolder
            ? t("FileBrowser.titleFolder", { folder: currentFolder })
            : t("FileBrowser.titleRoot")}
        </h2>
        {files.length > 0 ? (
          <button
            className="ghost icon-text-btn"
            type="button"
            onClick={downloadZip}
            disabled={isLoading}
            aria-label={t("FileBrowser.downloadZip")}
          >
            <ArchiveIcon />
            {t("FileBrowser.downloadZip")}
          </button>
        ) : null}
      </div>
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
            <button
              key={folder}
              className="folder-tile"
              type="button"
              onClick={() => {
                fetchFiles(folder, { pushHistory: true });
              }}
              disabled={isLoading}
              title={folder}
              data-testid="filebrowser-folder"
            >
              <FolderIcon /> {folder}
            </button>
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
    </div>
  );
}
