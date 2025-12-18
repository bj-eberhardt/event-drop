import { FormEvent, useCallback, useRef, useState } from "react";
import { ApiClient } from "../../api/client";
import { formatFileSize } from "../../lib/format";

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadFormProps = {
  subdomain: string;
  apiClient: ApiClient;
  allowedMimeTypes: string[];
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  onRefreshFiles: () => void;
};

export function UploadForm({
  subdomain,
  apiClient,
  allowedMimeTypes,
  uploadMaxFileSizeBytes,
  uploadMaxTotalSizeBytes,
  onRefreshFiles,
}: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fromName, setFromName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadSelectionWarning, setUploadSelectionWarning] = useState("");
  const [selectionStats, setSelectionStats] = useState({
    count: 0,
    totalBytes: 0,
    maxBytes: 0,
  });

  const matchesMime = useCallback((mime: string, allowedList: string[]) => {
    if (!allowedList.length) return true;
    return allowedList.some((allowedType) => {
      if (!allowedType.includes("*")) return mime === allowedType;
      const [allowedMain] = allowedType.split("/");
      const [main] = mime.split("/");
      return allowedMain && allowedMain === main;
    });
  }, []);

  const validateFiles = useCallback(
    (fileList: FileList | null) => {
      const allowed = allowedMimeTypes || [];
      const accepted: File[] = [];
      const rejected: string[] = [];
      if (!fileList) return { accepted, rejected };
      Array.from(fileList).forEach((file) => {
        if (matchesMime(file.type || "", allowed)) {
          accepted.push(file);
        } else {
          rejected.push(file.name);
        }
      });
      return { accepted, rejected };
    },
    [allowedMimeTypes, matchesMime],
  );

  const updateSelectionStats = useCallback((fileList: FileList | null) => {
    if (!fileList) {
      setSelectionStats({ count: 0, totalBytes: 0, maxBytes: 0 });
      return;
    }
    let totalBytes = 0;
    let maxBytes = 0;
    let count = 0;
    Array.from(fileList).forEach((file) => {
      count += 1;
      totalBytes += file.size;
      if (file.size > maxBytes) maxBytes = file.size;
    });
    setSelectionStats({ count, totalBytes, maxBytes });
  }, []);

  const maxSizeExceeded =
    uploadMaxFileSizeBytes > 0 && selectionStats.maxBytes > uploadMaxFileSizeBytes;
  const totalSizeExceeded =
    uploadMaxTotalSizeBytes > 0 && selectionStats.totalBytes > uploadMaxTotalSizeBytes;

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (maxSizeExceeded) {
      setUploadStatus("error");
      setUploadMessage("Die groesste Datei ueberschreitet das Upload-Limit.");
      return;
    }
    if (totalSizeExceeded) {
      setUploadStatus("error");
      setUploadMessage("Die Gesamtgroesse ueberschreitet das Upload-Limit.");
      return;
    }
    setUploadStatus("uploading");
    setUploadMessage("");
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setUploadStatus("error");
      setUploadMessage("Bitte mindestens eine Datei auswaehlen.");
      return;
    }

    const { accepted, rejected } = validateFiles(files);
      setUploadSelectionWarning(rejected.length ? `Nicht erlaubt: ${rejected.join(", ")}` : "");

    if (accepted.length === 0) {
      setUploadStatus("error");
      setUploadMessage(
        rejected.length
          ? `Keine Dateien hochgeladen. Nicht erlaubt: ${rejected.join(", ")}`
          : "Keine Dateien ausgewaehlt.",
      );
      return;
    }

    try {
      const response = await apiClient.uploadFiles(subdomain, {
        files: accepted,
        from: fromName.trim() || undefined,
      });
      const rejectedNames = response.rejected?.map((r) => r.file) || rejected;
      const uploadedCount = response.uploaded ?? accepted.length;
      const messageParts = [`${uploadedCount} Datei(en) erfolgreich hochgeladen.`];
      if (rejectedNames.length) {
        messageParts.push(`Nicht erlaubt: ${rejectedNames.join(", ")}`);
      }
      setUploadStatus(rejectedNames.length ? "error" : "success");
      setUploadMessage(messageParts.join(" "));
      if (!rejectedNames.length) {
        setUploadSelectionWarning("");
      }
      if (uploadedCount > 0) {
        onRefreshFiles();
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        updateSelectionStats(null);
      }
    } catch (error) {
      setUploadStatus("error");
      const errMessage = error instanceof Error ? error.message : "Server nicht erreichbar.";
      setUploadMessage(errMessage);
    }
  };

  return (
    <form className="form-card" onSubmit={handleUpload}>
      <div className="label-row">
        <h2>Dateien hochladen</h2>
      </div>
      <label className="field">
        <span>Dateien</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(event) => {
            const { accepted, rejected } = validateFiles(event.currentTarget.files);
            const files = event.currentTarget.files;
            updateSelectionStats(files);
            setUploadSelectionWarning(
              rejected.length
                ? `Nicht erlaubt: ${rejected.join(", ")}. Diese Dateien werden uebersprungen.`
                : "",
            );
            if (!accepted.length && rejected.length) {
              setUploadStatus("error");
              setUploadMessage(`Keine Dateien hochgeladen. Nicht erlaubt: ${rejected.join(", ")}`);
            } else if (files && (uploadMaxFileSizeBytes > 0 || uploadMaxTotalSizeBytes > 0)) {
              let maxSize = 0;
              let totalSize = 0;
              Array.from(files).forEach((file) => {
                totalSize += file.size;
                if (file.size > maxSize) maxSize = file.size;
              });
              if (uploadMaxFileSizeBytes > 0 && maxSize > uploadMaxFileSizeBytes) {
                setUploadStatus("error");
                setUploadMessage("Die groesste Datei ueberschreitet das Upload-Limit.");
              } else if (uploadMaxTotalSizeBytes > 0 && totalSize > uploadMaxTotalSizeBytes) {
                setUploadStatus("error");
                setUploadMessage("Die Gesamtgroesse ueberschreitet das Upload-Limit.");
              } else {
                setUploadStatus("idle");
                setUploadMessage("");
              }
            } else {
              setUploadStatus("idle");
              setUploadMessage("");
            }
          }}
        />
        <p className={`helper${maxSizeExceeded || totalSizeExceeded ? " status bad" : ""}`}>
          {selectionStats.count ? (
            <>
              Groesste Datei: {formatFileSize(selectionStats.maxBytes)}. Gesamtgroesse:{" "}
              {formatFileSize(selectionStats.totalBytes)}.{" "}
            </>
          ) : null}
          {uploadMaxFileSizeBytes > 0
            ? `Limit pro Datei: ${formatFileSize(uploadMaxFileSizeBytes)}.`
            : ""}{" "}
          {uploadMaxTotalSizeBytes > 0
            ? `Limit gesamt: ${formatFileSize(uploadMaxTotalSizeBytes)}.`
            : ""}
        </p>
      </label>
      {uploadSelectionWarning ? <p className="helper status bad">{uploadSelectionWarning}</p> : null}
      <label className="field">
        <span>Von (optional)</span>
        <input
          type="text"
          placeholder="Name"
          pattern="[A-Za-z0-9 ]+"
          value={fromName}
          onChange={(event) => setFromName(event.target.value)}
          title="Nur Buchstaben, Zahlen und Leerzeichen"
        />
      </label>
      {uploadMessage ? (
        <p className={`helper ${uploadStatus === "error" ? "status bad" : "status good"}`}>
          {uploadMessage}
        </p>
      ) : null}
      <div className="actions">
        {uploadStatus === "uploading" ? (
          <p className="helper" style={{ marginRight: "auto" }}>
            Upload laeuft...
          </p>
        ) : null}
        <button
          type="submit"
          className="primary"
          disabled={uploadStatus === "uploading" || maxSizeExceeded || totalSizeExceeded}
        >
          {uploadStatus === "uploading" ? "Laedt..." : "Hochladen"}
        </button>
      </div>
    </form>
  );
}
