/**
 * Small centered yes/no confirmation overlay — used wherever an action
 * should not fire on a single accidental tap (advancing the day, starting a
 * new game over the current run, exiting to the title screen). Deliberately
 * a separate, higher-stacking overlay from `PopupLayer` (a bottom-sheet
 * panel meant for browsing content) rather than reusing it — a confirm is a
 * short yes/no interrupt, not a screen.
 */

interface ConfirmDialogProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
