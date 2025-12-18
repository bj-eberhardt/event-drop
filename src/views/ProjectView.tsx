import { useEffect, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { mainDomain } from "../constants";
import { ProjectMeta } from "../types";
import { useSessionStore } from "../lib/sessionStore";
import { FileBrowser } from "../components/shared/FileBrowser";
import { UploadForm } from "../components/project/UploadForm";
import { PasswordPrompt } from "../components/shared/PasswordPrompt";

type ProjectStatus = "loading" | "found" | "missing" | "error" | "locked";
type ProjectViewProps = {
  subdomain: string;
  onBackHome: () => void;
  onAdmin: () => void;
};

export function ProjectView({ subdomain, onBackHome, onAdmin }: ProjectViewProps) {
  const [status, setStatus] = useState<ProjectStatus>("loading");
  const [data, setData] = useState<ProjectMeta | null>(null);
  const [message, setMessage] = useState("");
  const [guestError, setGuestError] = useState("");
  const [fileBrowserRefresh, setFileBrowserRefresh] = useState(0);

  const { guestToken, setGuestToken } = useSessionStore();

  let apiClient = ApiClient.withGuestToken(guestToken ?? "");

  const fetchProject = async () => {
    setMessage("");
    try {
      const project = await apiClient.getProject(subdomain);
      setData({
        name: project.name,
        description: project.description,
        eventId: project.eventId,
        secured: Boolean(project.secured),
        allowGuestDownload: Boolean(project.allowGuestDownload),
        allowedMimeTypes: project.allowedMimeTypes || [],
        uploadMaxFileSizeBytes: project.uploadMaxFileSizeBytes,
        uploadMaxTotalSizeBytes: project.uploadMaxTotalSizeBytes,
      });
      setStatus("found");
    } catch (error) {
      let errMessage = "Projekt konnte nicht geladen werden.";

      if (error instanceof ApiError) {
        errMessage = error.message || errMessage;

        if (error.status === 404) {
          setStatus("missing");
          return;
        }

        if (error.status === 401 || error.status === 403) {
          setStatus("locked");
          setGuestError(errMessage || "Gaeste-Passwort erforderlich.");
          return;
        }
      } else if (error instanceof Error) {
        errMessage = error.message || errMessage;
        if (errMessage === "Projekt nicht gefunden.") {
          setStatus("missing");
          return;
        }
      }

      setStatus("error");
      setMessage(errMessage);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus("loading");
      try {
        await fetchProject();
      } catch (_error) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Server nicht erreichbar.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const submitGuestPassword = async (password: string) => {
    setGuestError("");
    try {
      setGuestToken(password);
      apiClient = ApiClient.withGuestToken(password);
      await fetchProject();
    } catch (_error) {
      setStatus("error");
      setMessage("Server nicht erreichbar.");
    }
  };


  if (status === "loading") {
    return (
      <main className="form-page">
        <h1>Projekt wird geladen…</h1>
      </main>
    );
  }

  if (status === "missing") {
    return (
      <main className="form-page">
        <h1>Projekt nicht gefunden</h1>
        <p className="lede">Die Subdomain {subdomain} ist nicht hinterlegt.</p>
        <div className="actions">
          <button className="primary" onClick={onBackHome}>
            Zur Startseite
          </button>
        </div>
      </main>
    );
  }

  if (status === "locked") {
    return (
      <PasswordPrompt
        title="Gaeste-Passwort erforderlich"
        description={`Bitte gib das Gaeste-Passwort fuer ${subdomain} ein.`}
        passwordLabel="Gaeste-Passwort"
        onSubmit={submitGuestPassword}
        primaryLabel="Weiter"
        secondaryLabel="Zurueck"
        onSecondary={onBackHome}
        message={guestError}
      />
    );
  }

  if (status === "error") {
    return (
      <main className="form-page">
        <h1>Fehler</h1>
        <p className="lede">{message}</p>
        <div className="actions">
          <button className="primary" onClick={onBackHome}>
            Zur Startseite
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="form-page">
      <header className="form-header">
        <p className="eyebrow">Projekt</p>
        <h1>{data?.name || `Uploads für ${data?.eventId}.${mainDomain}`}</h1>
        <p className="lede">
          {data?.description || `${data?.eventId}.${mainDomain}`}
        </p>
       
      </header>
      <UploadForm
        subdomain={subdomain}
        apiClient={apiClient}
        allowedMimeTypes={data?.allowedMimeTypes || []}
        uploadMaxFileSizeBytes={data?.uploadMaxFileSizeBytes ?? 0}
        uploadMaxTotalSizeBytes={data?.uploadMaxTotalSizeBytes ?? 0}
        onRefreshFiles={() => setFileBrowserRefresh((key) => key + 1)}
      />
      {data?.allowGuestDownload ? (
        <FileBrowser key={fileBrowserRefresh} subdomain={subdomain} mode="guest" />
      ) : null}
      <div className="actions">
        <button className="ghost" onClick={onAdmin}>
          Admin Login
        </button>
        <button className="ghost" onClick={onBackHome}>
          Zur Startseite
        </button>
      </div>
    </main>
  );
}
