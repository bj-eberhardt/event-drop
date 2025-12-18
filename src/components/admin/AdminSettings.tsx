import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClient } from "../../api/client";
import type { EventInfo, UpdateEventRequest } from "../../api/types";
import { MimeTypeSelect } from "../ui/MimeTypeSelect";
import { useTimedFeedback } from "../../hooks";
import { EditIcon } from "../ui/icons";

const MASKED_GUEST_PASSWORD = "********";

type AdminSettingsProps = {
  apiClient: ApiClient;
  subdomain: string;
  eventInfo: EventInfo;
  loading?: boolean;
  onProjectUpdate: (project: EventInfo) => void;
  onGuestPasswordChanged: () => void;
};

export function AdminSettings({
  apiClient,
  subdomain,
  eventInfo,
  loading = false,
  onProjectUpdate,
  onGuestPasswordChanged,
}: AdminSettingsProps) {
  const { t } = useTranslation();
  const [guestPasswordInput, setGuestPasswordInput] = useState("");
  const [guestPasswordMasked, setGuestPasswordMasked] = useState(Boolean(eventInfo.secured));
  const [allowGuestDownload, setAllowGuestDownload] = useState(
    Boolean(eventInfo.allowGuestDownload)
  );
  const [projectName, setProjectName] = useState(eventInfo.name || "");
  const [projectDescription, setProjectDescription] = useState(eventInfo.description || "");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[]>(
    eventInfo.allowedMimeTypes || []
  );
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving">("idle");
  const settingsFeedback = useTimedFeedback();

  useEffect(() => {
    setGuestPasswordMasked(Boolean(eventInfo.secured));
    setGuestPasswordInput("");
    setAllowGuestDownload(Boolean(eventInfo.allowGuestDownload));
    setProjectName(eventInfo.name || "");
    setProjectDescription(eventInfo.description || "");
    setAllowedMimeTypes(eventInfo.allowedMimeTypes || []);
  }, [
    eventInfo.allowGuestDownload,
    eventInfo.allowedMimeTypes,
    eventInfo.description,
    eventInfo.name,
    eventInfo.secured,
  ]);

  const trimmedGuestPassword = guestPasswordMasked ? "" : guestPasswordInput.trim();
  const hasNewGuestPassword = !guestPasswordMasked && trimmedGuestPassword.length > 0;
  const isRemovingPassword =
    !guestPasswordMasked && eventInfo.secured && trimmedGuestPassword.length === 0;
  const guestPasswordActive = useMemo(
    () => !isRemovingPassword && (eventInfo.secured || hasNewGuestPassword || guestPasswordMasked),
    [guestPasswordMasked, hasNewGuestPassword, isRemovingPassword, eventInfo.secured]
  );
  const allowGuestDownloadDisabled = !guestPasswordActive;
  const trimmedName = projectName.trim();
  const trimmedDescription = projectDescription.trim();
  const hasNameChange = trimmedName !== (eventInfo.name || "");
  const hasDescriptionChange = trimmedDescription !== (eventInfo.description || "");
  const hasMimeChange =
    JSON.stringify([...allowedMimeTypes].sort()) !==
    JSON.stringify([...(eventInfo.allowedMimeTypes || [])].sort());
  const isBusy = loading || settingsStatus === "saving";
  const passwordValue = guestPasswordMasked ? MASKED_GUEST_PASSWORD : guestPasswordInput;

  useEffect(() => {
    if (!guestPasswordActive && allowGuestDownload) {
      setAllowGuestDownload(false);
    }
  }, [allowGuestDownload, guestPasswordActive]);

  const handlePasswordFocus = () => {
    if (guestPasswordMasked) {
      setGuestPasswordMasked(false);
      setGuestPasswordInput("");
    }
  };

  const handlePasswordEdit = () => {
    if (!guestPasswordMasked) return;
    setGuestPasswordMasked(false);
    setGuestPasswordInput("");
  };

  const handlePasswordChange = (value: string) => {
    setGuestPasswordMasked(false);
    setGuestPasswordInput(value);
    settingsFeedback.clear();
  };

  const handleAllowGuestDownloadChange = (checked: boolean) => {
    setAllowGuestDownload(checked);
  };

  const submitEventSettings = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    settingsFeedback.clear();

    if (hasNewGuestPassword && trimmedGuestPassword.length < 4) {
      settingsFeedback.showError(t("AdminSettings.guestPasswordTooShort"));
      return;
    }

    const payload: UpdateEventRequest = {};

    if (isRemovingPassword) {
      payload.guestPassword = "";
    } else if (hasNewGuestPassword) {
      payload.guestPassword = trimmedGuestPassword;
    }

    if (hasNameChange) payload.name = trimmedName;
    if (hasDescriptionChange) payload.description = trimmedDescription || "";
    if (hasMimeChange) payload.allowedMimeTypes = allowedMimeTypes;
    if (
      payload.guestPassword !== undefined ||
      allowGuestDownload !== eventInfo.allowGuestDownload
    ) {
      payload.allowGuestDownload = allowGuestDownload;
    }

    setSettingsStatus("saving");
    try {
      const response = await apiClient.updateEvent(subdomain, payload);
      const secured = Boolean(response.secured);
      const allowDownloads = Boolean(response.allowGuestDownload && secured);

      onProjectUpdate({
        name: response.name,
        description: response.description || "",
        allowedMimeTypes: response.allowedMimeTypes || [],
        secured,
        allowGuestDownload: allowDownloads,
        uploadMaxFileSizeBytes: response.uploadMaxFileSizeBytes ?? eventInfo.uploadMaxFileSizeBytes,
        uploadMaxTotalSizeBytes:
          response.uploadMaxTotalSizeBytes ?? eventInfo.uploadMaxTotalSizeBytes,
        createdAt: eventInfo.createdAt,
        eventId: response.eventId,
      });

      setGuestPasswordMasked(secured);
      setGuestPasswordInput("");
      setAllowGuestDownload(allowDownloads);
      setProjectName(response.name);
      setProjectDescription(response.description || "");
      setAllowedMimeTypes(response.allowedMimeTypes || []);
      settingsFeedback.showSuccess(t("AdminSettings.saveSuccess"));

      if (payload.guestPassword !== undefined) {
        onGuestPasswordChanged();
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : t("AdminSettings.saveError");
      settingsFeedback.showError(errMessage);
    } finally {
      setSettingsStatus("idle");
    }
  };

  return (
    <form className="form-card" onSubmit={submitEventSettings} data-testid="admin-settings-form">
      <h2 data-testid="admin-settings-title">{t("AdminSettings.title")}</h2>
      <label className="field">
        <span>{t("AdminSettings.nameLabel")}</span>
        <input
          required
          maxLength={48}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder={t("AdminSettings.namePlaceholder")}
          disabled={isBusy}
        />
        <p className="helper">{t("AdminSettings.nameHelper")}</p>
      </label>
      <label className="field">
        <div className="label-row">
          <span>{t("AdminSettings.descriptionLabel")}</span>
          <span className="hint">{t("AdminSettings.descriptionHint")}</span>
        </div>
        <textarea
          maxLength={2048}
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
          placeholder={t("AdminSettings.descriptionPlaceholder")}
          rows={3}
          disabled={isBusy}
        />
        <p className="helper">{t("AdminSettings.descriptionHelper")}</p>
      </label>
      <label className="field">
        <div className="label-row">
          <span>{t("AdminSettings.guestPasswordLabel")}</span>
          <span className="hint">
            {isRemovingPassword
              ? t("AdminSettings.guestPasswordHintRemoving")
              : eventInfo.secured
                ? t("AdminSettings.guestPasswordHintSet")
                : t("AdminSettings.guestPasswordHintUnset")}
          </span>
        </div>
        <div className="input-with-action">
          <input
            type="password"
            placeholder={
              eventInfo.secured
                ? t("AdminSettings.guestPasswordPlaceholderNew")
                : t("AdminSettings.guestPasswordPlaceholder")
            }
            value={passwordValue}
            onFocus={handlePasswordFocus}
            onChange={(e) => handlePasswordChange(e.target.value)}
            disabled={isBusy || guestPasswordMasked}
            data-testid="admin-guest-password"
          />
          {guestPasswordMasked ? (
            <button
              type="button"
              className="icon-btn"
              onClick={handlePasswordEdit}
              disabled={isBusy}
              aria-label={t("AdminSettings.guestPasswordEdit")}
              title={t("AdminSettings.guestPasswordEdit")}
              data-testid="admin-guest-password-edit"
            >
              <EditIcon />
            </button>
          ) : null}
        </div>
        <p className="helper">{t("AdminSettings.guestPasswordHelper")}</p>
        {isRemovingPassword ? (
          <p className="helper status bad">{t("AdminSettings.guestPasswordRemovingWarning")}</p>
        ) : null}
      </label>
      <label className="field">
        <div className="label-row">
          <span>{t("AdminSettings.downloadLabel")}</span>
          <span className="hint">{t("AdminSettings.downloadHint")}</span>
        </div>
        <div className="label-row">
          <label className="checkbox-helper">
            <input
              type="checkbox"
              checked={allowGuestDownload}
              disabled={allowGuestDownloadDisabled || isBusy}
              onChange={(e) => handleAllowGuestDownloadChange(e.target.checked)}
              data-testid="admin-guest-download"
            />
            <span>{t("AdminSettings.downloadHelper")}</span>
          </label>
        </div>
        <p className="helper">{t("AdminSettings.downloadInfo")}</p>
      </label>
      <div className="field">
        <div className="label-row">
          <span>{t("AdminSettings.mimeLabel")}</span>
          <span className="hint">{t("AdminSettings.mimeHint")}</span>
        </div>
        <MimeTypeSelect value={allowedMimeTypes} onChange={setAllowedMimeTypes} disabled={isBusy} />
      </div>
      <div className="actions">
        {settingsFeedback.message ? (
          <p
            className={`helper${settingsFeedback.message.tone ? ` status ${settingsFeedback.message.tone}` : ""}`}
            style={{ marginTop: "4px", marginRight: "auto" }}
            data-testid="admin-settings-feedback"
          >
            {settingsFeedback.message.text}
          </p>
        ) : null}
        <button
          type="submit"
          className="primary"
          disabled={isBusy}
          data-testid="admin-settings-save"
        >
          {settingsStatus === "saving" ? t("AdminSettings.saving") : t("AdminSettings.save")}
        </button>
      </div>
    </form>
  );
}
