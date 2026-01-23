import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../../api/client";
import { ModalDialog } from "../../../components/ui/ModalDialog";

type DeleteEventSectionProps = {
  eventId: string;
  apiClient: ApiClient;
  onDeleteSuccess: () => void;
  onApiError: (error: unknown, defaultMessage: string) => void;
};

export function DeleteEventSection({
  eventId,
  apiClient,
  onDeleteSuccess,
  onApiError,
}: DeleteEventSectionProps) {
  const { t } = useTranslation();
  const [deleteValue, setDeleteValue] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const confirmDeleteEvent = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const cancelDeleteEvent = useCallback(() => {
    setShowDeleteConfirm(false);
    setDeleteMessage("");
  }, []);

  const deleteEvent = useCallback(async () => {
    setDeleteMessage("");
    try {
      await apiClient.deleteEvent(eventId);
      setShowDeleteConfirm(false);
      onDeleteSuccess();
    } catch (error) {
      onApiError(error, t("DeleteEventSection.deleteFailed"));
      const errMessage =
        error instanceof Error ? error.message : t("DeleteEventSection.deleteFailed");
      setDeleteMessage(errMessage);
    }
  }, [apiClient, eventId, onApiError, onDeleteSuccess, t]);

  return (
    <>
      <div className="form-card danger-zone" data-testid="admin-delete-section">
        <h2 data-testid="admin-delete-title">{t("DeleteEventSection.title")}</h2>
        <p className="helper">{t("DeleteEventSection.confirmLabel", { subdomain: eventId })}</p>
        <p className="helper status bad">{t("DeleteEventSection.warning")}</p>
        <div className="field">
          <input
            type="text"
            value={deleteValue}
            onChange={(event) => setDeleteValue(event.target.value.trim())}
            placeholder={eventId}
            data-testid="admin-delete-input"
          />
        </div>
        {deleteMessage ? <p className="helper status bad">{deleteMessage}</p> : null}
        <div className="actions">
          <button
            type="button"
            className="danger"
            disabled={deleteValue !== eventId}
            onClick={confirmDeleteEvent}
            data-testid="admin-delete-open"
          >
            {t("DeleteEventSection.deleteButton")}
          </button>
        </div>
      </div>
      <ModalDialog
        open={showDeleteConfirm}
        title={t("DeleteEventSection.dialogTitle")}
        subtitle={t("DeleteEventSection.dialogSubtitle")}
        onCancel={cancelDeleteEvent}
        onConfirm={deleteEvent}
        confirmLabel={t("DeleteEventModal.confirm")}
        closeOnEscape
      >
        <p className="helper" style={{ textAlign: "left" }}>
          {t("DeleteEventSection.dialogQuestion", { subdomain: eventId })}
        </p>
        <p className="helper status bad" style={{ marginTop: "12px", textAlign: "left" }}>
          {t("DeleteEventSection.dialogWarning")}
        </p>
        {deleteMessage ? (
          <p className="helper status bad" style={{ marginTop: "12px", textAlign: "left" }}>
            {deleteMessage}
          </p>
        ) : null}
      </ModalDialog>
    </>
  );
}
