import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import step1Avif from "../../../img/step1_small.avif";
import step1Png from "../../../img/step1_small.png";
import step2Avif from "../../../img/step2_small.avif";
import step2Png from "../../../img/step2_small.png";
import step3Avif from "../../../img/step3_small.avif";
import step3Png from "../../../img/step3_small.png";
import step4Avif from "../../../img/step4_small.avif";
import step4Png from "../../../img/step4_small.png";

type Step = {
  title: string;
  shortSummary: string;
  description: string;
  image: {
    avif: string;
    png: string;
  };
};

export function HowItWorksTimeline() {
  const { t } = useTranslation();
  const steps = useMemo<Step[]>(
    () => [
      {
        title: t("HowItWorks.steps.create.title"),
        shortSummary: t("HowItWorks.steps.create.shortSummary"),
        description: t("HowItWorks.steps.create.description"),
        image: { avif: step1Avif, png: step1Png },
      },
      {
        title: t("HowItWorks.steps.share.title"),
        shortSummary: t("HowItWorks.steps.share.shortSummary"),
        description: t("HowItWorks.steps.share.description"),
        image: { avif: step2Avif, png: step2Png },
      },
      {
        title: t("HowItWorks.steps.collect.title"),
        shortSummary: t("HowItWorks.steps.collect.shortSummary"),
        description: t("HowItWorks.steps.collect.description"),
        image: { avif: step3Avif, png: step3Png },
      },
      {
        title: t("HowItWorks.steps.review.title"),
        shortSummary: t("HowItWorks.steps.review.shortSummary"),
        description: t("HowItWorks.steps.review.description"),
        image: { avif: step4Avif, png: step4Png },
      },
    ],
    [t]
  );

  const sectionRef = useRef<HTMLElement | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);

  useEffect(() => {
    const nodes = stepRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!nodes.length) return;

    setRevealed(new Array(steps.length).fill(false));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = nodes.indexOf(entry.target as HTMLDivElement);
          if (index < 0) return;
          setRevealed((prev) => {
            if (prev[index]) return prev;
            const next = [...prev];
            next[index] = true;
            return next;
          });
        });
      },
      { threshold: 0.45, rootMargin: "-30px 0px -10% 0px" }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
    };
  }, [steps.length]);

  return (
    <section className="howitworks" data-testid="home-howitworks" ref={sectionRef}>
      <div className="howitworks-header">
        <p className="eyebrow large">{t("HowItWorks.eyebrow")}</p>
        <h2>{t("HowItWorks.title")}</h2>
        <p className="lede">{t("HowItWorks.lede")}</p>
      </div>
      <div className="howitworks-track">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className={`howitworks-step${revealed[index] ? " revealed" : ""}`}
            data-align={index % 2 === 0 ? "left" : "right"}
            ref={(node) => {
              stepRefs.current[index] = node;
            }}
          >
            <div className="howitworks-card">
              <div className="howitworks-asset">
                <picture>
                  <source srcSet={step.image.avif} type="image/avif" />
                  <img src={step.image.png} alt="" aria-hidden="true" />
                </picture>
              </div>
              <div className="howitworks-content">
                <div className="howitworks-title">
                  <span className="howitworks-index">{String(index + 1).padStart(2, "0")}</span>
                  {step.title}
                </div>
                <p>
                  <span className="howitworks-desc-short">{step.shortSummary}</span>
                  <span className="howitworks-desc-long">{step.description}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
