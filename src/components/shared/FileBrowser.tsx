import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClient, ApiError } from "../../api/client";
import type { FileEntry } from "../../types";
import { formatFileSize } from "../../lib/format";
import { useSessionStore } from "../../lib/sessionStore";

type FileBrowserMode = "admin" | "guest";

type FileBrowserProps = {
  subdomain: string;
  mode: FileBrowserMode;
};

type PreviewState = {
  name: string;
  url: string;
  index: number;
};

const adminBasePath = "/admin";
const guestBasePath = "/";

const getFolderFromLocation = (mode: FileBrowserMode): string => {
  const base = mode === "admin" ? adminBasePath : guestBasePath;
  if (!window.location.pathname.startsWith(base)) return "";
  const parts = window.location.pathname.substring(base.length);
  if (!parts) return "";
  const trimmed = parts.startsWith("/") ? parts.slice(1) : parts;
  return trimmed ? decodeURIComponent(trimmed) : "";
};

const navigateToFolder = (mode: FileBrowserMode, folder: string): string => {
  const base = mode === "admin" ? adminBasePath : guestBasePath;
  return folder ? `${base}${base.endsWith("/") ? "" : "/"}${encodeURIComponent(folder)}` : base;
};

export function FileBrowser({ subdomain, mode }: FileBrowserProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"good" | "bad" | "">("");
  const [isLoading, setIsLoading] = useState(true);

  const { adminToken, guestToken } = useSessionStore();
  const apiClient = useMemo(() => {
    return mode === "admin"
      ? ApiClient.withAdminToken(adminToken ?? "")
      : ApiClient.withGuestToken(guestToken ?? "");
  }, [adminToken, guestToken, mode]);

  const handleApiError = useCallback((error: unknown, defaultMessage: string) => {
    if (error instanceof ApiError) {
      setStatusMessage(error.message || defaultMessage);
      setStatusTone("bad");
    } else if (error instanceof Error) {
      setStatusMessage(error.message || defaultMessage);
      setStatusTone("bad");
    } else {
      setStatusMessage(defaultMessage);
      setStatusTone("bad");
    }
  }, []);

  const fetchFiles = useCallback(
    async (folderParam?: string, opts?: { pushHistory?: boolean; replaceHistory?: boolean }) => {
      const folder = folderParam ?? "";
      setStatusMessage("");
      setStatusTone("");
      setIsLoading(true);
      try {
        const response = await apiClient.listFiles(subdomain, { folder });
        setFiles(response.files || []);
        setFolders(response.folders || []);
        const effectiveFolder = folder || response.folder || "";
        setCurrentFolder(effectiveFolder);
        const target = navigateToFolder(mode, effectiveFolder);
        if (opts?.pushHistory) {
          window.history.pushState({}, "", target);
        } else if (opts?.replaceHistory !== false) {
          window.history.replaceState({}, "", target);
        }
      } catch (error) {
        handleApiError(error, "Dateien konnten nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, handleApiError, mode, subdomain],
  );

  const fetchFileBlob = useCallback(
    async (name: string) => {
      return await apiClient.downloadFile(subdomain, {
        filename: name,
        folder: currentFolder || undefined,
      });
    },
    [apiClient, currentFolder, subdomain],
  );

  const openPreview = useCallback(
    async (name: string) => {
      try {
        const blob = await fetchFileBlob(name);
        const url = URL.createObjectURL(blob);
        const index = files.findIndex((f) => f.name === name);
        if (preview?.url) {
          URL.revokeObjectURL(preview.url);
        }
        setPreview({ name, url, index: index >= 0 ? index : 0 });
      } catch (error) {
        handleApiError(error, "Vorschau konnte nicht geladen werden.");
      }
    },
    [fetchFileBlob, files, handleApiError, preview],
  );

  const closePreview = useCallback(() => {
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  }, [preview?.url]);

  const navigatePreview = useCallback(
    async (direction: -1 | 1) => {
      if (!preview) return;
      const newIndex = preview.index + direction;
      if (newIndex < 0 || newIndex >= files.length) return;
      const nextFile = files[newIndex];
      try {
        const blob = await fetchFileBlob(nextFile.name);
        const url = URL.createObjectURL(blob);
        if (preview.url) URL.revokeObjectURL(preview.url);
        setPreview({ name: nextFile.name, url, index: newIndex });
      } catch (error) {
        handleApiError(error, "Vorschau konnte nicht geladen werden.");
      }
    },
    [fetchFileBlob, files, handleApiError, preview],
  );

  useEffect(() => {
    if (!preview) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePreview(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigatePreview(1);
      }
      if (event.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePreview, navigatePreview, preview]);

  const downloadFile = useCallback(
    async (name: string) => {
      try {
        const blob = await fetchFileBlob(name);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        handleApiError(error, "Download fehlgeschlagen.");
      }
    },
    [fetchFileBlob, handleApiError],
  );

  const downloadZip = useCallback(async () => {
    try {
      const blob = await apiClient.downloadZip(subdomain, currentFolder || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${subdomain}-files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      handleApiError(error, "ZIP Download fehlgeschlagen.");
    }
  }, [apiClient, currentFolder, handleApiError, subdomain]);

  useEffect(() => {
    const initialFolder = getFolderFromLocation(mode);
    fetchFiles(initialFolder, { replaceHistory: false }).catch(() => {
      setStatusMessage("Server nicht erreichbar.");
      setStatusTone("bad");
      setIsLoading(false);
    });

    const onPop = () => {
      const folder = getFolderFromLocation(mode);
      setCurrentFolder(folder);
      fetchFiles(folder, { replaceHistory: false }).catch(() => {
        setStatusMessage("Server nicht erreichbar.");
        setStatusTone("bad");
      });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [fetchFiles, mode, preview?.url]);

  return (
    <div className="form-card">
      <div className="label-row">
        <h2>{currentFolder ? `Dateien im Ordner "${currentFolder}"` : "Dateien"}</h2>
        {files.length > 0 ? (
          <button className="ghost" type="button" onClick={downloadZip} disabled={isLoading}>
            Download als ZIP
          </button>
        ) : null}
      </div>
      {currentFolder ? (
        <div className="helper folder-helper">
          <span className="folder-name">Ordner: {currentFolder}</span>
          <button
            className="link-btn back-link"
            type="button"
            onClick={() => {
              fetchFiles("", { pushHistory: true });
            }}
            disabled={isLoading}
          >
            ← Zurück
          </button>
        </div>
      ) : null}
      {folders.length > 0 ? (
        <div className="folder-grid">
          {folders.map((folder) => (
            <button
              key={folder}
              className="folder-tile"
              type="button"
              onClick={() => {
                fetchFiles(folder, { pushHistory: true });
              }}
              disabled={isLoading}
            >
              📁 {folder}
            </button>
          ))}
        </div>
      ) : null}
      {files.length === 0 && folders.length === 0 ? (
        <p className="helper">{isLoading ? "Lädt…" : "Noch keine Dateien hochgeladen."}</p>
      ) : files.length === 0 ? (
        <p className="helper">In diesem Ordner sind nur Unterordner vorhanden.</p>
      ) : (
        <div className="file-grid">
          {files.map((file) => (
            <div className="file-row" key={file.name}>
              <div className="file-meta">
                <button className="link-btn" onClick={() => openPreview(file.name)}>
                  {file.name}
                </button>
                <span className="helper">
                  {formatFileSize(file.size)} | {new Date(file.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                className="icon-btn"
                type="button"
                title="Download"
                onClick={() => downloadFile(file.name)}
                disabled={isLoading}
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      )}
      {statusMessage ? (
        <p className={`helper${statusTone ? ` status ${statusTone}` : ""}`}>{statusMessage}</p>
      ) : null}
      {preview ? (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <span>
                <div className="modal-title">{preview.name}</div>
                <div className="modal-subtitle">
                  Datei {preview.index + 1} von {files.length}
                </div>
              </span>
              <div className="modal-controls">
                <button
                  className="icon-btn"
                  onClick={() => navigatePreview(-1)}
                  disabled={preview.index <= 0}
                  title="Vorherige (←)"
                >
                  ←
                </button>
                <button className="icon-btn" onClick={() => downloadFile(preview.name)} title="Download">
                  ↓
                </button>
                <button
                  className="icon-btn"
                  onClick={() => navigatePreview(1)}
                  disabled={preview.index >= files.length - 1}
                  title="Nächste (→)"
                >
                  →
                </button>
                <button className="icon-btn" onClick={closePreview} title="Schließen (Esc)">
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body">
              <img src={preview.url} alt={preview.name} className="preview-image" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
