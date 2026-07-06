import type { ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  /** click on the dimmed backdrop; omit to make the modal non-dismissable */
  onBackdrop?: () => void;
  children: ReactNode;
  /** max width of the frame (default 440) */
  maxWidth?: number;
};

/**
 * Modal — the prototype's centred overlay: dimmed blurred backdrop + an ornate
 * `.frame` card that rises in. Used for the match-result dialog. Kept local to
 * the feature layer (the shared component library has no modal).
 */
export function Modal({ open, onBackdrop, children, maxWidth = 440 }: ModalProps) {
  if (!open) return null;
  return (
    <div
      onClick={onBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(10,5,20,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
        animation: "fdrise .3s ease both",
      }}
    >
      <div
        className="frame"
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(94vw, ${maxWidth}px)`, padding: 34, textAlign: "center" }}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
