// src/components/Welcomes.tsx
//
// Bienvenida a clientes nuevos.
// Muestra clientes que hicieron su primer pedido en los últimos
// WELCOME_MAX_DAYS días y aún no han recibido mensaje de bienvenida.
// Después de "Marcar enviado" el cliente sale de la lista para siempre.
//
// Extraído de App.tsx en Block 4.c del refactor.

import React, { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Client, ClientTier, Order } from "../types/domain";
import { Badge, Btn, Card } from "./ui";
import { fmt, fmtD } from "../lib/format";

// ============================================================
// Constantes y helpers locales
// Duplicación temporal con App.tsx mientras dura el refactor —
// se consolidan cuando el resto de los componentes salgan del monolito.
// ============================================================

/** Ventana en días después del primer pedido para mostrar bienvenida. */
const WELCOME_MAX_DAYS = 14;

/** Color por tier para Badge. */
const TIER_CLR: Record<ClientTier, string> = {
  Lista: "#888",
  Bronce: "#996633",
  Plata: "#1A5276",
  Oro: "#1B7340",
};

/** Días enteros transcurridos desde una fecha (truncado). */
const dSince = (d: string | number | Date): number => {
  try {
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  } catch {
    return 999;
  }
};

/** Construye el deep link de WhatsApp con teléfono normalizado. */
const waLink = (phone: string, msg: string): string =>
  `https://wa.me/${(phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;

interface WaBtnProps {
  phone: string;
  msg: string;
  label?: string;
  small?: boolean;
}

const WaBtn: React.FC<WaBtnProps> = ({ phone, msg, label, small }) => (
  <a
    href={waLink(phone, msg)}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: small ? "3px 8px" : "6px 12px",
      background: "#25D366",
      color: "#fff",
      borderRadius: 6,
      fontSize: small ? 10 : 12,
      fontWeight: 600,
      textDecoration: "none",
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}
  >
    {label || "WhatsApp"}
  </a>
);

// ============================================================
// Tipos públicos del módulo
// ============================================================

/** Registro de bienvenida ya enviada para un cliente. */
export interface WelcomeRecord {
  /** ISO datetime en que se marcó como enviado. */
  sentAt: string;
}

/** Mapa clientId → registro de bienvenida. */
export type WelcomesState = Record<string, WelcomeRecord>;

/** Fila derivada (cliente + primer pedido) lista para renderizar. */
interface WelcomeRow {
  client: Client;
  firstO: Order;
  daysSinceFirst: number;
  topProd: string | null;
}

export interface WelcomesProps {
  clients: Client[];
  orders: Order[];
  welcomes: WelcomesState;
  setWelcomes: Dispatch<SetStateAction<WelcomesState>>;
  saveAll: (key: string, value: unknown) => void;
  /** Devuelve el nombre del producto por id, o null si no se encuentra.
   *  Se pasa como prop para no acoplar este componente al catálogo global. */
  getProductName: (productId: string) => string | null;
}

// ============================================================
// Componente
// ============================================================

const Welcomes: React.FC<WelcomesProps> = ({
  clients,
  orders,
  welcomes,
  setWelcomes,
  saveAll,
  getProductName,
}) => {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Clientes con primer pedido dentro de la ventana y sin bienvenida marcada.
  const rows: WelcomeRow[] = clients
    .filter(c => !welcomes[c.id])
    .map<WelcomeRow | null>(c => {
      const co = orders.filter(o => o.clientId === c.id);
      if (co.length === 0) return null; // sin pedidos aún, no aplica bienvenida
      const sorted = [...co].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const firstO = sorted[0];
      const daysSinceFirst = dSince(firstO.date);
      if (daysSinceFirst > WELCOME_MAX_DAYS) return null; // ya pasó la ventana
      const topItem = [...(firstO.items || [])].sort((a, b) => b.qty - a.qty)[0];
      const topProd = topItem ? getProductName(topItem.productId) : null;
      return { client: c, firstO, daysSinceFirst, topProd };
    })
    .filter((r): r is WelcomeRow => r !== null)
    .sort((a, b) => a.daysSinceFirst - b.daysSinceFirst); // más recientes primero

  const defaultMsg = (r: WelcomeRow): string => {
    const name = r.client.contact || r.client.name;
    return `¡Hola ${name}!\n\nSoy José de Dulce Sabor y te quiero dar la bienvenida como nuevo cliente. ¡Gracias por tu confianza!\n\nAquí va toda la información que necesitas:\n\n📦 Productos: Dulces mexicanos auténticos con entrega directa en tu zona\n💰 Formas de pago: Efectivo, Zelle (megapg.norcal@gmail.com), Venmo (@MegaPG-NorCal) o cheque a nombre de Dulce Sabor LLC\n🌐 Ordena en línea cuando necesites: https://dulcesaborca.com\n📞 Cualquier duda o pedido: (707) 360-7420\n\nEstoy a tus órdenes. Mi meta es que tus ventas crezcan — si hay algo que puedo hacer mejor, avísame con confianza.\n\n¡Gracias y bienvenid@ a la familia Dulce Sabor!\nJosé Flores`;
  };

  const getMsg = (r: WelcomeRow): string =>
    edits[r.client.id] ?? defaultMsg(r);

  const copyMsg = async (r: WelcomeRow): Promise<void> => {
    try {
      await navigator.clipboard.writeText(getMsg(r));
      setCopied(r.client.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert("Copy falló — selecciona el texto manualmente");
    }
  };

  const markSent = (r: WelcomeRow): void => {
    const updated: WelcomesState = {
      ...welcomes,
      [r.client.id]: { sentAt: new Date().toISOString() },
    };
    setWelcomes(updated);
    saveAll("welcomes", updated);
  };

  const renderRow = (r: WelcomeRow) => {
    const msg = getMsg(r);
    return (
      <div
        key={r.client.id}
        style={{
          background: "#fff",
          border: "1px solid #eee",
          borderLeft: "4px solid #1B7340",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>
              {r.client.name}{" "}
              <Badge text={r.client.tier} color={TIER_CLR[r.client.tier]} />{" "}
              <Badge text="NUEVO" color="#1B7340" />
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
              {r.client.contact || "—"} • {r.client.phone || "sin teléfono"} •{" "}
              {r.client.zone || "—"}
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
              Primer pedido: <b>{fmtD(r.firstO.date)}</b> ({fmt(r.firstO.total)})
              {r.topProd ? ` • ${r.topProd}` : ""}
            </div>
          </div>
          <Badge
            text={r.daysSinceFirst === 0 ? "Hoy" : `Hace ${r.daysSinceFirst}d`}
            color="#1B7340"
          />
        </div>
        <textarea
          value={msg}
          onChange={e =>
            setEdits(p => ({ ...p, [r.client.id]: e.target.value }))
          }
          rows={10}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Btn small primary onClick={() => copyMsg(r)}>
            {copied === r.client.id ? "✓ Copiado" : "Copiar mensaje"}
          </Btn>
          {r.client.phone && (
            <WaBtn
              phone={r.client.phone}
              msg={msg}
              label="Abrir WhatsApp"
              small
            />
          )}
          <Btn
            small
            onClick={() => markSent(r)}
            style={{ background: "#1B7340", color: "#fff" }}
          >
            Marcar enviado
          </Btn>
          {edits[r.client.id] !== undefined && (
            <Btn
              small
              onClick={() =>
                setEdits(p => {
                  const n = { ...p };
                  delete n[r.client.id];
                  return n;
                })
              }
            >
              Reset texto
            </Btn>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div
        style={{
          background: "#E8F5E8",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          borderLeft: "4px solid #1B7340",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#1B7340",
            marginBottom: 4,
          }}
        >
          Bienvenida a nuevos clientes
        </div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
          Clientes que hicieron su primer pedido en los últimos{" "}
          {WELCOME_MAX_DAYS} días y aún no han recibido mensaje de bienvenida.
          Un cliente solo aparece aquí una vez — después de "Marcar enviado",
          sale para siempre.
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Card
          title="Nuevos clientes"
          value={String(rows.length)}
          color="#1B7340"
        />
        <Card
          title="Ya bienvenidos"
          value={String(Object.keys(welcomes).length)}
          color="#888"
        />
      </div>
      {rows.length === 0 && (
        <div
          style={{
            padding: "32px",
            textAlign: "center",
            color: "#999",
            fontSize: 13,
            background: "#f8f8f8",
            borderRadius: 8,
          }}
        >
          No hay clientes nuevos pendientes de bienvenida. 🎉
        </div>
      )}
      {rows.map(r => renderRow(r))}
    </div>
  );
};

export default Welcomes;
