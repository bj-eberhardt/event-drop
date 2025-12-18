import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { mainDomain, SUBDOMAIN_REGEX } from "../constants";
import { Availability } from "../types";
import { ApiClient } from "../api/client";
import { redirectToAdmin } from "../lib/navigation";
import { useSessionStore } from "../lib/sessionStore";

type NewProjectViewProps = { onCancel: () => void };

export function NewProjectView({ onCancel }: NewProjectViewProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const adminPasswordRef = useRef<HTMLInputElement | null>(null);
  const adminPasswordConfirmRef = useRef<HTMLInputElement | null>(null);

  const fullDomain = useMemo(() => {
    const trimmed = subdomain.trim().replace(/\s+/g, "-");
    return trimmed ? `${trimmed}.${mainDomain}` : `subdomain.${mainDomain}`;
  }, [subdomain]);

  const ensureAdminValidity = () => {
    const field = adminPasswordRef.current;
    if (!field) return;
    if (field.value.length < 8) {
      field.setCustomValidity("Mindestens 8 Zeichen erforderlich.");
    } else {
      field.setCustomValidity("");
    }
  };

  const ensureConfirmValidity = () => {
    const field = adminPasswordConfirmRef.current;
    if (!field) return;
    if (adminPassword !== adminPasswordConfirm) {
      field.setCustomValidity("Passwoerter muessen identisch sein.");
    } else if (field.value.length < 8) {
      field.setCustomValidity("Mindestens 8 Zeichen erforderlich.");
    } else {
      field.setCustomValidity("");
    }
  };

  const normalizedSubdomain = useMemo(() => subdomain.trim().toLowerCase(), [subdomain]);

  useEffect(() => {
    const candidate = normalizedSubdomain;
    if (!candidate) {
      setAvailability("idle");
      setAvailabilityMessage("");
      return;
    }
    if (!SUBDOMAIN_REGEX.test(candidate)) {
      setAvailability("invalid");
      setAvailabilityMessage("Nur Kleinbuchstaben, Zahlen und Bindestriche sind erlaubt.");
      return;
    }

    const controller = new AbortController();
    const check = async () => {
      setAvailability("checking");
      setAvailabilityMessage("");
      try {
        // Note: AbortController signal is not directly supported by our API client
        // For now, we'll use a timeout or handle cancellation differently
        const result = await ApiClient.anonymous().checkSubdomainAvailability(candidate);

        if (result === null) {
          setAvailability("available");
          setAvailabilityMessage("Subdomain ist verfügbar.");
          return;
        }

        setAvailability("taken");
        const securedHint = result.secured ? " (passwortgeschützt)" : "";
        setAvailabilityMessage(`Subdomain ist vergeben${securedHint}.`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAvailability("error");
        const message = error instanceof Error ? error.message : "Prüfung fehlgeschlagen.";
        setAvailabilityMessage(message);
      }
    };

    const timeout = setTimeout(check, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [normalizedSubdomain]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setSubmitError("Bitte einen Projektnamen eingeben (max. 48 Zeichen).");
      return;
    }
    if (trimmedName.length > 48) {
      setSubmitError("Projektname darf maximal 48 Zeichen lang sein.");
      return;
    }
    if (trimmedDescription.length > 2048) {
      setSubmitError("Beschreibung darf maximal 2048 Zeichen lang sein.");
      return;
    }
    if (availability === "invalid") {
      setSubmitError("Bitte eine gueltige Subdomain eingeben.");
      return;
    }
    if (availability === "taken") {
      setSubmitError("Diese Subdomain ist bereits vergeben.");
      return;
    }
    if (availability === "checking") {
      setSubmitError("Bitte warte, Subdomain wird geprueft.");
      return;
    }
    if (availability === "error") {
      setSubmitError("Subdomain konnte nicht geprueft werden.");
      return;
    }

    ensureAdminValidity();
    ensureConfirmValidity();

    const formValid = event.currentTarget.checkValidity();
    if (!formValid) {
      event.currentTarget.reportValidity();
      return;
    }

    try {
      const client = ApiClient.anonymous();
      const response = await client.createProject({
        name: trimmedName,
        description: trimmedDescription || undefined,
        eventId: normalizedSubdomain,
        allowedMimeTypes: [],
        guestPassword,
        adminPassword,
        adminPasswordConfirm,
      });
      console.log("Create project response", response);

      // store admin password for immediate access
      const { setAdminToken } = useSessionStore.getState();
      setAdminToken(adminPassword);

      // redirect to admin of new subdomain
      redirectToAdmin(response.eventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Server nicht erreichbar. Bitte später erneut versuchen.";
      setSubmitError(message);
    }
  };

  return (
    <main className="form-page">
      <header className="form-header">
        <p className="eyebrow">Neue Party</p>
        <h1>Upload-Bereich konfigurieren</h1>
        <p className="lede">
          Waehl eine Subdomain, vergebe optionale Gaestepasswoerter und sichere den Admin-Bereich
          mit einem starken Passwort.
        </p>
      </header>

      <form className="form-card" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Projektname</span>
          <input
            required
            maxLength={48}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. Silvester 2025"
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
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Kurze Beschreibung oder Hinweise für Gäste"
            rows={3}
          />
          <p className="helper">Maximal 2048 Zeichen.</p>
        </label>

        <label className="field">
          <div className="label-row">
            <span>Subdomain</span>
            <span className="hint">Hauptdomain ist konfigurierbar</span>
          </div>
          <div className="input-with-suffix">
            <input
              required
              minLength={3}
              maxLength={32}
              pattern="[-a-z0-9]+"
              title="Nur Kleinbuchstaben, Zahlen und Bindestriche"
              placeholder="silvester24"
              value={subdomain}
              onChange={(event) => setSubdomain(event.target.value)}
              onInvalid={(event) =>
                event.currentTarget.setCustomValidity("Bitte gib eine gueltige Subdomain ein.")
              }
              onInput={(event) => event.currentTarget.setCustomValidity("")}
            />
            <span className="suffix">.{mainDomain}</span>
          </div>
          <p className="helper">
            Vorschau: {fullDomain}{" "}
            {availability !== "idle" && (
              <span
                className={
                  availability === "available"
                    ? "status good"
                    : availability === "taken" || availability === "invalid"
                      ? "status bad"
                      : "status"
                }
              >
                {availability === "checking" ? "Prüfe …" : availabilityMessage}
              </span>
            )}
          </p>
        </label>

        <label className="field">
          <div className="label-row">
            <span>Gaeste-Passwort</span>
            <span className="hint">Optional</span>
          </div>
          <input
            type="password"
            placeholder="z. B. party2025"
            value={guestPassword}
            onChange={(event) => setGuestPassword(event.target.value)}
            onInvalid={(event) => event.currentTarget.setCustomValidity("Bitte gib ein Passwort ein.")}
            onInput={(event) => event.currentTarget.setCustomValidity("")}
          />
          <p className="helper">Leer lassen, wenn Gaeste ohne Passwort hochladen duerfen.</p>
        </label>

        <div className="field grid-2">
          <label className="subfield">
            <span>Admin-Passwort</span>
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={adminPassword}
              ref={adminPasswordRef}
              onChange={(event) => {
                setAdminPassword(event.target.value);
                ensureAdminValidity();
                ensureConfirmValidity();
              }}
              onInvalid={(event) => {
                event.currentTarget.setCustomValidity(
                  "Bitte gib ein Admin-Passwort mit mindestens 8 Zeichen ein.",
                );
                ensureAdminValidity();
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity("");
                ensureAdminValidity();
                ensureConfirmValidity();
              }}
            />
          </label>
          <label className="subfield">
            <div className="label-row">
              <span>Admin-Passwort wiederholen</span>
            </div>
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={adminPasswordConfirm}
              ref={adminPasswordConfirmRef}
              onChange={(event) => {
                setAdminPasswordConfirm(event.target.value);
                ensureConfirmValidity();
              }}
              onPaste={(event) => event.preventDefault()}
              onDrop={(event) => event.preventDefault()}
              onInvalid={(event) => {
                event.currentTarget.setCustomValidity("Bitte wiederhole das Admin-Passwort identisch.");
                ensureConfirmValidity();
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity("");
                ensureConfirmValidity();
              }}
            />
          </label>
        </div>

        <div className="actions">
          {submitError ? <div className="error">{submitError}</div> : null}
          <button type="button" className="ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="primary">
            Anlegen
          </button>
        </div>
      </form>
    </main>
  );
}
