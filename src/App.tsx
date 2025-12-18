import { useEffect, useMemo, useState } from "react";
import { mainDomain, SUBDOMAIN_REGEX } from "./constants";
import { redirectToHome } from "./lib/navigation";
import { AdminView } from "./views/AdminView";
import { HomeView } from "./views/HomeView";
import { NewProjectView } from "./views/NewProjectView";
import { ProjectView } from "./views/ProjectView";
import { Route } from "./types";

export default function App() {
  const hostSubdomain = useMemo(() => {
    const host = window.location.hostname.toLowerCase();
    if (host === mainDomain) return null;
    const candidate = host.endsWith(`.${mainDomain}`)
      ? host.slice(0, host.length - mainDomain.length - 1)
      : null;
    if (!candidate || candidate === "www") return null;
    if (!SUBDOMAIN_REGEX.test(candidate)) return null;
    return candidate;
  }, []);

  const [route, setRoute] = useState<Route>(() => {
    if (hostSubdomain) {
      return window.location.pathname.startsWith("/admin") ? "admin" : "project";
    }
    return window.location.pathname === "/new" ? "new" : "home";
  });

  useEffect(() => {
    const handlePopState = () => {
      if (hostSubdomain) {
        setRoute(window.location.pathname.startsWith("/admin") ? "admin" : "project");
      } else {
        setRoute(window.location.pathname === "/new" ? "new" : "home");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hostSubdomain]);

  const navigate = (path: "/" | "/new" | "/admin") => {
    window.history.pushState({}, "", path);
    if (hostSubdomain) {
      setRoute(path.startsWith("/admin") ? "admin" : "project");
    } else {
      setRoute(path === "/new" ? "new" : "home");
    }
  };

  return (
    <div className="app-shell">
      {route === "project" && hostSubdomain ? (
        <ProjectView
          subdomain={hostSubdomain}
          onBackHome={redirectToHome}
          onAdmin={() => navigate("/admin")}
        />
      ) : route === "admin" && hostSubdomain ? (
        <AdminView subdomain={hostSubdomain} onBackProject={() => navigate("/")} />
      ) : route === "home" ? (
        <HomeView onStartNew={() => navigate("/new")} />
      ) : (
        <NewProjectView onCancel={() => navigate("/")} />
      )}
    </div>
  );
}
