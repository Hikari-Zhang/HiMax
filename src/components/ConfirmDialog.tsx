import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  showDeleteFile?: boolean
  onConfirm: (deleteFile: boolean) => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  showDeleteFile = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [deleteFile, setDeleteFile] = useState(false)

  // Reset checkbox when dialog opens
  useEffect(() => {
    if (open) setDeleteFile(false)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-[5px] z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 w-[380px] max-w-full bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-3">
          {danger && (
            <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-error" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Delete file option */}
        {showDeleteFile && (
          <div className="pl-[29px] pr-6 py-3">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={deleteFile}
                onChange={(e) => setDeleteFile(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-bg-primary accent-error cursor-pointer"
              />
              <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                {t('confirm.alsoDeleteFile')}
              </span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pl-6 pr-[19px] py-4 border-t border-border bg-bg-primary/30">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-medium text-text-secondary bg-bg-hover hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {cancelLabel || t('confirm.cancel')}
          </button>
          <button
            onClick={() => onConfirm(deleteFile)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              danger
                ? 'bg-error text-white hover:bg-error/80'
                : 'bg-accent text-white hover:bg-accent/80'
            }`}
          >
            {confirmLabel || t('confirm.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
