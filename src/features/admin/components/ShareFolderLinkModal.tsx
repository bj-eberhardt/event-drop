import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { ModalDialog } from "../../../components/ui/ModalDialog";
import { CopyIcon, QrIcon } from "../../../components/ui/icons";
import { encodeUploadPreset } from "../../../lib/uploadLink";
import { FOLDER_PATTERN, isFolderNameValid } from "../../../lib/folderValidation";

type ShareFolderLinkModalProps = {
  open: boolean;
  shareUrl: string;
  onClose: () => void;
  onCopy: (url: string) => void;
  onQr: (url: string) => void;
  t: TFunction;
};

export function ShareFolderLinkModal({
  open,
  shareUrl,
  onClose,
  onCopy,
  onQr,
  t,
}: ShareFolderLinkModalProps) {
  const [folderName, setFolderName] = useState("");

  const folderShareUrl = useMemo(() => {
    if (!open) return "";
    const trimmed = folderName.trim();
    if (!isFolderNameValid(trimmed)) return "";
    try {
      const url = new URL(shareUrl);
      url.searchParams.set("u", encodeUploadPreset({ folder: trimmed }));
      return url.toString();
    } catch {
      return "";
    }
  }, [folderName, open, shareUrl]);

  const close = () => {
    setFolderName("");
    onClose();
  };

  const isValid = folderName.trim().length > 0 ? isFolderNameValid(folderName) : true;

  return (
    <ModalDialog
      open={open}
      title={t("AdminView.shareFolderModalTitle")}
      subtitle={t("AdminView.shareFolderModalSubtitle")}
      cancelLabel={t("NewEventView.cancel")}
      onCancel={close}
      closeOnEscape
      showDefaultActions={false}
      footerSlot={
        <div
          className="modal-controls"
          style={{ padding: "12px 14px", justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="ghost"
            onClick={close}
            data-testid="admin-share-folder-close"
          >
            {t("NewEventView.cancel")}
          </button>
        </div>
      }
    >
      <div data-testid="admin-share-folder-modal">
        <label className="field">
          <span>{t("AdminView.shareFolderNameLabel")}</span>
          <input
            type="text"
            placeholder={t("AdminView.shareFolderNamePlaceholder")}
            pattern={FOLDER_PATTERN}
            maxLength={32}
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            data-testid="admin-share-folder-input"
          />
          {!isValid ? (
            <p className="helper status bad">{t("AdminView.shareFolderNameInvalid")}</p>
          ) : null}
          <p className="hint">{t("AdminView.shareFolderNameHint")}</p>
        </label>

        <label className="field">
          <span>{t("AdminView.shareFolderLinkLabel")}</span>
          <div className="input-with-action share-input-row">
            <input
              type="text"
              readOnly
              value={folderShareUrl}
              data-testid="admin-share-folder-link-input"
            />
            <button
              type="button"
              className="ghost share-copy-text"
              onClick={() => onCopy(folderShareUrl)}
              disabled={!folderShareUrl}
              data-testid="admin-share-folder-copy"
            >
              {t("AdminView.shareCopy")}
            </button>
            <button
              type="button"
              className="icon-btn share-copy-icon"
              onClick={() => onCopy(folderShareUrl)}
              disabled={!folderShareUrl}
              data-testid="admin-share-folder-copy-icon"
            >
              <CopyIcon size={16} />
            </button>
            <button
              type="button"
              className="icon-btn share-qr-btn"
              onClick={() => onQr(folderShareUrl)}
              disabled={!folderShareUrl}
              data-testid="admin-share-folder-qr"
            >
              <QrIcon />
            </button>
          </div>
          <p className="helper">{t("AdminView.shareFolderLinkHint")}</p>
        </label>
      </div>
    </ModalDialog>
  );
}
