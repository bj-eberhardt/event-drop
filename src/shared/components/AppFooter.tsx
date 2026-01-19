import pkg from "../../../package.json";

export const AppFooter = () => {
  return <footer className="app-footer">v{pkg.version}</footer>;
};
