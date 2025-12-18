import { mainDomain } from "../constants";

export const redirectToHome = (): void => {
  if (typeof window === "undefined") return;
  const { protocol, port } = window.location;
  const portSegment = port ? `:${port}` : "";
  window.location.href = `${protocol}//${mainDomain}${portSegment}/`;
};

export const redirectToAdmin = (subdomain: string): void => {
  if (typeof window === "undefined") return;
  const { protocol, port } = window.location;
  const portSegment = port ? `:${port}` : "";
  window.location.href = `${protocol}//${subdomain}.${mainDomain}${portSegment}/admin`;
};
