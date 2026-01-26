import { useTranslation } from "react-i18next";
import { useNewEvent } from "./hooks/useNewEvent";

type NewEventViewProps = { baseDomain: string; supportSubdomain: boolean; onCancel: () => void };

export function NewEventView({ baseDomain, supportSubdomain, onCancel }: NewEventViewProps) {
  const { t } = useTranslation();
  const {
    name,
    setName,
    description,
    setDescription,
    eventId,
    setEventId,
    guestPassword,
    setGuestPassword,
    adminPassword,
    setAdminPassword,
    adminPasswordConfirm,
    setAdminPasswordConfirm,
    availability,
    availabilityMessage,
    submitError,
    fullDomain,
    adminPasswordRef,
    adminPasswordConfirmRef,
    ensureAdminValidity,
    ensureConfirmValidity,
    handleSubmit,
  } = useNewEvent({ baseDomain, supportSubdomain });

  return (
    <main className="form-page">
      <header className="form-header">
        <p className="eyebrow">{t("NewEventView.eyebrow")}</p>
        <h1>{t("NewEventView.title")}</h1>
        <p className="lede">
          {t(supportSubdomain ? "NewEventView.ledeSubdomain" : "NewEventView.ledePath")}
        </p>
      </header>

      <form className="form-card" onSubmit={handleSubmit} noValidate data-testid="new-event-form">
        <label className="field">
          <span>{t("NewEventView.nameLabel")}</span>
          <input
            required
            maxLength={48}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("NewEventView.namePlaceholder")}
            data-testid="new-event-name"
          />
          <p className="helper">{t("NewEventView.nameHelper")}</p>
        </label>

        <label className="field">
          <div className="label-row">
            <span>{t("NewEventView.descriptionLabel")}</span>
            <span className="hint">{t("NewEventView.descriptionHint")}</span>
          </div>
          <textarea
            maxLength={2048}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("NewEventView.descriptionPlaceholder")}
            rows={3}
            data-testid="new-event-description"
          />
          <p className="helper">{t("NewEventView.descriptionHelper")}</p>
        </label>

        <label className="field">
          <div className="label-row">
            <span>
              {supportSubdomain ? t("NewEventView.subdomainLabel") : t("NewEventView.pathLabel")}
            </span>
          </div>
          {supportSubdomain ? (
            <div className="input-with-suffix">
              <input
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9\\-]+"
                title={t("NewEventView.subdomainTitle")}
                placeholder={t("NewEventView.subdomainPlaceholder")}
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity(
                    event.currentTarget.value.trim().length < 3
                      ? t("NewEventView.subdomainTooShort")
                      : t("NewEventView.formErrorSubdomainInvalid")
                  )
                }
                onInput={(event) => event.currentTarget.setCustomValidity("")}
                data-testid="new-event-subdomain"
              />
              <span className="suffix">.{baseDomain}</span>
            </div>
          ) : (
            <div className="input-with-prefix">
              <span className="prefix">{baseDomain}/</span>
              <input
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9\\-]+"
                title={t("NewEventView.pathTitle")}
                placeholder={t("NewEventView.pathPlaceholder")}
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity(
                    event.currentTarget.value.trim().length < 3
                      ? t("NewEventView.pathTooShort")
                      : t("NewEventView.formErrorPathInvalid")
                  )
                }
                onInput={(event) => event.currentTarget.setCustomValidity("")}
                data-testid="new-event-subdomain"
              />
            </div>
          )}
          <p className="helper">
            {t(supportSubdomain ? "NewEventView.subdomainPreview" : "NewEventView.pathPreview", {
              domain: fullDomain,
            })}{" "}
            {availability !== "idle" && (
              <span
                className={
                  availability === "available"
                    ? "status good"
                    : availability === "taken" || availability === "invalid"
                      ? "status bad"
                      : "status"
                }
                data-testid="new-event-availability"
              >
                {availability === "checking"
                  ? t("NewEventView.availabilityChecking")
                  : availabilityMessage}
              </span>
            )}
          </p>
        </label>

        <label className="field">
          <div className="label-row">
            <span>{t("NewEventView.guestPasswordLabel")}</span>
            <span className="hint">{t("NewEventView.guestPasswordHint")}</span>
          </div>
          <input
            type="password"
            placeholder={t("NewEventView.guestPasswordPlaceholder")}
            value={guestPassword}
            onChange={(event) => setGuestPassword(event.target.value)}
            onInvalid={(event) =>
              event.currentTarget.setCustomValidity(t("NewEventView.guestPasswordInvalid"))
            }
            onInput={(event) => event.currentTarget.setCustomValidity("")}
            data-testid="new-event-guest-password"
          />
          <p className="helper">{t("NewEventView.guestPasswordHelper")}</p>
        </label>

        <div className="field grid-2">
          <label className="subfield">
            <span>{t("NewEventView.adminPasswordLabel")}</span>
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
                event.currentTarget.setCustomValidity(t("NewEventView.adminPasswordInvalid"));
                ensureAdminValidity();
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity("");
                ensureAdminValidity();
                ensureConfirmValidity();
              }}
              data-testid="new-event-admin-password"
            />
          </label>
          <label className="subfield">
            <div className="label-row">
              <span>{t("NewEventView.adminPasswordRepeatLabel")}</span>
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
                event.currentTarget.setCustomValidity(t("NewEventView.adminPasswordRepeatInvalid"));
                ensureConfirmValidity();
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity("");
                ensureConfirmValidity();
              }}
              data-testid="new-event-admin-password-confirm"
            />
          </label>
        </div>
        <p className="helper">{t("NewEventView.adminPasswordHint")}</p>

        <div className="actions">
          {submitError ? (
            <div className="error" data-testid="new-event-submit-error">
              {submitError}
            </div>
          ) : null}
          <button type="button" className="ghost" onClick={onCancel} data-testid="new-event-cancel">
            {t("NewEventView.cancel")}
          </button>
          <button type="submit" className="primary" data-testid="new-event-submit">
            {t("NewEventView.submit")}
          </button>
        </div>
      </form>
    </main>
  );
}
