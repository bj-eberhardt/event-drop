import { useCallback, useState } from "react";
import type { ApiClient } from "../../api/client";
import { ModalDialog } from "../ui/ModalDialog";

type DeleteProjectSectionProps = {
  subdomain: string;
  apiClient: ApiClient;
  onDeleteSuccess: () => void;
  onApiError: (error: unknown, defaultMessage: string) => void;
};

export function DeleteProjectSection({
  subdomain,
  apiClient,
  onDeleteSuccess,
  onApiError,
}: DeleteProjectSectionProps) {
  const [deleteValue, setDeleteValue] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const confirmDeleteProject = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const cancelDeleteProject = useCallback(() => {
    setShowDeleteConfirm(false);
    setDeleteMessage("");
  }, []);

  const deleteProject = useCallback(async () => {
    setDeleteMessage("");
    try {
      await apiClient.deleteProject(subdomain);
      setShowDeleteConfirm(false);
      onDeleteSuccess();
    } catch (error) {
      onApiError(error, "Löschen fehlgeschlagen.");
      const errMessage = error instanceof Error ? error.message : "Löschen fehlgeschlagen.";
      setDeleteMessage(errMessage);
    }
  }, [apiClient, onApiError, onDeleteSuccess, subdomain]);

  return (
    <>
      <div className="form-card danger-zone">
        <h2>Projekt löschen</h2>
        <p className="helper">
          Bitte tippe die Subdomain zur Bestätigung: <strong>{subdomain}</strong>
        </p>
        <p className="helper status bad">
          Hinweis: Nach dem Löschen können Gäste keine Dateien mehr hochladen und alle Daten (inkl.
          Dateien und Konfiguration) werden endgültig entfernt. Bitte vorab alle benötigten Dateien
          herunterladen.
        </p>
        <div className="field">
          <input
            type="text"
            value={deleteValue}
            onChange={(event) => setDeleteValue(event.target.value.trim())}
            placeholder={subdomain}
          />
        </div>
        {deleteMessage ? <p className="helper status bad">{deleteMessage}</p> : null}
        <div className="actions">
          <button
            type="button"
            className="danger"
            disabled={deleteValue !== subdomain}
            onClick={confirmDeleteProject}
          >
            Projekt endgültig löschen
          </button>
        </div>
      </div>
      <ModalDialog
        open={showDeleteConfirm}
        title="Projekt löschen bestätigen"
        subtitle="Diese Aktion kann nicht rückgängig gemacht werden"
        onCancel={cancelDeleteProject}
        onConfirm={deleteProject}
        confirmLabel="Endgültig löschen"
      >
        <p className="helper" style={{ textAlign: "left" }}>
          Möchtest du das Projekt <strong>{subdomain}</strong> wirklich endgültig löschen?
        </p>
        <p className="helper status bad" style={{ marginTop: "12px", textAlign: "left" }}>
          Alle Dateien und Konfigurationen werden unwiderruflich entfernt.
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
