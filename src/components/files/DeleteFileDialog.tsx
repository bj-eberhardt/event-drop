import { ModalDialog } from "../ui/ModalDialog";

type DeleteFileDialogProps = {
  open: boolean;
  filename: string;
  confirmLabel: string;
  cancelLabel: string;
  message: string;
  skipPrompt: boolean;
  onToggleSkipPrompt: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  skipLabel: string;
};

export const DeleteFileDialog = ({
  open,
  filename,
  confirmLabel,
  cancelLabel,
  message,
  skipPrompt,
  onToggleSkipPrompt,
  onCancel,
  onConfirm,
  skipLabel,
}: DeleteFileDialogProps) => {
  return (
    <ModalDialog
      open={open}
      title={confirmLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      footerSlot={
        <label className="checkbox-helper">
          <input
            type="checkbox"
            checked={skipPrompt}
            onChange={(event) => onToggleSkipPrompt(event.target.checked)}
          />
          <span>{skipLabel}</span>
        </label>
      }
    >
      {filename ? message : null}
    </ModalDialog>
  );
};
