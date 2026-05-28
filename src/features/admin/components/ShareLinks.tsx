import { useState } from "react";
import type { TFunction } from "i18next";
import { CopyIcon, QrIcon } from "../../../components/ui/icons";
import type { TimedFeedbackMessage } from "../../../shared/hooks/useTimedFeedback";
import { ShareFolderLinkModal } from "./ShareFolderLinkModal";

type ShareLinksProps = {
  shareUrl: string;
  onCopy: (url: string) => void;
  onQr: (url: string) => void;
  feedback?: TimedFeedbackMessage | null;
  t: TFunction;
};

export function ShareLinks({ shareUrl, onCopy, onQr, feedback, t }: ShareLinksProps) {
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

  return (
    <div className="share-row">
      <span className="hint">{t("AdminView.shareLabel")}</span>
      <div className="input-with-action share-input-row">
        <input type="text" readOnly value={shareUrl} data-testid="admin-share-input" />
        <button
          type="button"
          className="ghost share-copy-text"
          onClick={() => onCopy(shareUrl)}
          title={t("AdminView.shareCopyLabel")}
          aria-label={t("AdminView.shareCopyLabel")}
          data-testid="admin-share-copy"
        >
          {t("AdminView.shareCopy")}
        </button>
        <button
          type="button"
          className="icon-btn share-copy-icon"
          onClick={() => onCopy(shareUrl)}
          title={t("AdminView.shareCopyLabel")}
          aria-label={t("AdminView.shareCopyLabel")}
          data-testid="admin-share-copy-icon"
        >
          <CopyIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-btn share-qr-btn"
          onClick={() => onQr(shareUrl)}
          title={t("AdminView.shareQrLabel")}
          aria-label={t("AdminView.shareQrLabel")}
          data-testid="admin-share-qr"
        >
          <QrIcon />
        </button>
      </div>
      <p className="helper">{t("AdminView.shareHint")}</p>
      {feedback ? <span className={`helper status ${feedback.tone}`}>{feedback.text}</span> : null}

      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="ghost ghost-small"
          onClick={() => setIsFolderModalOpen(true)}
          data-testid="admin-share-folder-open"
        >
          {t("AdminView.shareFolderLinkButton")}
        </button>
      </div>

      <ShareFolderLinkModal
        open={isFolderModalOpen}
        shareUrl={shareUrl}
        onClose={() => setIsFolderModalOpen(false)}
        onCopy={onCopy}
        onQr={onQr}
        t={t}
      />
    </div>
  );
}
