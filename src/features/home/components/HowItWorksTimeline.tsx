import { useEffect, useMemo, useRef, useState } from "react";
import createSvg from "../../../img/how-create.svg";
import shareSvg from "../../../img/how-share.svg";
import collectSvg from "../../../img/how-collect.svg";
import reviewSvg from "../../../img/how-review.svg";

type Step = {
  title: string;
  description: string;
  image: string;
};

export function HowItWorksTimeline() {
  const steps = useMemo<Step[]>(
    () => [
      {
        title: "Erstellen",
        description:
          "Event in wenigen Minuten anlegen.|Erstelle dein Event, vergib Titel und Beschreibung und sichere es optional mit einem Gäste-Passwort.",
        image: createSvg,
      },
      {
        title: "Teilen",
        description:
          "Link an Gäste schicken.|Teile den Upload-Link oder QR-Code, damit alle schnell Zugriff haben.",
        image: shareSvg,
      },
      {
        title: "Sammeln",
        description:
          "Gäste laden direkt hoch.|Fotos und Videos landen sofort im Event-Ordner, ohne Chaos in Chats.",
        image: collectSvg,
      },
      {
        title: "Sichten & ZIP",
        description:
          "Uploads prüfen & exportieren.|Überblicke die Dateien, sortiere sie und lade alles als ZIP herunter.",
        image: reviewSvg,
      },
    ],
    []
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
        <p className="eyebrow">So funktioniert es</p>
        <h2>Erstellen → Teilen → Sammeln → Sichten & ZIP</h2>
        <p className="lede">
          Der Ablauf bleibt für Gäste simpel, während du die Kontrolle behältst.
        </p>
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
                <img src={step.image} alt="" aria-hidden="true" />
              </div>
              <div className="howitworks-content">
                <div className="howitworks-title">
                  <span className="howitworks-index">{String(index + 1).padStart(2, "0")}</span>
                  {step.title}
                </div>
                <p>
                  <span className="howitworks-desc-short">{step.description.split("|")[0]}</span>
                  <span className="howitworks-desc-long">{step.description.split("|")[1]}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
