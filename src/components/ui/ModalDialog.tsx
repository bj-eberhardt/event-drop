import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

type ModalDialogProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
  showDefaultActions?: boolean;
  closeOnEscape?: boolean;
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
  headerSlot,
  footerSlot,
  showDefaultActions = true,
  closeOnEscape = false,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
}: ModalDialogProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, onCancel, open]);

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
    <div className="modal" data-testid="modal">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-subtitle">{subtitle}</div> : null}
          </div>
          {headerSlot ? (
            <div className="modal-controls">{headerSlot}</div>
          ) : (
            <button
              className="icon-btn"
              onClick={onCancel}
              title={cancelLabel}
              data-testid="modal-close"
            >
              <CloseIcon></CloseIcon>
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footerSlot ? <>{footerSlot}</> : null}
        {showDefaultActions ? (
          <div
            className="modal-controls"
            style={{ padding: "12px 14px", justifyContent: "flex-end" }}
          >
            <button type="button" className="ghost" onClick={onCancel} data-testid="modal-cancel">
              {cancelLabel}
            </button>
            {onConfirm ? (
              <button
                type="button"
                className="danger"
                onClick={onConfirm}
                data-testid="modal-confirm"
              >
                {confirmLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
