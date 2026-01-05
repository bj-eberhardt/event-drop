import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClient, ApiError } from "../api/client";
import { ProjectMeta } from "../types";
import { useSessionStore } from "../lib/sessionStore";
import { FileBrowser } from "../components/files";
import { UploadForm } from "../components/project/UploadForm";
import { PasswordPrompt } from "../components/shared";

type EventStatus = "loading" | "found" | "missing" | "error" | "locked";
type EventViewProps = {
  subdomain: string;
  baseDomain: string;
  onBackHome: () => void;
  onAdmin: () => void;
};

export function EventView({ subdomain, baseDomain, onBackHome, onAdmin }: EventViewProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EventStatus>("loading");
  const [data, setData] = useState<ProjectMeta | null>(null);
  const [message, setMessage] = useState("");
  const [guestError, setGuestError] = useState("");
  const [fileBrowserRefresh, setFileBrowserRefresh] = useState(0);

  const { guestToken, setGuestToken } = useSessionStore();

  const apiClient = useMemo(() => ApiClient.withGuestToken(guestToken ?? ""), [guestToken]);

  const fetchProject = useCallback(
    async (client: ApiClient = apiClient) => {
      setMessage("");
      try {
        const project = await client.getEvent(subdomain);
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
        let errMessage = t("EventView.filesLoadError");

        if (error instanceof ApiError) {
          errMessage = error.message || errMessage;

          if (error.status === 404) {
            setStatus("missing");
            return;
          }

          if (error.status === 401 || error.status === 403) {
            setGuestError(
              status == "loading"
                ? t("AdminView.loginRequired")
                : t("EventView.lockedDescription", { subdomain })
            );
            setStatus("locked");
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
    },
    [apiClient, subdomain, t]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus("loading");
      try {
        await fetchProject();
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage(t("AdminView.serverUnavailable"));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchProject, subdomain, t]);

  const submitGuestPassword = async (password: string) => {
    setGuestError("");
    try {
      setGuestToken(password);
      const nextClient = ApiClient.withGuestToken(password);
      await fetchProject(nextClient);
    } catch {
      setStatus("error");
      setMessage(t("AdminView.serverUnavailable"));
    }
  };

  const handleGuestLogout = async () => {
    setGuestToken(null);
    setStatus("loading");
    try {
      await fetchProject(ApiClient.anonymous());
    } catch {
      setStatus("error");
      setMessage(t("AdminView.serverUnavailable"));
    }
  };

  if (status === "loading") {
    return (
      <main className="form-page">
        <h1>{t("EventView.loadingTitle")}</h1>
      </main>
    );
  }

  if (status === "missing") {
    return (
      <main className="form-page">
        <h1>{t("EventView.missingTitle")}</h1>
        <p className="lede">{t("EventView.missingDescription", { subdomain })}</p>
        <div className="actions">
          <button className="primary" onClick={onBackHome} data-testid="event-back-home">
            {t("EventView.backHome")}
          </button>
        </div>
      </main>
    );
  }

  if (status === "locked") {
    return (
      <PasswordPrompt
        title={t("EventView.lockedTitle")}
        description={t("EventView.lockedDescription", { subdomain })}
        passwordLabel={t("EventView.passwordLabel")}
        onSubmit={submitGuestPassword}
        primaryLabel={t("EventView.primaryLabel")}
        secondaryLabel={t("EventView.secondaryLabel")}
        onSecondary={onBackHome}
        message={guestError}
      />
    );
  }

  if (status === "error") {
    return (
      <main className="form-page">
        <h1>{t("EventView.errorTitle")}</h1>
        <p data-testid="event-view-global-error" className="lede">
          {message}
        </p>
        <div className="actions">
          <button className="primary" onClick={onBackHome} data-testid="event-back-home">
            {t("EventView.backHome")}
          </button>
        </div>
      </main>
    );
  }

  const fallbackDomain = `${data?.eventId}.${baseDomain}`;

  return (
    <main className="form-page">
      <header className="form-header">
        <p className="eyebrow">{t("EventView.headerEyebrow")}</p>
        <h1>{data?.name || t("EventView.uploadsFallbackTitle", { domain: fallbackDomain })}</h1>
        <p className="lede">{data?.description || fallbackDomain}</p>
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
        {guestToken ? (
          <button className="ghost" onClick={handleGuestLogout} data-testid="event-logout">
            {t("EventView.logout")}
          </button>
        ) : null}
        <button className="ghost" onClick={onAdmin} data-testid="event-admin-login">
          {t("EventView.adminLogin")}
        </button>
        <button className="ghost" onClick={onBackHome} data-testid="event-back-home">
          {t("EventView.backHome")}
        </button>
      </div>
    </main>
  );
}
