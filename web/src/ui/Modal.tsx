// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./index";
import { Icon } from "./Icon";

/**
 * A modal built on the native <dialog>, which traps focus, closes on Escape and returns focus to what opened it. On a phone it is
 * a bottom sheet; on a wide screen a centred dialog.
 */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const titleId = `modal-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself, not on anything inside it
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}

/** Asks before something that cannot be undone. */
export function ConfirmDialog({ open, title, confirmLabel, onConfirm, onCancel, busy, children }: { open: boolean; title: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
