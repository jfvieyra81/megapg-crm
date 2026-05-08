// src/components/ui.tsx
//
// Primitivos de UI compartidos por los componentes del CRM.
// Estilos inline preservados igual que en App.jsx (la migración a
// Tailwind/shadcn es paso 4 del plan de refactor, no este).
//
// Extraído de App.jsx en Sesión 2 bloque 4 del refactor.

import type { CSSProperties, ReactNode } from "react";

// ============================================================
// Btn — botón genérico con variantes primary/danger/small
// ============================================================

interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export const Btn = ({
  children,
  onClick,
  primary,
  danger,
  small,
  disabled,
  style,
}: BtnProps) => (
  <button
    disabled={disabled}
    onClick={onClick}
    style={{
      padding: small ? "4px 10px" : "8px 16px",
      fontSize: small ? 12 : 13,
      fontWeight: 600,
      border: "none",
      borderRadius: 6,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      background: danger ? "#C41E3A" : primary ? "#1B7340" : "#f0f0f0",
      color: primary || danger ? "#fff" : "#333",
      ...style,
    }}
  >
    {children}
  </button>
);

// ============================================================
// Badge — etiqueta de color para estados/categorías
// ============================================================

interface BadgeProps {
  text: string;
  color: string;
}

export const Badge = ({ text, color }: BadgeProps) => (
  <span
    style={{
      background: color + "22",
      color,
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 4,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

// ============================================================
// Modal — overlay con cierre y opcional ancho extendido
// ============================================================

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export const Modal = ({ title, onClose, children, wide }: ModalProps) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999,
    }}
  >
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        width: "92%",
        maxWidth: wide ? 800 : 600,
        maxHeight: "88vh",
        overflow: "auto",
        padding: "20px 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3
          style={{ fontSize: 18, fontWeight: 700, color: "#C41E3A" }}
        >
          {title}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: "#999",
          }}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ============================================================
// Inp — input/select/textarea con label
// ============================================================

interface InpProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  style?: CSSProperties;
  /** Si está presente, renderiza como <select> con estas opciones. */
  options?: readonly string[];
  /** Si true, renderiza como <textarea>. Tiene precedencia sobre `type`. */
  textarea?: boolean;
}

export const Inp = ({
  label,
  value,
  onChange,
  type,
  placeholder,
  style,
  options,
  textarea,
}: InpProps) => (
  <div style={{ marginBottom: 10, ...style }}>
    {label && (
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "#555",
          marginBottom: 3,
        }}
      >
        {label}
      </label>
    )}
    {options ? (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "7px 10px",
          border: "1px solid #ddd",
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <option value="">-- Select --</option>
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : textarea ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          padding: "7px 10px",
          border: "1px solid #ddd",
          borderRadius: 6,
          fontSize: 13,
          resize: "vertical",
        }}
      />
    ) : (
      <input
        type={type || "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "7px 10px",
          border: "1px solid #ddd",
          borderRadius: 6,
          fontSize: 13,
        }}
      />
    )}
  </div>
);
