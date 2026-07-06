import { useAppStore } from "../../stores/appStore";

/**
 * Toasts — bottom-centre stack of transient messages. Rendered once by the app
 * layout; every "coming soon" / feedback action pushes through appStore.showToast
 * so buttons always DO something visible.
 */
export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "center",
        pointerEvents: "none",
        width: "min(92vw, 460px)",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            width: "100%",
            padding: "13px 18px",
            borderRadius: 12,
            border: "1px solid rgba(232,184,75,.4)",
            background: "linear-gradient(180deg,#231239,#180c2a)",
            color: "var(--text)",
            font: "600 13px Inter",
            textAlign: "center",
            boxShadow: "0 14px 34px rgba(0,0,0,.55)",
            animation: "fdrise .25s ease both",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default Toasts;
