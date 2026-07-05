import { X } from 'lucide-react';
import { useEffect, useId } from 'react';

export default function ModalDrawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  mode = 'drawer',
  className = ''
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }

    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-drawer-open');

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-drawer-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`modal-drawer-layer ${mode}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <button type="button" className="modal-drawer-backdrop" onClick={onClose} aria-label="Close modal" />
      <section className={`modal-drawer-panel ${size} ${className}`}>
        <div className="modal-drawer-head">
          <div className="modal-drawer-title-block">
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-drawer-body">{children}</div>
        {footer && <div className="modal-drawer-footer">{footer}</div>}
      </section>
    </div>
  );
}
