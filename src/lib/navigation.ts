export const redirectToHome = (domain: string): void => {
  if (typeof window === "undefined") return;
  const { protocol, port } = window.location;
  const portSegment = port ? `:${port}` : "";
  window.location.href = `${protocol}//${domain}${portSegment}/`;
};

export const redirectToAdmin = (eventId: string, domain: string, supportSubdomain = true): void => {
  if (typeof window === "undefined") return;
  const { protocol, port } = window.location;
  const portSegment = port ? `:${port}` : "";
  if (supportSubdomain) {
    window.location.href = `${protocol}//${eventId}.${domain}${portSegment}/admin`;
  } else {
    window.location.href = `${protocol}//${domain}${portSegment}/${eventId}/admin`;
  }
};
