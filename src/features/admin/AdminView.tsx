import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type { EventInfo } from "../../api/types";
import { useSessionStore } from "../../lib/sessionStore";
import { redirectToHome } from "../../lib/navigation";
import { buildEventUrl } from "../../lib/domain";
import { AdminSettings } from "./components/AdminSettings";
import { DeleteEventSection } from "./components/DeleteEventSection";
import { FileBrowser } from "../files/components/FileBrowser";
import { PasswordPrompt } from "../../shared/components/PasswordPrompt";
import { CopyIcon, LogoutIcon, QrIcon } from "../../components/ui/icons";
import { useTimedFeedback } from "../../shared/hooks/useTimedFeedback";
import { useApiClient } from "../../shared/hooks/useApiClient";
import { ModalDialog } from "../../components/ui/ModalDialog";
import { QRCodeCanvas } from "qrcode.react";

type AdminStatus = "loading" | "locked" | "ready" | "error";

type AdminViewProps = {
  eventId: string;
  baseDomain: string;
  supportSubdomain: boolean;
  onBackProject: () => void;
};

export function AdminView({
  eventId,
  baseDomain,
  supportSubdomain,
  onBackProject,
}: AdminViewProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AdminStatus>("loading");
  const [message, setMessage] = useState("");
  const shareFeedback = useTimedFeedback();
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [eventSettings, setEventSettings] = useState<EventInfo | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const hasVerifiedAccessRef = useRef(false);
  const accessRequestRef = useRef<Promise<void> | null>(null);

  const { setAdminToken, setGuestToken } = useSessionStore();
  const apiClient = useApiClient("admin");

  const handleApiError = useCallback(
    (error: unknown, defaultMessage: string) => {
      if (error instanceof ApiError) {
        const errMessage = error.message || defaultMessage;

        if (error.status === 401 || error.status === 403) {
          setStatus("locked");
          setMessage(t("AdminView.lockedDescription", { subdomain: eventId }));
          return;
        }

        if (error.status >= 500) {
          setStatus("error");
          setMessage(t("AdminView.serverError"));
          return;
        }

        setMessage(errMessage);
      } else if (error instanceof Error) {
        setMessage(error.message || defaultMessage);
      } else {
        setMessage(defaultMessage);
      }
    },
    [eventId, t]
  );

  const handleEventSettingsUpdate = useCallback((updated: EventInfo) => {
    setEventSettings(updated);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setAdminToken(null);
    setGuestToken(null);
    redirectToHome(baseDomain);
  }, [baseDomain, setAdminToken, setGuestToken]);

  const handleAdminLogout = useCallback(() => {
    setAdminToken(null);
    onBackProject();
  }, [onBackProject, setAdminToken]);

  const scrollToSection = useCallback((targetId: string, behavior: ScrollBehavior = "smooth") => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior, block: "start" });
      return true;
    }
    return false;
  }, []);

  const navigateToSection = useCallback(
    (targetId: string) => {
      window.history.replaceState({}, "", `#${targetId}`);
      scrollToSection(targetId, "smooth");
    },
    [scrollToSection]
  );

  useEffect(() => {
    if (!accessRequestRef.current) {
      accessRequestRef.current = (async () => {
        const isFirstAttempt = !hasVerifiedAccessRef.current;
        setMessage("");
        setStatus("loading");
        setSettingsLoadError("");
        setSettingsLoading(true);
        try {
          const eventInfo = await apiClient.getEvent(eventId);
          if (eventInfo.accessLevel !== "admin") {
            setMessage(
              isFirstAttempt ? t("AdminView.loginRequired") : t("AdminView.loginWrongPassword")
            );
            setStatus("locked");
            return;
          }
          const secured = Boolean(eventInfo.secured);
          const allowDownload = Boolean(eventInfo.allowGuestDownload && secured);
          setEventSettings({
            ...eventInfo,
            secured,
            allowGuestDownload: allowDownload,
            allowGuestUpload: eventInfo.allowGuestUpload ?? true,
          });
          setStatus("ready");
        } catch (error) {
          if (error instanceof ApiError) {
            const errMessage = error.message || t("AdminView.filesLoadError");
            setMessage(errMessage);
            if (error.status === 401 || error.status === 403) {
              setMessage(
                isFirstAttempt ? t("AdminView.loginRequired") : t("AdminView.loginWrongPassword")
              );
              setStatus("locked");
              return;
            }
            setStatus("error");
            return;
          }
          const errMessage = error instanceof Error ? error.message : t("AdminView.filesLoadError");
          setMessage(errMessage);
          setStatus("error");
        } finally {
          setSettingsLoading(false);
          hasVerifiedAccessRef.current = true;
          accessRequestRef.current = null;
        }
      })();
    }
  }, [apiClient, eventId, t]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return buildEventUrl({ eventId, baseDomain, supportSubdomain });
  }, [baseDomain, eventId, supportSubdomain]);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareFeedback.showSuccess(t("AdminView.shareCopied"));
    } catch {
      shareFeedback.showError(t("AdminView.shareCopyFailed"));
    }
  }, [shareFeedback, shareUrl, t]);

  const openQrModal = useCallback(() => {
    if (!shareUrl) return;
    setIsQrOpen(true);
  }, [shareUrl]);

  const closeQrModal = useCallback(() => {
    setIsQrOpen(false);
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;

    let attempts = 0;
    const maxAttempts = 20;
    const tryScroll = () => {
      if (scrollToSection(hash, "auto")) return;
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryScroll, 100);
      }
    };

    tryScroll();
  }, [scrollToSection, status, eventSettings]);

  const submitAdminPassword = (password: string) => {
    setMessage("");
    setAdminToken(password);
  };

  if (status === "loading") {
    return (
      <main className="form-page">
        <h1>{t("AdminView.loadingTitle")}</h1>
      </main>
    );
  }

  if (status === "locked") {
    return (
      <PasswordPrompt
        title={t("AdminView.lockedTitle")}
        description={t("AdminView.lockedDescription", { subdomain: eventId })}
        passwordLabel={t("AdminView.lockedTitle")}
        onSubmit={(pwd) => submitAdminPassword(pwd)}
        primaryLabel={t("AdminView.lockedPrimary")}
        secondaryLabel={t("AdminView.lockedSecondary")}
        onSecondary={onBackProject}
        message={message}
      />
    );
  }

  if (status === "error") {
    return (
      <main className="form-page">
        <h1>{t("AdminView.errorTitle")}</h1>
        <p data-testid="admin-view-global-error" className="lede">
          {message}
        </p>
        <div className="actions">
          <button className="primary" onClick={onBackProject}>
            {t("AdminView.back")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="form-page" data-testid="admin-view">
      <div className="admin-actions">
        <button
          type="button"
          className="ghost logout-btn"
          onClick={handleAdminLogout}
          data-testid="admin-logout"
        >
          <LogoutIcon />
          <span className="logout-label">{t("AdminView.logout")}</span>
        </button>
      </div>
      <div className="admin-header">
        <header className="form-header">
          <p className="eyebrow">Admin</p>
          <h1>{t("AdminView.title")}</h1>
          <p className="lede admin-event-lede">
            <strong>{t("AdminView.projectLabelPrefix")}</strong> {eventId}
          </p>
          <div className="share-row">
            <span className="hint">{t("AdminView.shareLabel")}</span>
            <div className="input-with-action share-input-row">
              <input type="text" readOnly value={shareUrl} data-testid="admin-share-input" />
              <button
                type="button"
                className="ghost share-copy-text"
                onClick={handleCopyShareUrl}
                title={t("AdminView.shareCopyLabel")}
                aria-label={t("AdminView.shareCopyLabel")}
                data-testid="admin-share-copy"
              >
                {t("AdminView.shareCopy")}
              </button>
              <button
                type="button"
                className="icon-btn share-copy-icon"
                onClick={handleCopyShareUrl}
                title={t("AdminView.shareCopyLabel")}
                aria-label={t("AdminView.shareCopyLabel")}
                data-testid="admin-share-copy-icon"
              >
                <CopyIcon size={16} />
              </button>
              <button
                type="button"
                className="icon-btn share-qr-btn"
                onClick={openQrModal}
                title={t("AdminView.shareQrLabel")}
                aria-label={t("AdminView.shareQrLabel")}
                data-testid="admin-share-qr"
              >
                <QrIcon />
              </button>
            </div>
            <p className="helper">{t("AdminView.shareHint")}</p>
            {shareFeedback.message ? (
              <span className={`helper status ${shareFeedback.message.tone}`}>
                {shareFeedback.message.text}
              </span>
            ) : null}
          </div>
          <div className="admin-overview">
            <span className="hint">{t("AdminView.overviewLabel")}</span>
            <div className="admin-overview-links">
              <button
                type="button"
                className="admin-overview-link"
                onClick={() => navigateToSection("admin-files")}
                data-testid="admin-overview-files"
              >
                <span className="admin-overview-title">{t("AdminView.overviewFiles")}</span>
                <span className="admin-overview-subtitle">{t("AdminView.overviewFilesHint")}</span>
              </button>
              <button
                type="button"
                className="admin-overview-link"
                onClick={() => navigateToSection("admin-settings")}
                data-testid="admin-overview-settings"
              >
                <span className="admin-overview-title">{t("AdminView.overviewSettings")}</span>
                <span className="admin-overview-subtitle">
                  {t("AdminView.overviewSettingsHint")}
                </span>
              </button>
              <button
                type="button"
                className="admin-overview-link"
                onClick={() => navigateToSection("admin-removal")}
                data-testid="admin-overview-removal"
              >
                <span className="admin-overview-title">{t("AdminView.overviewRemoval")}</span>
                <span className="admin-overview-subtitle">
                  {t("AdminView.overviewRemovalHint")}
                </span>
              </button>
            </div>
          </div>
        </header>
      </div>
      <section id="admin-files" data-testid="admin-files">
        <FileBrowser eventId={eventId} mode="admin" />
      </section>
      <section id="admin-settings" data-testid="admin-settings">
        {eventSettings ? (
          <AdminSettings
            apiClient={apiClient}
            eventId={eventId}
            eventInfo={eventSettings}
            loading={settingsLoading}
            onEventUpdate={handleEventSettingsUpdate}
            onGuestPasswordChanged={() => setGuestToken(null)}
          />
        ) : (
          <div className="form-card" data-testid="admin-settings-loading">
            <h2 data-testid="admin-settings-loading-title">
              {t("AdminView.projectSettingsTitle")}
            </h2>
            <p className={`helper${settingsLoadError ? " status bad" : ""}`}>
              {settingsLoadError || t("AdminView.projectSettingsLoading")}
            </p>
          </div>
        )}
      </section>
      <section id="admin-removal" data-testid="admin-removal">
        <DeleteEventSection
          eventId={eventId}
          apiClient={apiClient}
          onDeleteSuccess={handleDeleteSuccess}
          onApiError={handleApiError}
        />
      </section>
      <div className="actions">
        <button className="ghost" onClick={onBackProject}>
          {t("AdminView.back")}
        </button>
      </div>
      <ModalDialog
        open={isQrOpen}
        title={t("AdminView.shareQrTitle")}
        subtitle={t("AdminView.shareQrSubtitle")}
        cancelLabel={t("NewEventView.cancel")}
        onCancel={closeQrModal}
        closeOnEscape
        showDefaultActions={false}
        footerSlot={
          <div
            className="modal-controls"
            style={{ padding: "12px 14px", justifyContent: "center" }}
          >
            <button
              type="button"
              className="ghost"
              onClick={closeQrModal}
              data-testid="admin-share-qr-close"
            >
              {t("NewEventView.cancel")}
            </button>
          </div>
        }
      >
        <div className="qr-modal-body" data-testid="admin-share-qr-modal">
          <div className="qr-modal-code">
            <QRCodeCanvas value={shareUrl} size={220} includeMargin />
          </div>
          <div className="qr-modal-link" data-testid="admin-share-qr-link">
            <span>{shareUrl}</span>
            <button
              type="button"
              className="icon-btn qr-copy-btn"
              onClick={handleCopyShareUrl}
              title={t("AdminView.shareCopyLabel")}
              aria-label={t("AdminView.shareCopyLabel")}
              data-testid="admin-share-qr-copy"
            >
              <CopyIcon size={14} />
            </button>
          </div>
        </div>
      </ModalDialog>
    </main>
  );
}
