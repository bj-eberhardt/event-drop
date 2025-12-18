import type { FileEntry } from "../../types";
import { FileRow } from "./FileRow";
import type { TFunction } from "i18next";

type FileListProps = {
  files: FileEntry[];
  canDelete: boolean;
  isLoading: boolean;
  onOpenPreview: (name: string) => void;
  onDownload: (name: string) => void;
  onRequestDelete: (name: string) => void;
  t: TFunction;
};

export function FileList({
  files,
  canDelete,
  isLoading,
  onOpenPreview,
  onDownload,
  onRequestDelete,
  t,
}: FileListProps) {
  if (!files || files.length === 0) return null;

  return (
    <div className="file-grid" data-testid="file-list">
      {files.map((file) => (
        <FileRow
          key={file.name}
          file={file}
          canDelete={canDelete}
          isLoading={isLoading}
          onOpenPreview={onOpenPreview}
          onDownload={onDownload}
          onRequestDelete={onRequestDelete}
          t={t}
        />
      ))}
    </div>
  );
}
