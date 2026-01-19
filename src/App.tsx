import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { APP_CONFIG_TTL_MS, SUBDOMAIN_REGEX } from "./constants";
import { redirectToHome } from "./lib/navigation";
import { AdminView } from "./features/admin/AdminView";
import { HomeView } from "./features/home/HomeView";
import { NewEventView } from "./features/new-event/NewEventView";
import { EventView } from "./features/event/EventView";
import { Route } from "./types";
import { ApiClient } from "./api/client";
import { useAppConfigStore } from "./lib/appConfigStore";
import { getDomainMatchFromHost, matchAllowedDomain } from "./lib/domain";
import { resolveRoute } from "./lib/routing";

export default function App() {
  const { t } = useTranslation();
  const [configError, setConfigError] = useState("");
  const { appConfig, setAppConfig, isAppConfigExpired } = useAppConfigStore();
  const configRequestRef = useRef<Promise<void> | null>(null);
  const supportSubdomain = Boolean(appConfig?.supportSubdomain);
  const allowEventCreation = Boolean(appConfig?.allowEventCreation);
  const allowedDomain = useMemo(() => {
    return matchAllowedDomain(appConfig?.allowedDomains ?? [], window.location.host);
  }, [appConfig]);
  const hostEventId = useMemo(() => {
    if (!allowedDomain) return null;
    if (!supportSubdomain) {
      const parts = window.location.pathname.split("/").filter(Boolean);
      if (!parts.length) return null;
      if (parts[0] === "new") return null;
      return SUBDOMAIN_REGEX.test(parts[0]) ? parts[0] : null;
    }
    return getDomainMatchFromHost(appConfig?.allowedDomains ?? [], window.location.host).subdomain;
  }, [allowedDomain, appConfig, supportSubdomain]);

  useEffect(() => {
    if (!appConfig || !allowedDomain || supportSubdomain) return;
    const hostMatch = getDomainMatchFromHost(appConfig.allowedDomains ?? [], window.location.host);
    if (!hostMatch.subdomain) return;
    const { protocol, port, pathname, search, hash } = window.location;
    const portSegment = port ? `:${port}` : "";
    const adminSuffix = pathname.startsWith("/admin") ? "/admin" : "";
    const target = `${protocol}//${allowedDomain}${portSegment}/${hostMatch.subdomain}${adminSuffix}${search}${hash}`;
    window.location.replace(target);
  }, [allowedDomain, appConfig, supportSubdomain]);

  useEffect(() => {
    if (appConfig && !isAppConfigExpired(APP_CONFIG_TTL_MS)) return;
    if (!configRequestRef.current) {
      configRequestRef.current = (async () => {
        try {
          const config = await ApiClient.anonymous().getAppConfig();
          setAppConfig(config);
        } catch (error) {
          if (!appConfig) {
            const message =
              error instanceof Error ? error.message : t("AdminView.serverUnavailable");
            setConfigError(message);
          }
        } finally {
          configRequestRef.current = null;
        }
      })();
    }
  }, [appConfig, isAppConfigExpired, setAppConfig, t]);

  const [route, setRoute] = useState<Route>(() =>
    resolveRoute({
      pathname: window.location.pathname,
      hostSubdomain: hostEventId,
      supportSubdomain,
    })
  );

  useEffect(() => {
    if (!allowedDomain) return;
    setRoute(
      resolveRoute({
        pathname: window.location.pathname,
        hostSubdomain: hostEventId,
        supportSubdomain,
      })
    );
  }, [allowedDomain, hostEventId, supportSubdomain]);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(
        resolveRoute({
          pathname: window.location.pathname,
          hostSubdomain: hostEventId,
          supportSubdomain,
        })
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hostEventId, supportSubdomain]);

  const navigate = (path: "/" | "/new" | "/admin") => {
    if (!supportSubdomain && hostEventId) {
      const basePath = `/${hostEventId}`;
      const target = path === "/admin" ? `${basePath}/admin` : basePath;
      window.history.pushState({}, "", target);
      setRoute(path === "/admin" ? "admin" : "event");
      return;
    }
    window.history.pushState({}, "", path);
    if (hostEventId) {
      setRoute(path.startsWith("/admin") ? "admin" : "event");
    } else {
      setRoute(path === "/new" ? "new" : "home");
    }
  };

  if (!appConfig && !configError) {
    return (
      <div className="app-shell">
        <main className="form-page">
          <h1>{t("App.loading")}</h1>
        </main>
      </div>
    );
  }

  if (configError && !appConfig) {
    return (
      <div className="app-shell">
        <main className="form-page">
          <h1>{t("EventView.errorTitle")}</h1>
          <p data-testid="global-error" className="lede">
            {configError}
          </p>
        </main>
      </div>
    );
  }

  if (appConfig && !allowedDomain) {
    return (
      <div className="app-shell">
        <main className="form-page">
          <h1>{t("EventView.errorTitle")}</h1>
          <p className="lede" data-testid="domain-not-allowed">
            {t("App.domainNotAllowed")}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {route === "event" && hostEventId ? (
        <EventView
          eventId={hostEventId}
          baseDomain={allowedDomain ?? window.location.hostname}
          onBackHome={() => redirectToHome(allowedDomain ?? window.location.hostname)}
          onAdmin={() => navigate("/admin")}
        />
      ) : route === "admin" && hostEventId ? (
        <AdminView
          eventId={hostEventId}
          baseDomain={allowedDomain ?? window.location.hostname}
          supportSubdomain={Boolean(appConfig?.supportSubdomain)}
          onBackProject={() => navigate("/")}
        />
      ) : null}
      {route === "home" ? (
        <HomeView onStartNew={() => navigate("/new")} allowEventCreation={allowEventCreation} />
      ) : null}
      {route === "new" ? (
        allowEventCreation ? (
          <NewEventView
            baseDomain={allowedDomain ?? window.location.hostname}
            supportSubdomain={supportSubdomain}
            onCancel={() => navigate("/")}
          />
        ) : (
          <main className="form-page">
            <h1>{t("EventView.errorTitle")}</h1>
            <p className="lede">{t("App.eventCreationDisabled")}</p>
            <div className="actions">
              <button className="ghost" onClick={() => navigate("/")}>
                {t("EventView.backHome")}
              </button>
            </div>
          </main>
        )
      ) : null}
    </div>
  );
}
