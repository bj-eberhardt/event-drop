import { UPLOAD_MAX_FILE_SIZE_BYTES, UPLOAD_MAX_TOTAL_SIZE_BYTES } from "../../config.js";
import { EventConfig, EventConfigResponse } from "../../types.js";

export const buildEventResponse = (event: EventConfig): EventConfigResponse => {
  const secured = Boolean(event.auth.guestPasswordHash);
  const allowGuestDownload = Boolean(event.settings.allowGuestDownload && secured);
  return {
    eventId: event.eventId,
    allowedMimeTypes: event.allowedMimeTypes || [],
    name: event.name,
    description: event.description || "",
    secured,
    allowGuestDownload,
    uploadMaxFileSizeBytes: UPLOAD_MAX_FILE_SIZE_BYTES,
    uploadMaxTotalSizeBytes: UPLOAD_MAX_TOTAL_SIZE_BYTES,
    createdAt: event.createdAt,
  };
};
