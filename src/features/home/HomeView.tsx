import { useTranslation } from "react-i18next";
import logoAvif from "../../img/logo.avif";
import logoPng from "../../img/logo.png";

type HomeViewProps = { onStartNew: () => void; allowEventCreation: boolean };

export function HomeView({ onStartNew, allowEventCreation }: HomeViewProps) {
  const { t } = useTranslation();

  return (
    <main className="home">
      <div className="banner">
        <picture className="home-logo">
          <source srcSet={logoAvif} type="image/avif" />
          <img src={logoPng} alt="Event Drop" data-testid="home-logo" />
        </picture>
        <p className="eyebrow" data-testid="home-eyebrow">
          {t("HomeView.eyebrow")}
        </p>
        <h1 data-testid="home-title">{t("HomeView.title")}</h1>
        <p className="lede" data-testid="home-lede">
          {t("HomeView.lede")}
        </p>
        {allowEventCreation ? (
          <button className="primary" onClick={onStartNew} data-testid="home-cta">
            {t("HomeView.cta")}
          </button>
        ) : null}
      </div>
      <section className="highlights">
        <div className="highlight-card" data-testid="home-highlight-1">
          <h2 data-testid="home-highlight-1-title">{t("HomeView.highlight1Title")}</h2>
          <p data-testid="home-highlight-1-body">{t("HomeView.highlight1Body")}</p>
        </div>
        <div className="highlight-card" data-testid="home-highlight-2">
          <h2 data-testid="home-highlight-2-title">{t("HomeView.highlight2Title")}</h2>
          <p data-testid="home-highlight-2-body">{t("HomeView.highlight2Body")}</p>
        </div>
        <div className="highlight-card" data-testid="home-highlight-3">
          <h2 data-testid="home-highlight-3-title">{t("HomeView.highlight3Title")}</h2>
          <p data-testid="home-highlight-3-body">{t("HomeView.highlight3Body")}</p>
        </div>
      </section>
    </main>
  );
}
