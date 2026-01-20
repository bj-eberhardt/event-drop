import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClient, ApiError } from "../../api/client";
import { EventMeta } from "../../types";
import { useSessionStore } from "../../lib/sessionStore";
import { FileBrowser } from "../files/components/FileBrowser";
import { UploadForm } from "../upload/components/UploadForm";
import { PasswordPrompt } from "../../shared/components/PasswordPrompt";
import { useApiClient } from "../../shared/hooks/useApiClient";

type EventStatus = "loading" | "found" | "missing" | "error" | "locked";
type EventViewProps = {
  eventId: string;
  baseDomain: string;
  onBackHome: () => void;
  onAdmin: () => void;
};

export function EventView({ eventId, baseDomain, onBackHome, onAdmin }: EventViewProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EventStatus>("loading");
  const [data, setData] = useState<EventMeta | null>(null);
  const [message, setMessage] = useState("");
  const [guestError, setGuestError] = useState("");
  const [fileBrowserRefresh, setFileBrowserRefresh] = useState(0);
  const [loginAttempt, setLoginAttempt] = useState(0);
  const hasVerifiedAccessRef = useRef(false);
  const accessRequestRef = useRef<Promise<void> | null>(null);
  const lastAccessKeyRef = useRef<string | null>(null);

  const { guestToken, setGuestToken } = useSessionStore();
  const apiClient = useApiClient("guest");

  const fetchEvent = useCallback(
    async (client: ApiClient = apiClient) => {
      setMessage("");
      try {
        const eventInfo = await client.getEvent(eventId);
        setData({
          name: eventInfo.name,
          description: eventInfo.description,
          eventId: eventInfo.eventId,
          secured: Boolean(eventInfo.secured),
          allowGuestDownload: Boolean(eventInfo.allowGuestDownload),
          allowGuestUpload: eventInfo.allowGuestUpload ?? true,
          allowedMimeTypes: eventInfo.allowedMimeTypes || [],
          uploadMaxFileSizeBytes: eventInfo.uploadMaxFileSizeBytes,
          uploadMaxTotalSizeBytes: eventInfo.uploadMaxTotalSizeBytes,
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
            const isFirstAttempt = !hasVerifiedAccessRef.current;
            setGuestError(
              isFirstAttempt
                ? t("AdminView.loginRequired")
                : t("EventView.lockedDescription", { subdomain: eventId })
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
    [apiClient, eventId, t]
  );

  useEffect(() => {
    const accessKey = `${eventId}:${guestToken ?? ""}:${loginAttempt}`;
    if (lastAccessKeyRef.current === accessKey) return;
    if (!accessRequestRef.current) {
      lastAccessKeyRef.current = accessKey;
      accessRequestRef.current = (async () => {
        setStatus("loading");
        try {
          await fetchEvent();
        } catch {
          setStatus("error");
          setMessage(t("AdminView.serverUnavailable"));
        } finally {
          hasVerifiedAccessRef.current = true;
          accessRequestRef.current = null;
        }
      })();
    }
  }, [eventId, fetchEvent, guestToken, loginAttempt, t]);

  const submitGuestPassword = async (password: string) => {
    setGuestError("");
    try {
      lastAccessKeyRef.current = null;
      setGuestToken(password);
      setLoginAttempt((value) => value + 1);
    } catch {
      setStatus("error");
      setMessage(t("AdminView.serverUnavailable"));
    }
  };

  const handleGuestLogout = async () => {
    setGuestToken(null);
    lastAccessKeyRef.current = null;
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
        <p className="lede">{t("EventView.missingDescription", { subdomain: eventId })}</p>
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
        description={t("EventView.lockedDescription", { subdomain: eventId })}
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
      {data?.allowGuestUpload !== false ? (
        <UploadForm
          eventId={eventId}
          apiClient={apiClient}
          allowedMimeTypes={data?.allowedMimeTypes || []}
          uploadMaxFileSizeBytes={data?.uploadMaxFileSizeBytes ?? 0}
          uploadMaxTotalSizeBytes={data?.uploadMaxTotalSizeBytes ?? 0}
          onRefreshFiles={() => setFileBrowserRefresh((key) => key + 1)}
        />
      ) : null}
      {data?.allowGuestDownload ? (
        <FileBrowser key={fileBrowserRefresh} eventId={eventId} mode="guest" />
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
