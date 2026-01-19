import { FormEvent, useState } from "react";

type PasswordPromptProps = {
  title: string;
  description: string;
  passwordLabel: string;
  onSubmit: (password: string, event: FormEvent<HTMLFormElement>) => void;
  primaryLabel: string;
  secondaryLabel: string;
  onSecondary: () => void;
  message?: string;
  initialPassword?: string;
};

export function PasswordPrompt({
  title,
  description,
  passwordLabel,
  onSubmit,
  primaryLabel,
  secondaryLabel,
  onSecondary,
  message,
  initialPassword = "",
}: PasswordPromptProps) {
  const [password, setPassword] = useState(initialPassword);

  return (
    <main className="form-page" data-testid="password-prompt">
      <h1>{title}</h1>
      <p className="lede">{description}</p>
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password, event);
        }}
        data-testid="password-form"
      >
        <label className="field">
          <span>{passwordLabel}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            data-testid="password-input"
          />
        </label>
        {message ? (
          <p className="helper status bad" data-testid="password-error">
            {message}
          </p>
        ) : null}
        <div className="actions">
          <button type="submit" className="primary" data-testid="password-submit">
            {primaryLabel}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={onSecondary}
            data-testid="password-secondary"
          >
            {secondaryLabel}
          </button>
        </div>
      </form>
    </main>
  );
}
