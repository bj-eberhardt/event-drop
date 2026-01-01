export const getUniqueEventId = (prefix: string) => {
  const timePart = Date.now().toString(36).slice(-6);
  const randPart = Math.random().toString(36).slice(2, 6);
  const workerPart = process.env.PLAYWRIGHT_WORKER_INDEX ?? "";
  const raw = `${prefix}-${workerPart}${timePart}${randPart}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 32);
};
