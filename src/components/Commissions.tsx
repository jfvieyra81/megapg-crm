// @ts-nocheck
// src/components/Commissions.tsx
//
// Módulo de comisiones mensuales — Deploy B.
// Cálculo en vivo, tabla detallada, CSV export (§5.4), freeze/unfreeze.
//
// Extraído de App.tsx en Block 4.b del refactor.
// Cero cambio de comportamiento — sólo reorganización.

import React, { useState, useMemo } from "react";

// Constantes contractuales (ya extraídas en Block 2.1.b)
import {
  COMM_RATE_NEW,
  COMM_RATE_RESIDUAL,
  COMM_RATE_PHASE2_BONUS,
  MILESTONES,
  POST_TERMINATION_TAIL_MONTHS,
  MOROSO_DAYS,
} from "../lib/contract";

// Lógica de negocio pura (ya extraída en Block 2.3)
import {
  effectiveCommissionRate,
  isInMonth,
  monthBounds,
  monthLabel,
  isActiveAccount,
  milestonesEarnedAt,
  getMorososForRep,
  isPhase2ActiveAt,
} from "../lib/business/commissions";

// Tipos de dominio
import type { Client, Order, Representative, Commission } from "../types/domain";

// Utilidades de formato compartidas
import { fmt, fmtD, uid } from "../lib/format";

// Componentes UI compartidos
import { Badge, Btn, Modal, Card } from "./ui";

// ============================================================
// Props
// ============================================================

interface CommissionsProps {
  representatives: Representative[];
  clients: Client[];
  orders: Order[];
  commissions: Commission[];
  setCommissions: (commissions: Commission[]) => void;
  saveAll: (type: string, data: unknown) => void;
}

// ============================================================
// Componente principal
// ============================================================

const Commissions: React.FC<CommissionsProps> = ({
  representatives,
  clients,
  orders,
  commissions,
  setCommissions,
  saveAll,
}) => {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedRepId, setSelectedRepId] = useState(representatives[0]?.id || "");
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);

  const rep = representatives.find(r => r.id === selectedRepId);

  // ¿Ya está congelado este período?
  const frozen = commissions.find(c => c.representativeId === selectedRepId && c.month === selectedMonth);

  // === Cálculo en vivo (si no está congelado, recalcula desde orders) ===
  const liveCalc = useMemo(() => {
    if (!rep) return null;
    const { start, end } = monthBounds(selectedMonth);

    // === Pedidos cobrados (status=paid + paidDate dentro del mes) de clientes asignados al rep ===
    const repClientIds = new Set(clients.filter(c => c.representativeId === rep.id).map(c => c.id));
    const paidThisMonth = orders.filter(o => repClientIds.has(o.clientId) && o.status === "paid" && o.paidDate && isInMonth(o.paidDate, selectedMonth));

    // Por cada pedido, aplicar reglas de Deploy C (tail, Phase 2)
    const positiveLines = paidThisMonth.map(o => {
      const client = clients.find(c => c.id === o.clientId);
      const calc = effectiveCommissionRate(rep, client, o, orders);
      const netSale = o.total || 0;
      const commission = netSale * calc.rate;
      return {
        kind: "sale",
        orderId: o.id,
        clientId: o.clientId,
        clientName: client?.name || "?",
        orderDate: o.date,
        paidDate: o.paidDate,
        netSale,
        classification: calc.classification,
        rate: calc.rate,
        commission,
        phase2Applied: calc.phase2Applied,
        tailApplied: calc.tailApplied
      };
    });

    // === Devoluciones / refunds dentro del mes (§6.1) ===
    const returnsThisMonth = orders.filter(o =>
      repClientIds.has(o.clientId) &&
      o.returnedAmount > 0 &&
      o.returnedDate &&
      isInMonth(o.returnedDate, selectedMonth)
    );
    const returnLines = returnsThisMonth.map(o => {
      const client = clients.find(c => c.id === o.clientId);
      const calc = effectiveCommissionRate(rep, client, o, orders);
      const netRefund = -1 * (o.returnedAmount || 0);
      const commissionReverse = netRefund * calc.rate;
      return {
        kind: "return",
        orderId: o.id,
        clientId: o.clientId,
        clientName: client?.name || "?",
        orderDate: o.date,
        paidDate: o.returnedDate,
        netSale: netRefund,
        classification: `↩ Refund (${calc.classification})`,
        rate: calc.rate,
        commission: commissionReverse,
        phase2Applied: calc.phase2Applied,
        tailApplied: calc.tailApplied
      };
    });

    const lines = [...positiveLines, ...returnLines];

    // === Subtotales ===
    const newCommission = lines.filter(l => l.classification.startsWith("Nueva")).reduce((s, l) => s + l.commission, 0);
    const residualCommission = lines.filter(l => l.classification.startsWith("Residual")).reduce((s, l) => s + l.commission, 0);
    const refundCommission = returnLines.reduce((s, l) => s + l.commission, 0);
    const tailCommission = lines.filter(l => l.tailApplied).reduce((s, l) => s + l.commission, 0);
    const phase2Bonus = lines.filter(l => l.phase2Applied).reduce((s, l) => s + l.netSale * COMM_RATE_PHASE2_BONUS, 0);
    const totalNetSales = positiveLines.reduce((s, l) => s + l.netSale, 0);
    const totalRefunds = Math.abs(returnsThisMonth.reduce((s, o) => s + (o.returnedAmount || 0), 0));

    // === Milestones (sólo si rep está dentro del contrato — no cuenta en tail) ===
    let peakActive = 0;
    let milestoneBonus = 0;
    let newMilestones = [];
    const repTerminated = rep.terminatedDate && new Date(rep.terminatedDate).getTime() <= end.getTime();
    if (!repTerminated) {
      const cur = new Date(start);
      while (cur < end) {
        const cnt = clients.filter(c => c.representativeId === rep.id && isActiveAccount(c.id, orders, cur)).length;
        if (cnt > peakActive) peakActive = cnt;
        cur.setDate(cur.getDate() + 1);
      }
      const earnedSoFar = milestonesEarnedAt(peakActive).map(m => m.count);
      const alreadyPaid = rep.milestonesPaid || [];
      newMilestones = MILESTONES.filter(m => earnedSoFar.includes(m.count) && !alreadyPaid.includes(m.count));
      milestoneBonus = newMilestones.reduce((s, m) => s + m.bonus, 0);
    }

    const totalCommission = lines.reduce((s, l) => s + l.commission, 0) + milestoneBonus;

    // === Morosos snapshot (informativo) ===
    const morosos = getMorososForRep(rep.id, clients, orders);

    // === Phase 2 / tail status this month ===
    const phase2ActiveDuringMonth = isPhase2ActiveAt(rep, end.toISOString()) || isPhase2ActiveAt(rep, start.toISOString());
    const tailDuringMonth = lines.some(l => l.tailApplied);

    return {
      lines: lines.sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate)),
      newCommission,
      residualCommission,
      refundCommission,
      tailCommission,
      phase2Bonus,
      milestoneBonus,
      newMilestones,
      peakActive,
      totalNetSales,
      totalRefunds,
      totalCommission,
      morosos,
      phase2ActiveDuringMonth,
      tailDuringMonth,
      repTerminated,
      activeNow: clients.filter(c => c.representativeId === rep.id && isActiveAccount(c.id, orders)).length
    };
  }, [rep, selectedMonth, clients, orders]);

  const data = frozen || liveCalc;

  // === Marcar pagado / congelar ===
  const freezePeriod = () => {
    if (!rep || !liveCalc) return;
    const record = {
      id: uid(),
      representativeId: rep.id,
      representativeName: rep.name,
      month: selectedMonth,
      status: "paid",
      paidOn: new Date().toISOString().slice(0, 10),
      lines: liveCalc.lines,
      newCommission: liveCalc.newCommission,
      residualCommission: liveCalc.residualCommission,
      refundCommission: liveCalc.refundCommission,
      tailCommission: liveCalc.tailCommission,
      phase2Bonus: liveCalc.phase2Bonus,
      milestoneBonus: liveCalc.milestoneBonus,
      newMilestones: liveCalc.newMilestones,
      peakActive: liveCalc.peakActive,
      totalNetSales: liveCalc.totalNetSales,
      totalRefunds: liveCalc.totalRefunds,
      totalAmount: liveCalc.totalCommission,
      phase2ActiveDuringMonth: liveCalc.phase2ActiveDuringMonth,
      tailDuringMonth: liveCalc.tailDuringMonth
    };
    const updated = [...commissions, record];
    setCommissions(updated);
    saveAll("commissions", updated);

    // Marcar milestones como pagados en el rep
    if (liveCalc.newMilestones.length > 0) {
      const newPaid = [...(rep.milestonesPaid || []), ...liveCalc.newMilestones.map(m => m.count)];
      const updatedReps = representatives.map(r => r.id === rep.id ? { ...r, milestonesPaid: newPaid } : r);
      saveAll("representatives", updatedReps);
      // Para forzar refresh inmediato emitimos evento custom:
      window.dispatchEvent(new CustomEvent("ds-reps-updated", { detail: updatedReps }));
    }
    setShowFreezeConfirm(false);
  };

  const unfreeze = () => {
    if (!frozen) return;
    if (!confirm("¿Descongelar este período? Las comisiones volverán a calcularse en vivo y los milestones marcados como pagados se mantendrán en el representante (edita manualmente si necesitas).")) return;
    const updated = commissions.filter(c => c.id !== frozen.id);
    setCommissions(updated);
    saveAll("commissions", updated);
  };

  // === CSV export §5.4 ===
  const exportCSV = () => {
    if (!data || !rep) return;
    const header = ["Tipo", "Cliente", "ID Pedido", "Fecha Pedido", "Fecha Cobro/Refund", "Venta Neta", "Clasificación", "Tasa", "Comisión"];
    const rows = data.lines.map(l => [
      l.kind === "return" ? "Refund" : "Venta",
      `"${l.clientName.replace(/"/g, '""')}"`,
      l.orderId.slice(-8),
      l.orderDate,
      l.paidDate,
      l.netSale.toFixed(2),
      `"${l.classification}"`,
      `${(l.rate * 100).toFixed(0)}%`,
      l.commission.toFixed(2)
    ]);
    rows.push(["", "", "", "", "", "", "", "", ""]);
    rows.push(["", "", "", "", "", "", "", "Subtotal Cuentas Nuevas:", data.newCommission.toFixed(2)]);
    rows.push(["", "", "", "", "", "", "", "Subtotal Residual:", data.residualCommission.toFixed(2)]);
    if (data.phase2Bonus > 0) rows.push(["", "", "", "", "", "", "", "  (incluye Fase 2 +2% delta):", data.phase2Bonus.toFixed(2)]);
    if (data.refundCommission < 0) rows.push(["", "", "", "", "", "", "", `Devoluciones (${fmt(data.totalRefunds)}):`, data.refundCommission.toFixed(2)]);
    if (data.milestoneBonus > 0) rows.push(["", "", "", "", "", "", "", `Milestones (${(data.newMilestones || []).map(m => m.count + " cuentas").join(", ")}):`, data.milestoneBonus.toFixed(2)]);
    rows.push(["", "", "", "", "", "", "", "TOTAL COMISIÓN:", data.totalCommission.toFixed(2)]);
    rows.push(["", "", "", "", "", "", "", `Pico cuentas activas:`, String(data.peakActive)]);
    rows.push(["", "", "", "", "", "", "", `Venta Neta total mes:`, data.totalNetSales.toFixed(2)]);
    if (data.repTerminated) rows.push(["", "", "", "", "", "", "", "Cola post-salida activa:", `Sí (24m desde ${rep.terminatedDate})`]);

    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Comisiones_${rep.name.replace(/\s+/g, "_")}_${selectedMonth}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // Genera lista de meses (últimos 12)
  const monthOptions = useMemo(() => {
    const arr: string[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const yyyymm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      arr.push(yyyymm);
      d.setMonth(d.getMonth() - 1);
    }
    return arr;
  }, []);

  if (representatives.length === 0) {
    return <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>
      No hay representantes registrados. Crea uno primero en el tab <b>Representantes</b>.
    </div>;
  }

  return <div>
    <div style={{ background: "#FEF9E7", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #F39C12" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#B7950B", marginBottom: 4 }}>💰 Comisiones — Reporte mensual §5.4</div>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
        Cálculo automático desde pedidos con status <b>paid</b> y <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3 }}>paidDate</code> dentro del mes seleccionado. <b>{Math.round(COMM_RATE_NEW * 100)}%</b> Cuenta Nueva, <b>{Math.round(COMM_RATE_RESIDUAL * 100)}%</b> Residual, <b>+{Math.round(COMM_RATE_PHASE2_BONUS * 100)}%</b> Fase 2 (§11.4 aditivo). Devoluciones (§6.1) se restan del mes de su fecha. Cola post-salida (§10.3): {POST_TERMINATION_TAIL_MONTHS} meses al {Math.round(COMM_RATE_RESIDUAL * 100)}% flat tras terminación. Milestones <b>{MILESTONES.map(m => `${m.count}=${fmt(m.bonus)}`).join(" / ")}</b> sobre pico de cuentas activas. Morosos (§6.2): pedidos entregados sin cobro &gt;{MOROSO_DAYS}d.
      </div>
    </div>

    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#555", marginRight: 6 }}>Representante:</label>
        <select value={selectedRepId} onChange={e => setSelectedRepId(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}>
          {representatives.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#555", marginRight: 6 }}>Mes:</label>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}>
          {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      {frozen ? <Badge text={`✅ Pagado ${fmtD(frozen.paidOn)}`} color="#1B7340" /> : <Badge text="🟡 En vivo" color="#F39C12" />}
      {liveCalc?.phase2ActiveDuringMonth && <Badge text="Fase 2 activa" color="#1B7340" />}
      {liveCalc?.tailDuringMonth && <Badge text="Cola post-salida" color="#888" />}
      <div style={{ flex: 1 }} />
      <Btn small onClick={exportCSV} disabled={!data || !data.lines || data.lines.length === 0}>📥 Export CSV</Btn>
      {!frozen && data && data.totalCommission !== 0 && <Btn small primary onClick={() => setShowFreezeConfirm(true)}>💵 Marcar como pagado</Btn>}
      {frozen && <Btn small danger onClick={unfreeze}>Descongelar</Btn>}
    </div>

    {!data || data.lines.length === 0 ? (
      <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>
        No hay pedidos cobrados de clientes asignados a <b>{rep?.name}</b> en {monthLabel(selectedMonth)}.
        <div style={{ fontSize: 11, marginTop: 8 }}>Recuerda: la comisión se calcula sobre pedidos con status <b>paid</b>. Marca un pedido como Paid para que aparezca aquí.</div>
      </div>
    ) : <>
      {/* Resumen cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Card title="Venta Neta (cobrada)" value={fmt(data.totalNetSales)} color="#1A5276" sub={`${data.lines.filter(l => l.kind !== "return").length} pedido${data.lines.filter(l => l.kind !== "return").length !== 1 ? "s" : ""}`} />
        <Card title="Cuentas Nuevas" value={fmt(data.newCommission)} color="#1B7340" sub={`${data.lines.filter(l => l.classification.startsWith("Nueva")).length} línea${data.lines.filter(l => l.classification.startsWith("Nueva")).length !== 1 ? "s" : ""}`} />
        <Card title="Residual" value={fmt(data.residualCommission)} color="#6C3483" sub={`${data.lines.filter(l => l.classification.startsWith("Residual")).length} línea${data.lines.filter(l => l.classification.startsWith("Residual")).length !== 1 ? "s" : ""}`} />
        {data.phase2Bonus > 0 && <Card title="Fase 2 (+2%)" value={fmt(data.phase2Bonus)} color="#1B7340" sub="incluido arriba" />}
        {data.refundCommission < 0 && <Card title="↩ Devoluciones" value={fmt(data.refundCommission)} color="#C41E3A" sub={`${fmt(data.totalRefunds)} devuelto`} />}
        <Card title="Milestones" value={fmt(data.milestoneBonus)} color="#D35400" sub={data.newMilestones && data.newMilestones.length > 0 ? data.newMilestones.map(m => `${m.count} cuentas`).join(", ") : `Pico: ${data.peakActive}`} />
        <Card title="TOTAL COMISIÓN" value={fmt(data.totalCommission)} color="#C41E3A" />
      </div>

      {/* Tabla de pedidos */}
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.4fr 0.8fr 0.6fr 1fr", gap: 10, padding: "8px 12px", background: "#f8f8f8", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "1px solid #eee" }}>
          <div>Cliente</div>
          <div>Pedido</div>
          <div>Fecha</div>
          <div style={{ textAlign: "right" }}>Venta Neta</div>
          <div>Clasificación</div>
          <div style={{ textAlign: "center" }}>Tasa</div>
          <div></div>
          <div style={{ textAlign: "right" }}>Comisión</div>
        </div>
        {data.lines.map((l, i) => {
          const isReturn = l.kind === "return";
          const isNueva = l.classification.startsWith("Nueva");
          const bg = isReturn ? "#FDF2F2" : isNueva ? "#F0F9F0" : l.tailApplied ? "#F5F5F5" : "#fff";
          const badgeColor = isReturn ? "#C41E3A" : isNueva ? "#1B7340" : l.tailApplied ? "#888" : "#6C3483";
          return <div key={l.orderId + (isReturn ? "-r" : "")} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.4fr 0.8fr 0.6fr 1fr", gap: 10, padding: "8px 12px", fontSize: 12, borderBottom: i < data.lines.length - 1 ? "1px solid #f5f5f5" : "none", background: bg }}>
            <div style={{ fontWeight: 600 }}>{l.clientName}</div>
            <div style={{ color: "#777", fontFamily: "monospace", fontSize: 10 }}>#{l.orderId.slice(-6)}</div>
            <div>{fmtD(l.paidDate)}</div>
            <div style={{ textAlign: "right", color: isReturn ? "#C41E3A" : "inherit" }}>{fmt(l.netSale)}</div>
            <div><Badge text={l.classification} color={badgeColor} /></div>
            <div style={{ textAlign: "center", fontWeight: 600 }}>{(l.rate * 100).toFixed(0)}%</div>
            <div></div>
            <div style={{ textAlign: "right", fontWeight: 700, color: l.commission < 0 ? "#C41E3A" : "#1B7340" }}>{fmt(l.commission)}</div>
          </div>;
        })}
      </div>

      {data.milestoneBonus > 0 && data.newMilestones && data.newMilestones.length > 0 && <div style={{ marginTop: 12, padding: "12px 16px", background: "#FFF8E1", borderLeft: "4px solid #F39C12", borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#B7950B", marginBottom: 4 }}>🎉 Milestones activados este mes</div>
        {data.newMilestones.map(m => <div key={m.count} style={{ fontSize: 12, color: "#555" }}>• Pico de <b>{m.count}+</b> cuentas activas alcanzado → bono <b>{fmt(m.bonus)}</b></div>)}
        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Al marcar como pagado, estos milestones se registrarán en el representante y no volverán a generar bono.</div>
      </div>}

      {data.repTerminated && <div style={{ marginTop: 12, padding: "12px 16px", background: "#F5F5F5", borderLeft: "4px solid #888", borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 4 }}>📋 Cola post-salida (§10.3)</div>
        <div style={{ fontSize: 12, color: "#555" }}>Representante terminado: <b>{fmtD(rep.terminatedDate)}</b>. Durante {POST_TERMINATION_TAIL_MONTHS} meses se paga residual flat <b>{Math.round(COMM_RATE_RESIDUAL * 100)}%</b> sobre cuentas existentes; sin Fase 2, sin milestones, sin nuevas cuentas a {Math.round(COMM_RATE_NEW * 100)}%.</div>
      </div>}

      <div style={{ marginTop: 14, fontSize: 11, color: "#999", textAlign: "center" }}>
        Pico de cuentas activas en {monthLabel(selectedMonth)}: <b>{data.peakActive}</b> • Hoy: <b>{data.activeNow !== undefined ? data.activeNow : "—"}</b>
        {data.totalRefunds > 0 && <> • Refunds del mes: <b style={{ color: "#C41E3A" }}>{fmt(data.totalRefunds)}</b></>}
      </div>
    </>}

    {/* Deploy C: Morosos info — siempre visible si hay morosos, aunque no haya cobros del mes */}
    {liveCalc?.morosos && liveCalc.morosos.length > 0 && <div style={{ marginTop: 12, padding: "12px 16px", background: "#FDF2E9", borderLeft: "4px solid #D35400", borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#D35400", marginBottom: 6 }}>🟠 Morosos &gt;{MOROSO_DAYS}d sin cobrar (§6.2) — informativo</div>
      <div style={{ fontSize: 11, color: "#777", marginBottom: 8 }}>Estos pedidos están entregados pero no cobrados. No generan comisión hasta que cambien a status <b>paid</b>. Si nunca se cobran, no entran al cálculo.</div>
      {liveCalc.morosos.slice(0, 8).map(m => <div key={m.order.id} style={{ fontSize: 12, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
        <span><b>{m.client?.name || "?"}</b> <span style={{ color: "#999" }}>#{m.order.id.slice(-6)}</span> — entregado {fmtD(m.order.date)}</span>
        <span style={{ color: "#C41E3A", fontWeight: 600 }}>{fmt(m.order.total)} • {m.daysOverdue}d vencido</span>
      </div>)}
      {liveCalc.morosos.length > 8 && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>...y {liveCalc.morosos.length - 8} más</div>}
    </div>}

    {showFreezeConfirm && <Modal title="Confirmar pago de comisión" onClose={() => setShowFreezeConfirm(false)}>
      <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
        <p>Vas a congelar el reporte de <b>{rep.name}</b> para <b>{monthLabel(selectedMonth)}</b>:</p>
        <div style={{ background: "#f8f8f8", padding: "12px 16px", borderRadius: 6, margin: "10px 0", fontFamily: "monospace", fontSize: 12 }}>
          Cuentas Nuevas:      {fmt(liveCalc.newCommission)}<br />
          Residual:            {fmt(liveCalc.residualCommission)}<br />
          {liveCalc.phase2Bonus > 0 && <>  (incluye Fase 2): {fmt(liveCalc.phase2Bonus)}<br /></>}
          {liveCalc.refundCommission < 0 && <>Devoluciones:        {fmt(liveCalc.refundCommission)}<br /></>}
          Milestones:          {fmt(liveCalc.milestoneBonus)}<br />
          ─────────────────────────────<br />
          <b>TOTAL: {fmt(liveCalc.totalCommission)}</b>
        </div>
        <p style={{ fontSize: 12, color: "#777" }}>Una vez congelado, el reporte queda como histórico inmutable. Los milestones cobrados se marcarán en el representante. Puedes "Descongelar" después si necesitas ajustar.</p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Btn onClick={() => setShowFreezeConfirm(false)}>Cancel</Btn>
        <Btn primary onClick={freezePeriod}>Confirmar y congelar</Btn>
      </div>
    </Modal>}
  </div>;
};

export default Commissions;
