// @ts-nocheck
// src/components/ui.tsx
//
// Componentes UI primitivos compartidos entre módulos.
// Extraídos de App.tsx en Block 4.b del refactor.
//
// @ts-nocheck porque los estilos inline usan tipos relajados que
// TypeScript strict rechaza (spread de style, etc). Se limpiará
// en el paso 3 (Tailwind + shadcn).

import React from "react";

// ============================================================
// Badge — etiqueta de color inline
// ============================================================

interface BadgeProps {
  text: string;
  color: string;
}

export const Badge: React.FC<BadgeProps> = ({ text, color }) => (
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
// Btn — botón genérico con variantes
// ============================================================

interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const Btn: React.FC<BtnProps> = ({
  children,
  onClick,
  primary,
  danger,
  small,
  disabled,
  style: s,
}) => (
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
      ...s,
    }}
  >
    {children}
  </button>
);

// ============================================================
// Modal — overlay centrado con título y botón cerrar
// ============================================================

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ title, onClose, children, wide }) => (
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
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#C41E3A" }}>{title}</h3>
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
// Card — métrica con título, valor y subtítulo
// ============================================================

interface CardProps {
  title: string;
 value: string | number;
  sub?: string;
  color?: string;
}

export const Card: React.FC<CardProps> = ({ title, value, sub, color }) => (
  <div
    style={{
      background: "#f8f8f8",
      borderRadius: 8,
      padding: "12px 14px",
      borderLeft: `4px solid ${color || "#1B7340"}`,
      minWidth: 0,
    }}
  >
    <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{title}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: color || "#1B7340" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{sub}</div>}
  </div>
);

// ============================================================
// Inp — input/select/textarea genérico con label
// ============================================================

interface InpProps {
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  options?: readonly string[];
  textarea?: boolean;
}

export const Inp: React.FC<InpProps> = ({
  label,
  value,
  onChange,
  type,
  placeholder,
  style: s,
  options,
  textarea,
}) => (
  <div style={{ marginBottom: 10, ...s }}>
    {label && (
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>
        {label}
      </label>
    )}
    {options ? (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
      >
        <option value="">-- Select --</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : textarea ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical" }}
      />
    ) : (
      <input
        type={type || "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
      />
    )}
  </div>
);
interface STProps {
  children: React.ReactNode;
}
export const ST = ({ children }: STProps) => (
  <h3
    style={{
      fontSize: 15,
      fontWeight: 700,
      marginBottom: 10,
      marginTop: 16,
      color: "#C41E3A",
      borderBottom: "2px solid #C41E3A",
      paddingBottom: 4,
    }}
  >
    {children}
  </h3>
);