export function HomeView({ onStartNew }: { onStartNew: () => void }) {
  return (
    <main className="home">
      <div className="banner">
        <p className="eyebrow">Party Upload</p>
        <h1>Gemeinsam Erinnerungen sammeln</h1>
        <p className="lede">
          Dieses Tool sammelt Fotos und Videos einer Party an einem sicheren Ort. Lade alle
          Gaeste ein, ihre Bilder direkt hochzuladen - geschuetzt, ohne Chaos, jederzeit
          verfuegbar.
        </p>
        <button className="primary" onClick={onStartNew}>
          Neue Party anlegen
        </button>
      </div>
      <section className="highlights">
        <div className="highlight-card">
          <h2>Sicher geteilt</h2>
          <p>Schuetze Zugaenge mit Passwoertern fuer Gaeste und Admins.</p>
        </div>
        <div className="highlight-card">
          <h2>Alles an einem Ort</h2>
          <p>Eigene Subdomain waehlen und Uploads sauber trennen.</p>
        </div>
        <div className="highlight-card">
          <h2>Stressfrei starten</h2>
          <p>In wenigen Schritten vorbereiten und sofort loslegen.</p>
        </div>
      </section>
    </main>
  );
}
