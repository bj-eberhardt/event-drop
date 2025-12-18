import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import type { ProjectInfo } from "../api/types";
import { mainDomain } from "../constants";
import { useSessionStore } from "../lib/sessionStore";
import { redirectToHome } from "../lib/navigation";
import { AdminSettings } from "../components/admin/AdminSettings";
import { DeleteProjectSection } from "../components/admin/DeleteProjectSection";
import { FileBrowser } from "../components/shared/FileBrowser";
import { PasswordPrompt } from "../components/shared/PasswordPrompt";

type AdminStatus = "loading" | "locked" | "ready" | "error";

type AdminViewProps = {
  subdomain: string;
  onBackProject: () => void;
};

export function AdminView({ subdomain, onBackProject }: AdminViewProps) {
  const [status, setStatus] = useState<AdminStatus>("loading");
  const [message, setMessage] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [projectSettings, setProjectSettings] = useState<ProjectInfo | null>(null);

  const { adminToken, setAdminToken, setGuestToken } = useSessionStore();
  const apiClient = useMemo(() => ApiClient.withAdminToken(adminToken ?? ""), [adminToken]);

  const handleApiError = useCallback(
    (error: unknown, defaultMessage: string) => {
      if (error instanceof ApiError) {
        const errMessage = error.message || defaultMessage;

        if (error.status === 401 || error.status === 403) {
          setStatus("locked");
          setMessage(errMessage || "Admin-Passwort erforderlich.");
          return;
        }

        if (error.status >= 500) {
          setStatus("error");
          setMessage("Serverfehler. Bitte später erneut versuchen.");
          return;
        }

        setMessage(errMessage);
      } else if (error instanceof Error) {
        setMessage(error.message || defaultMessage);
      } else {
        setMessage(defaultMessage);
      }
    },
    [],
  );

  const verifyAdminAccess = useCallback(async () => {
    setMessage("");
    setStatus("loading");
    try {
      await apiClient.listFiles(subdomain);
      setStatus("ready");
    } catch (error) {
      if (error instanceof ApiError) {
        const errMessage = error.message || "Dateien konnten nicht geladen werden.";
        setMessage(errMessage);
        if (error.status === 401 || error.status === 403) {
          setStatus("locked");
          return;
        }
        setStatus("error");
        return;
      }
      const errMessage = error instanceof Error ? error.message : "Dateien konnten nicht geladen werden.";
      setMessage(errMessage);
      setStatus("error");
    }
  }, [apiClient, subdomain]);

  const loadProjectSettings = useCallback(async () => {
    setSettingsLoadError("");
    try {
      const project = await apiClient.getProject(subdomain);
      const secured = Boolean(project.secured);
      const allowDownload = Boolean(project.allowGuestDownload && secured);
      setProjectSettings({
        ...project,
        secured,
        allowGuestDownload: allowDownload,
      });
    } catch (error) {
      handleApiError(error, "Projekt-Einstellungen konnten nicht geladen werden.");
      const errMessage =
        error instanceof Error ? error.message : "Projekt-Einstellungen konnten nicht geladen werden.";
      setSettingsLoadError(errMessage);
    } finally {
      setSettingsLoading(false);
    }
  }, [apiClient, handleApiError, subdomain]);

  const handleProjectSettingsUpdate = useCallback((updated: ProjectInfo) => {
    setProjectSettings(updated);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setAdminToken(null);
    setGuestToken(null);
    redirectToHome();
  }, [setAdminToken]);

  useEffect(() => {
    verifyAdminAccess().catch(() => {
      setStatus("error");
      setMessage("Server nicht erreichbar.");
    });
  }, [verifyAdminAccess]);

  useEffect(() => {
    if (status !== "ready") return;
    setSettingsLoading(true);
    loadProjectSettings().catch(() => {
      setSettingsLoadError("Projekt-Einstellungen konnten nicht geladen werden.");
      setSettingsLoading(false);
    });
  }, [loadProjectSettings, status]);

  const submitAdminPassword = (password: string) => {
    setMessage("");
    setAdminToken(password);
  };

  if (status === "loading") {
    return (
      <main className="form-page">
        <h1>Lädt…</h1>
      </main>
    );
  }

  if (status === "locked") {
    return (
      <PasswordPrompt
        title="Admin Login"
        description={`Bitte gib das Admin-Passwort fuer ${subdomain} ein.`}
        passwordLabel="Admin-Passwort"
        onSubmit={(pwd) => submitAdminPassword(pwd)}
        primaryLabel="Anmelden"
        secondaryLabel="Zurueck zur Gaesteseite"
        onSecondary={onBackProject}
        message={message}
      />
    );
  }

  if (status === "error") {
    return (
      <main className="form-page">
        <h1>Fehler</h1>
        <p className="lede">{message}</p>
        <div className="actions">
          <button className="primary" onClick={onBackProject}>
            Zurück
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="form-page">
      <header className="form-header">
        <p className="eyebrow">Admin</p>
        <h1>Willkommen, Admin</h1>
        <p className="lede">Projekt: {subdomain}.{mainDomain}</p>
      </header>
      <FileBrowser subdomain={subdomain} mode="admin" />
      <div className="actions">
        <button className="ghost" onClick={onBackProject}>
          Zurück zur Projektseite
        </button>
      </div>
      {projectSettings ? (
        <AdminSettings
          apiClient={apiClient}
          subdomain={subdomain}
          project={projectSettings}
          loading={settingsLoading}
          onProjectUpdate={handleProjectSettingsUpdate}
          onGuestPasswordChanged={() => setGuestToken(null)}
        />
      ) : (
        <div className="form-card">
          <h2>Projekt-Einstellungen</h2>
          <p className={`helper${settingsLoadError ? " status bad" : ""}`}>
            {settingsLoadError || "Projekt-Einstellungen werden geladen…"}
          </p>
        </div>
      )}
      <DeleteProjectSection
        subdomain={subdomain}
        apiClient={apiClient}
        onDeleteSuccess={handleDeleteSuccess}
        onApiError={handleApiError}
      />
    </main>
  );
}
