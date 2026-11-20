import { useEffect, useRef, type ReactNode } from 'react';
import { useLayout } from '../lib/hooks';

/**
 * A pop-up window. On the phone it fills the screen like a sheet; on the
 * Mac it's a centered dialog. Escape or the Cancel button closes it.
 */
export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { onClose } = props;
  const panel = useRef<HTMLDivElement>(null);
  const layout = useLayout();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Move keyboard focus into the dialog (without popping up the phone keyboard).
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${layout === 'compact' ? 'sheet' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={panel} tabIndex={-1}>
        <div className="modal-head">
          <button className="plain" onClick={onClose}>
            Cancel
          </button>
          <h2>{props.title}</h2>
          <span className="modal-head-spacer" />
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}
