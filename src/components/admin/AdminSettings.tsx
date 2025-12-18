import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiClient } from "../../api/client";
import type { ProjectInfo, UpdateProjectRequest } from "../../api/types";
import { MimeTypeSelect } from "../ui/MimeTypeSelect";

const MASKED_GUEST_PASSWORD = "********";

type AdminSettingsProps = {
  apiClient: ApiClient;
  subdomain: string;
  project: ProjectInfo;
  loading?: boolean;
  onProjectUpdate: (project: ProjectInfo) => void;
  onGuestPasswordChanged: () => void;
};

export function AdminSettings({
  apiClient,
  subdomain,
  project,
  loading = false,
  onProjectUpdate,
  onGuestPasswordChanged,
}: AdminSettingsProps) {
  const [guestPasswordInput, setGuestPasswordInput] = useState("");
  const [guestPasswordMasked, setGuestPasswordMasked] = useState(Boolean(project.secured));
  const [allowGuestDownload, setAllowGuestDownload] = useState(Boolean(project.allowGuestDownload));
  const [projectName, setProjectName] = useState(project.name || "");
  const [projectDescription, setProjectDescription] = useState(project.description || "");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[]>(project.allowedMimeTypes || []);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsMessageTone, setSettingsMessageTone] = useState<"good" | "bad" | "">("");
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving">("idle");

  useEffect(() => {
    setGuestPasswordMasked(Boolean(project.secured));
    setGuestPasswordInput("");
    setAllowGuestDownload(Boolean(project.allowGuestDownload));
    setProjectName(project.name || "");
    setProjectDescription(project.description || "");
    setAllowedMimeTypes(project.allowedMimeTypes || []);
    setSettingsMessage("");
    setSettingsMessageTone("");
  }, [project.allowGuestDownload, project.allowedMimeTypes, project.description, project.name, project.secured]);

  const trimmedGuestPassword = guestPasswordMasked ? "" : guestPasswordInput.trim();
  const hasNewGuestPassword = !guestPasswordMasked && trimmedGuestPassword.length > 0;
  const isRemovingPassword =
    !guestPasswordMasked && project.secured && trimmedGuestPassword.length === 0;
  const guestPasswordActive = useMemo(
    () => !isRemovingPassword && (project.secured || hasNewGuestPassword || guestPasswordMasked),
    [guestPasswordMasked, hasNewGuestPassword, isRemovingPassword, project.secured],
  );
  const allowGuestDownloadDisabled = !guestPasswordActive;
  const trimmedName = projectName.trim();
  const trimmedDescription = projectDescription.trim();
  const hasNameChange = trimmedName !== (project.name || "");
  const hasDescriptionChange = trimmedDescription !== (project.description || "");
  const hasMimeChange =
    JSON.stringify([...allowedMimeTypes].sort()) !==
    JSON.stringify([...(project.allowedMimeTypes || [])].sort());
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

  const handlePasswordChange = (value: string) => {
    setGuestPasswordMasked(false);
    setGuestPasswordInput(value);
    setSettingsMessage("");
    setSettingsMessageTone("");
  };

  const handleAllowGuestDownloadChange = (checked: boolean) => {
    setAllowGuestDownload(checked);
  };

  const submitProjectSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSettingsMessage("");
    setSettingsMessageTone("");

    const payload: UpdateProjectRequest = {};

    if (isRemovingPassword) {
      payload.guestPassword = "";
    } else if (hasNewGuestPassword) {
      payload.guestPassword = trimmedGuestPassword;
    }

    if (hasNameChange) payload.name = trimmedName;
    if (hasDescriptionChange) payload.description = trimmedDescription || "";
    if (hasMimeChange) payload.allowedMimeTypes = allowedMimeTypes;
    if (payload.guestPassword !== undefined || allowGuestDownload !== project.allowGuestDownload) {
      payload.allowGuestDownload = allowGuestDownload;
    }

    setSettingsStatus("saving");
    try {
      const response = await apiClient.updateProject(subdomain, payload);
      const secured = Boolean(response.secured);
      const allowDownloads = Boolean(response.allowGuestDownload && secured);

      onProjectUpdate({
        name: response.name,
        description: response.description || "",
        allowedMimeTypes: response.allowedMimeTypes || [],
        secured,
        allowGuestDownload: allowDownloads,
        createdAt: project.createdAt,
        eventId: response.eventId,
      });

      setGuestPasswordMasked(secured);
      setGuestPasswordInput("");
      setAllowGuestDownload(allowDownloads);
      setProjectName(response.name);
      setProjectDescription(response.description || "");
      setAllowedMimeTypes(response.allowedMimeTypes || []);
      setSettingsMessage("Einstellungen gespeichert.");
      setSettingsMessageTone("good");

      if (payload.guestPassword !== undefined) {
        onGuestPasswordChanged();
      }
    } catch (error) {
      const errMessage =
        error instanceof Error
          ? error.message
          : "Projekt-Einstellungen konnten nicht gespeichert werden.";
      setSettingsMessage(errMessage);
      setSettingsMessageTone("bad");
    } finally {
      setSettingsStatus("idle");
    }
  };

  return (
    <form className="form-card" onSubmit={submitProjectSettings}>
      <h2>Projekt-Einstellungen</h2>
      <label className="field">
        <span>Projektname</span>
        <input
          required
          maxLength={48}
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="z. B. Silvester 2025"
          disabled={isBusy}
        />
        <p className="helper">Maximal 48 Zeichen.</p>
      </label>
      <label className="field">
        <div className="label-row">
          <span>Beschreibung</span>
          <span className="hint">Optional</span>
        </div>
        <textarea
          maxLength={2048}
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          placeholder="Kurze Beschreibung oder Hinweise für Gäste"
          rows={3}
          disabled={isBusy}
        />
        <p className="helper">Maximal 2048 Zeichen.</p>
      </label>
      <label className="field">
        <div className="label-row">
          <span>Gäste-Passwort</span>
          <span className="hint">
            {isRemovingPassword ? "Wird entfernt" : project.secured ? "Aktuell gesetzt" : "Nicht gesetzt"}
          </span>
        </div>
        <input
          type="password"
          placeholder={project.secured ? "Neues Passwort setzen" : "z. B. party2025"}
          value={passwordValue}
          onFocus={handlePasswordFocus}
          onChange={(event) => handlePasswordChange(event.target.value)}
          disabled={isBusy}
        />
        <p className="helper">
          Leer lassen, um das aktuelle Passwort zu entfernen. Neue Eingabe ersetzt das bestehende Passwort.
        </p>
        {isRemovingPassword ? (
          <p className="helper status bad">
            Das aktuelle Gäste-Passwort wird entfernt. Downloads für Gäste werden deaktiviert.
          </p>
        ) : null}
      </label>
      <label className="field">
        <div className="label-row">
          <span>Download</span>
          <span className="hint">Nur mit Gäste-Passwort</span>
        </div>
        <div className="label-row">
          <span className="helper">Upload-Gäste dürfen Dateien herunterladen</span>
          <input
            type="checkbox"
            checked={allowGuestDownload}
            disabled={allowGuestDownloadDisabled || isBusy}
            onChange={(event) => handleAllowGuestDownloadChange(event.target.checked)}
          />
        </div>
        <p className="helper">Downloads sind nur erlaubt, wenn ein Gäste-Passwort gesetzt ist.</p>
      </label>
      <div className="field">
        <div className="label-row">
          <span>Erlaubte Dateitypen</span>
          <span className="hint">Mehrfachauswahl möglich</span>
        </div>
        <MimeTypeSelect value={allowedMimeTypes} onChange={setAllowedMimeTypes} disabled={isBusy} />
      </div>
      <div className="actions">
        {settingsMessage ? (
          <p
            className={`helper${settingsMessageTone ? ` status ${settingsMessageTone}` : ""}`}
            style={{ marginTop: "4px", marginRight: "auto" }}
          >
            {settingsMessage}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={isBusy}>
          {settingsStatus === "saving" ? "Speichert..." : "Speichern"}
        </button>
      </div>
    </form>
  );
}
