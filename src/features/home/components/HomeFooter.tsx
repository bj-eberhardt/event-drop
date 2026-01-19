import pkg from "../../../../package.json";

export const HomeFooter = () => {
  return <footer className="app-footer">v{pkg.version}</footer>;
};
