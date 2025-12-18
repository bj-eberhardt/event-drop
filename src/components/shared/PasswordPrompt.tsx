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
    <main className="form-page">
      <h1>{title}</h1>
      <p className="lede">{description}</p>
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password, event);
        }}
      >
        <label className="field">
          <span>{passwordLabel}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {message ? <p className="helper status bad">{message}</p> : null}
        <div className="actions">
          <button type="submit" className="primary">
            {primaryLabel}
          </button>
          <button type="button" className="ghost" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        </div>
      </form>
    </main>
  );
}
