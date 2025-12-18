import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

type ModalDialogProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
};

export function ModalDialog({
  open,
  title,
  subtitle,
  children,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
}: ModalDialogProps) {
  useEffect(() => {
    if (open) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-subtitle">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onCancel} title={cancelLabel}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-controls" style={{ padding: "12px 14px", justifyContent: "flex-end" }}>
          <button type="button" className="ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          {onConfirm ? (
            <button type="button" className="danger" onClick={onConfirm}>
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
