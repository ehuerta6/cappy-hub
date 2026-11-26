"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";

type ToastItem = {
  id: number;
  message: string;
  kind: "success" | "error";
  leaving?: boolean;
};

const TOAST_EVENT = "cappy:toast";
const TOAST_DURATION_MS = 3200;
const TOAST_EXIT_MS = 170;

export function emitToast(
  message: string,
  kind: "success" | "error" = "success",
) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, kind } }),
  );
}

export default function ToastRegion() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) =>
      current.map((item) =>
        item.id === id ? { ...item, leaving: true } : item,
      ),
    );
    const exitTimer = window.setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_EXIT_MS);
    timersRef.current.set(id, exitTimer);
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, delay = TOAST_DURATION_MS) => {
      const existing = timersRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      const timer = window.setTimeout(() => dismiss(id), delay);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    let nextId = 1;
    const timers = timersRef.current;
    const onToast = (event: Event) => {
      const detail = (
        event as CustomEvent<{ message?: string; kind?: "success" | "error" }>
      ).detail;
      if (!detail?.message) return;
      const message = detail.message;
      const kind = detail.kind ?? "success";
      let targetId: number | null = null;
      setToasts((current) => {
        const existing = current.find(
          (item) =>
            !item.leaving && item.message === message && item.kind === kind,
        );
        if (existing) {
          targetId = existing.id;
          return current;
        }
        const id = nextId++;
        targetId = id;
        return [...current.slice(-2), { id, message, kind }];
      });
      if (targetId !== null) scheduleDismiss(targetId);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [scheduleDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          onMouseEnter={() => {
            if (toast.leaving) return;
            const timer = timersRef.current.get(toast.id);
            if (timer !== undefined) {
              window.clearTimeout(timer);
              timersRef.current.delete(toast.id);
            }
          }}
          onMouseLeave={() => {
            if (!toast.leaving) scheduleDismiss(toast.id, 1200);
          }}
          className={`cappy-toast pointer-events-auto ${
            toast.kind === "error"
              ? "cappy-toast--error"
              : "cappy-toast--success"
          }${toast.leaving ? " cappy-toast--leaving" : ""}`}
        >
          <span className="cappy-toast-icon" aria-hidden="true">
            {toast.kind === "error" ? (
              <AlertCircle size={13} />
            ) : (
              <Check size={12} strokeWidth={2.75} />
            )}
          </span>
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
            className="cappy-toast-dismiss"
          >
            <X aria-hidden="true" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
