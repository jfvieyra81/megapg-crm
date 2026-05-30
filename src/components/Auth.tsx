// src/components/Auth.tsx
//
// Pantallas de autenticación, extraídas de App.tsx.
//   - LoginScreen: envío de magic link (sin contraseña).
//   - AccessDeniedScreen: email autenticado pero no registrado en el CRM.
//
// La capa de auth (authSendMagicLink y las demás funciones auth*) sigue
// viviendo en App.tsx; aquí solo se inyecta `sendMagicLink` como prop a
// LoginScreen para mantener el componente desacoplado de esa capa.
// Cuando se extraiga `lib/auth.ts`, App.tsx seguirá pasando la misma prop.

import React, { useState } from "react";
import { Btn } from "./ui";

type MagicLinkResult = { ok: boolean; error?: string };

type LoginStep = "idle" | "sending" | "sent" | "error";

interface LoginScreenProps {
  sendMagicLink: (email: string) => Promise<MagicLinkResult>;
  // Vestigial: la firma original lo recibía pero nunca se usa ni se pasa.
  // Se mantiene opcional para no alterar el contrato; limpiar en barrido futuro.
  onLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ sendMagicLink }) => {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<LoginStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!email || !email.includes("@")) { setError("Ingresa un email válido"); return; }
    setStep("sending");
    setError(null);
    const r = await sendMagicLink(email.trim().toLowerCase());
    if (r.ok) setStep("sent");
    else { setStep("error"); setError(r.error ?? null); }
  };

  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #FDF2E9 0%, #FEF9E7 100%)", padding: 20 }}>
    <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 12, padding: "32px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <img src="/logo.png" alt="Dulce Sabor" style={{ height: 56, width: "auto" }} onError={e => { e.currentTarget.style.display = "none"; }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#C41E3A" }}>Dulce Sabor CRM</div>
          <div style={{ fontSize: 12, color: "#888" }}>v5.18 — Acceso protegido</div>
        </div>
      </div>

      {step === "idle" && <>
        <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, marginBottom: 18 }}>Ingresa tu email autorizado. Te enviaremos un enlace mágico para entrar (sin contraseña).</p>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} placeholder="tu@email.com" autoFocus style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }} />
        {error && <div style={{ fontSize: 12, color: "#C41E3A", marginBottom: 12 }}>{error}</div>}
        <Btn primary onClick={send} style={{ width: "100%", padding: "10px 0" }}>Enviar enlace mágico</Btn>
      </>}

      {step === "sending" && <p style={{ fontSize: 13, color: "#555", textAlign: "center", padding: 20 }}>⏳ Enviando enlace a <b>{email}</b>...</p>}

      {step === "sent" && <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#1B7340", marginBottom: 8 }}>¡Enlace enviado!</p>
        <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>Revisa tu inbox en <b>{email}</b>. Click el enlace y volverás aquí ya logueado. El enlace expira en ~1 hora.</p>
        <p style={{ fontSize: 11, color: "#999", marginTop: 16 }}>¿No llegó? Revisa spam, o <button onClick={() => setStep("idle")} style={{ background: "none", border: "none", color: "#1A5276", textDecoration: "underline", cursor: "pointer", fontSize: 11, padding: 0 }}>vuelve a intentar</button>.</p>
      </div>}

      {step === "error" && <div>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>⚠️</div>
        <p style={{ fontSize: 13, color: "#C41E3A", textAlign: "center", marginBottom: 12 }}>Error: {error}</p>
        <Btn onClick={() => { setStep("idle"); setError(null); }} style={{ width: "100%" }}>Volver a intentar</Btn>
      </div>}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee", fontSize: 11, color: "#999", textAlign: "center" }}>
        Solo emails autorizados pueden entrar. Si tu email no está en la lista, contacta al admin.
      </div>
    </div>
  </div>;
};

interface AccessDeniedScreenProps {
  email?: string;
  onLogout: () => void;
}

export const AccessDeniedScreen: React.FC<AccessDeniedScreenProps> = ({ email, onLogout }) => {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #FDF2F2 0%, #FEF9E7 100%)", padding: 20 }}>
    <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 12, padding: "32px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
      <p style={{ fontSize: 17, fontWeight: 700, color: "#C41E3A", marginBottom: 8 }}>Acceso no autorizado</p>
      <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>El email <b>{email}</b> está autenticado pero no está registrado en el CRM. Contacta al admin para que te dé acceso.</p>
      <Btn onClick={onLogout} style={{ marginTop: 18 }}>Cerrar sesión</Btn>
    </div>
  </div>;
};
