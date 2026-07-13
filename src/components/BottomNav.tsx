import { useState, type CSSProperties, type ReactElement } from "react";

const BRAND = "#C41E3A";

type Tab = { id: string; l: string };

type Props = {
  active: string;
  onSelect: (id: string) => void;
  tabs: Tab[];
};

// Destinos primarios de la barra inferior. Los ids deben coincidir con
// los del array `tabs` de App.tsx.
const PRIMARY: { id: string; label: string; icon: ReactElement; fab?: boolean }[] = [
  { id: "dashboard", label: "Inicio", icon: iconHome() },
  { id: "clients", label: "Clientes", icon: iconUsers() },
  { id: "fieldorder", label: "Pedido", icon: iconPlus(), fab: true },
  { id: "orders", label: "Pedidos", icon: iconReceipt() },
];

const PRIMARY_IDS = new Set(PRIMARY.map(p => p.id));

function iconHome() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function iconUsers() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.7c2.3.4 4 2 4 4.3" /></svg>;
}
function iconPlus() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function iconReceipt() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" /><path d="M9 8h6M9 12h6" /></svg>;
}
function iconDots() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>;
}

/**
 * Barra de navegación inferior para celular: 4 destinos primarios + botón
 * "Más" que abre una hoja con el resto de las pestañas de App.tsx.
 */
export function BottomNav({ active, onSelect, tabs }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const rest = tabs.filter(t => !PRIMARY_IDS.has(t.id));
  const moreActive = !PRIMARY_IDS.has(active);

  const go = (id: string) => {
    onSelect(id);
    setSheetOpen(false);
  };

  const itemStyle = (isActive: boolean): CSSProperties => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: "6px 0 4px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: isActive ? BRAND : "#888",
    fontSize: 10,
    fontWeight: isActive ? 700 : 500,
  });

  return <>
    {sheetOpen && (
      <div onClick={() => setSheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }}>
        <div onClick={e => e.stopPropagation()} style={{ position: "fixed", left: 0, right: 0, bottom: 64, background: "#fff", borderRadius: "16px 16px 0 0", padding: "14px 14px 18px", zIndex: 999, boxShadow: "0 -4px 20px rgba(0,0,0,0.15)", maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ width: 36, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 12px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {rest.map(t => (
              <button key={t.id} onClick={() => go(t.id)} style={{ padding: "12px 10px", fontSize: 13, fontWeight: 600, textAlign: "left", border: `1px solid ${active === t.id ? BRAND : "#eee"}`, borderRadius: 10, cursor: "pointer", background: active === t.id ? "#FDF2F2" : "#fafafa", color: active === t.id ? BRAND : "#444" }}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 64, display: "flex", alignItems: "stretch", background: "#fff", borderTop: "1px solid #e5e5e5", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)", zIndex: 1000, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {PRIMARY.map(p =>
        p.fab
          ? <button key={p.id} onClick={() => go(p.id)} aria-label={p.label} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: 0 }}>
              <span style={{ width: 48, height: 48, marginTop: -16, borderRadius: "50%", background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(196,30,58,0.4)", border: "3px solid #fff" }}>{p.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active === p.id ? 700 : 500, color: active === p.id ? BRAND : "#888", marginTop: 1 }}>{p.label}</span>
            </button>
          : <button key={p.id} onClick={() => go(p.id)} style={itemStyle(active === p.id)}>
              {p.icon}
              <span>{p.label}</span>
            </button>
      )}
      <button onClick={() => setSheetOpen(o => !o)} style={itemStyle(moreActive || sheetOpen)}>
        {iconDots()}
        <span>Más</span>
      </button>
    </nav>
  </>;
}
