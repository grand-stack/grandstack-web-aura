// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";
import { statusView, type Tone } from "../lib/status";
import { Icon, type IconName } from "./Icon";

export function Button({ variant = "secondary", block, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; block?: boolean }) {
  return <button className={`btn btn-${variant}${block ? " btn-block" : ""} ${className}`} {...rest} />;
}

const STATUS_ICON: Record<string, IconName> = { dot: "dot", pause: "pause", stop: "stop", spinner: "spinner", alert: "alert" };

/** A status as an icon and a word, so colour is never the only signal. */
export function StatusChip({ status, label, tone }: { status?: string; label?: string; tone?: Tone }) {
  const view = status ? statusView(status) : { label: label ?? "", tone: tone ?? "neutral", icon: "dot" as const };
  const icon = STATUS_ICON[view.icon] ?? "dot";
  return (
    <span className={`status status-${tone ?? view.tone}`}>
      <Icon name={icon} size={icon === "dot" ? 8 : icon === "spinner" ? 12 : 11} className={icon === "spinner" ? "spinner" : undefined} />
      {label ?? view.label}
    </span>
  );
}

/** A tag that goes to a filtered list. */
export function TagLink({ to, children, small }: { to: string; children: ReactNode; small?: boolean }) {
  return <Link to={to} className={`tag${small ? " tag-small" : ""}`}>{children}</Link>;
}

export function TagButton({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick: () => void }) {
  return <button type="button" className={`tag${active ? " tag-active" : ""}`} aria-pressed={!!active} onClick={onClick}>{children}</button>;
}

/** A filter that is on, with a button to take it off. */
export function RemovableTag({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return (
    <span className="tag tag-removable">
      {children}
      <button type="button" onClick={onRemove} aria-label={`Remove filter: ${label}`}><Icon name="x" size={14} /></button>
    </span>
  );
}

export function Checkbox({ label, count, checked, onChange, disabled }: { label: string; count?: number; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={`check${disabled ? " check-disabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="label">{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </label>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "info" ? "status" : "alert"}>
      <Icon name={tone === "info" ? "info" : "warn"} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="emptystate">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Copies text, and says so. Falls back to a hidden field where the clipboard API is not available. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button type="button" className="iconbtn" onClick={copy} aria-label={copied ? `${label} copied` : `Copy ${label}`}>
      <Icon name={copied ? "check" : "copy"} />
      <span className="visually-hidden" role="status">{copied ? "Copied" : ""}</span>
    </button>
  );
}
