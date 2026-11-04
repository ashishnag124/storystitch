import type { FormEvent, ReactNode } from "react";
import "./forms.css";

/** Where emailed links come back to. */
export const ORIGIN = location.origin;

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

/** Passes the bot check's token to the iOS app, which shows this page in a WebView. */
export const sendToApp = (token: string | null) => window.ReactNativeWebView?.postMessage(token ?? "");

/** A real form, so Enter submits it and password managers recognize it. */
export function Form({ onSubmit, label, children }: { onSubmit: () => void; label?: string; children: ReactNode }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className="form" aria-label={label} onSubmit={submit}>
      {children}
    </form>
  );
}

interface FieldProps {
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}

export function Field({ label, type, value, onChange, autoComplete, minLength }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} autoComplete={autoComplete} required minLength={minLength} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SubmitButton({ label, disabled, danger }: { label: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="submit" className={danger ? "submit danger" : "submit"} disabled={disabled}>
      {label}
    </button>
  );
}

export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="danger-zone">
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
