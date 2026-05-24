// src/components/Receipt.tsx
// =============================================================================
// Receipt — Vista de recibo individual con i18n (Block 4.f).
//
// Idioma efectivo se deriva de:
//   1. Override manual del toggle (estado local, se resetea al cambiar pedido)
//   2. client.language (preferencia guardada del cliente)
//   3. Default "es" (clientes legacy sin campo)
//
// Output localizado: vista on-screen, PDF (jsPDF), recibo térmico (HTML),
// y mensajes WhatsApp (vía lib/whatsapp.tsx).
// =============================================================================

import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import type { Client, Language, Order } from "../types/domain";
import { pF, ST_CLR } from "../lib/catalog";
import { fmt, fmtD } from "../lib/format";
import {
  STATUS_LABEL,
  WaBtn,
  statusUpper,
  waPayment,
  waReceipt,
} from "../lib/whatsapp";
import { Btn, Badge } from "./ui";

// ============================================================
// Tabla de strings localizadas
// ============================================================

const STRINGS = {
  en: {
    selectPrompt: "Select from Orders tab.",
    tagline: "Authentic Mexican Candy • Northern California",
    orderHash: "Order #",
    thProduct: "Product",
    thQty: "Qty",
    thPrice: "Price",
    thTotal: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    totalCap: "TOTAL",
    notes: "Notes:",
    thankShort: "Thanks!",
    thankLong: "Thank you for your business!",
    paymentMethods: "Payment methods",
    payCash: "Cash on delivery",
    payZelle: "Zelle: megapg.norcal@gmail.com",
    payVenmo: "Venmo: @MegaPG-NorCal",
    payCheck: "Check payable to: Dulce Sabor LLC",
    payShort: "Payment:",
    payShortList: "Cash • Zelle • Venmo • Check",
    btnPrint: "🖨 Print receipt",
    btnPdf: "Download PDF",
    btnWa: "Send via WhatsApp",
    btnPayReminder: "Payment reminder",
    langLabel: "Receipt language:",
    langEs: "Español",
    langEn: "English",
  },
  es: {
    selectPrompt: "Selecciona desde Orders.",
    tagline: "Dulces Mexicanos Auténticos • Norte de California",
    orderHash: "Pedido #",
    thProduct: "Producto",
    thQty: "Cant.",
    thPrice: "Precio",
    thTotal: "Total",
    subtotal: "Subtotal",
    discount: "Descuento",
    totalCap: "TOTAL",
    notes: "Notas:",
    thankShort: "¡Gracias!",
    thankLong: "¡Gracias por tu compra!",
    paymentMethods: "Formas de pago",
    payCash: "Efectivo contra entrega",
    payZelle: "Zelle: megapg.norcal@gmail.com",
    payVenmo: "Venmo: @MegaPG-NorCal",
    payCheck: "Cheque a nombre de: Dulce Sabor LLC",
    payShort: "Pago:",
    payShortList: "Efectivo • Zelle • Venmo • Cheque",
    btnPrint: "🖨 Imprimir recibo",
    btnPdf: "Descargar PDF",
    btnWa: "Enviar por WhatsApp",
    btnPayReminder: "Recordatorio de pago",
    langLabel: "Idioma del recibo:",
    langEs: "Español",
    langEn: "English",
  },
} as const;

// Status → RGB triple para el badge en el PDF.
const PDF_STATUS_COLOR = {
  pending: [211, 84, 0],
  delivered: [26, 82, 118],
  paid: [27, 115, 64],
} as const;

// ============================================================
// Component
// ============================================================

interface ReceiptProps {
  order: Order | null;
  clients: Client[];
}

export const Receipt = ({ order, clients }: ReceiptProps) => {
  const cl = order ? clients.find(c => c.id === order.clientId) : undefined;

  // Idioma: override manual > client.language > "es" default
  const [overrideLang, setOverrideLang] = useState<Language | null>(null);
  useEffect(() => {
    // Reset override al cambiar de pedido (nuevo cliente, nuevas preferencias)
    setOverrideLang(null);
  }, [order?.id]);
  const lang: Language = overrideLang ?? cl?.language ?? "es";
  const s = STRINGS[lang];

  if (!order)
    return (
      <p
        style={{
          color: "#999",
          fontSize: 13,
          textAlign: "center",
          padding: 40,
        }}
      >
        {s.selectPrompt}
      </p>
    );

  const disc = order.discount || 0;
  const sub = order.items.reduce(
    (acc, it) => acc + (pF(it.productId)?.price || 0) * it.qty,
    0
  );
  const orderNum = order.id.slice(-6).toUpperCase();

  const downloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const mg = 50,
      cw = W - mg * 2;
    let y = 50;
    doc.setFillColor(196, 30, 58);
    doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(196, 30, 58);
    doc.text("DULCE SABOR", W / 2, y, { align: "center" });
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(s.tagline, W / 2, y, { align: "center" });
    y += 14;
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(
      "Jos\u00e9 Flores \u2022 (707) 360-7420 \u2022 megapg.norcal@gmail.com",
      W / 2,
      y,
      { align: "center" }
    );
    y += 10;
    doc.setDrawColor(196, 30, 58);
    doc.setLineWidth(2);
    doc.line(mg, y, W - mg, y);
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text(cl?.name || "\u2014", mg, y);
    doc.text(`${s.orderHash}${orderNum}`, W - mg, y, { align: "right" });
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    if (cl?.address) doc.text(cl.address, mg, y);
    doc.text(fmtD(order.date), W - mg, y, { align: "right" });
    y += 14;
    if (cl?.phone) doc.text(cl.phone, mg, y);
    const sc = PDF_STATUS_COLOR[order.status];
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.text(statusUpper(order.status, lang), W - mg, y, { align: "right" });
    y += (cl?.phone ? 14 : 8) + 10;
    doc.setDrawColor(196, 30, 58);
    doc.setLineWidth(2);
    doc.line(mg, y, W - mg, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(196, 30, 58);
    const cols = [mg, mg + cw * 0.5, mg + cw * 0.65, mg + cw * 0.82];
    doc.text(s.thProduct, cols[0], y);
    doc.text(s.thQty, cols[1], y, { align: "center" });
    doc.text(s.thPrice, cols[2], y, { align: "right" });
    doc.text(s.thTotal, W - mg, y, { align: "right" });
    y += 8;
    doc.setDrawColor(196, 30, 58);
    doc.setLineWidth(0.5);
    doc.line(mg, y, W - mg, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    order.items.forEach(it => {
      const p = pF(it.productId);
      doc.text(p?.name || it.productId, cols[0], y);
      doc.text(String(it.qty), cols[1], y, { align: "center" });
      doc.text(fmt(p?.price), cols[2], y, { align: "right" });
      doc.text(fmt((p?.price || 0) * it.qty), W - mg, y, { align: "right" });
      y += 6;
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.3);
      doc.line(mg, y, W - mg, y);
      y += 14;
    });
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(mg + cw * 0.5, y, W - mg, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(s.subtotal, mg + cw * 0.5, y);
    doc.text(fmt(sub), W - mg, y, { align: "right" });
    y += 18;
    if (disc > 0) {
      doc.setTextColor(27, 115, 64);
      doc.text(
        `${s.discount} (${cl?.tier} ${Math.round(disc * 100)}%)`,
        mg + cw * 0.5,
        y
      );
      doc.text(`-${fmt(sub * disc)}`, W - mg, y, { align: "right" });
      y += 18;
    }
    doc.setDrawColor(196, 30, 58);
    doc.setLineWidth(2);
    doc.line(mg + cw * 0.5, y, W - mg, y);
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(196, 30, 58);
    doc.text(s.totalCap, mg + cw * 0.5, y);
    doc.text(fmt(order.total), W - mg, y, { align: "right" });
    y += 14;
    if (order.notes) {
      y += 10;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(`${s.notes} ${order.notes}`, mg, y);
      y += 14;
    }
    y += 10;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.line(mg, y, W - mg, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(s.paymentMethods, mg, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    [s.payCash, s.payZelle, s.payVenmo, s.payCheck].forEach(pm => {
      doc.text(`\u2022  ${pm}`, mg + 8, y);
      y += 13;
    });
    y += 10;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.line(mg, y, W - mg, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(s.thankLong, W / 2, y, { align: "center" });
    y += 12;
    doc.text("https://dulcesaborca.com", W / 2, y, { align: "center" });
    doc.setFillColor(196, 30, 58);
    doc.rect(0, doc.internal.pageSize.getHeight() - 6, W, 6, "F");
    doc.save(`DulceSabor_${orderNum}_${order.date}.pdf`);
  };

  const printThermal = () => {
    const items = order.items
      .map(it => {
        const p = pF(it.productId);
        return `<tr><td style="padding:2px 0">${p?.name || it.productId}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${fmt((p?.price || 0) * it.qty * (1 - disc))}</td></tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Print</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace,sans-serif;width:72mm;font-size:12px;color:#000;padding:2mm}
@page{size:80mm auto;margin:0}
@media print{body{width:72mm;padding:2mm}}.hdr{text-align:center;border-bottom:2px dashed #000;padding-bottom:4px;margin-bottom:6px}
.hdr h1{font-size:16px;font-weight:900;letter-spacing:1px}.hdr p{font-size:10px}
.info{display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px}
table{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0}th{text-align:left;border-bottom:1px dashed #000;padding:2px 0;font-size:10px}
td{padding:2px 0}.tot{border-top:2px dashed #000;margin-top:6px;padding-top:4px;font-size:11px}
.tot .line{display:flex;justify-content:space-between;padding:1px 0}
.tot .grand{font-size:16px;font-weight:900;border-top:2px solid #000;margin-top:4px;padding-top:4px}
.pay{border-top:1px dashed #000;margin-top:6px;padding-top:4px;font-size:10px}
.ftr{text-align:center;border-top:1px dashed #000;margin-top:6px;padding-top:4px;font-size:9px}
</style></head><body>
<div class="hdr"><h1>DULCE SABOR</h1><p>LLC</p><p>Jos&eacute; Flores &bull; (707) 360-7420</p><p>megapg.norcal@gmail.com</p></div>
<div class="info"><div><b>${cl?.name || ""}</b>${cl?.phone ? `<br>${cl.phone}` : ""}</div><div style="text-align:right"><b>#${orderNum}</b><br>${fmtD(order.date)}</div></div>
<table><thead><tr><th>${s.thProduct}</th><th style="text-align:center">${s.thQty}</th><th style="text-align:right">${s.thTotal}</th></tr></thead><tbody>${items}</tbody></table>
<div class="tot"><div class="line"><span>${s.subtotal}</span><span>${fmt(sub)}</span></div>
${disc > 0 ? `<div class="line"><span>${s.discount} ${cl?.tier} ${Math.round(disc * 100)}%</span><span>-${fmt(sub * disc)}</span></div>` : ""}
<div class="line grand"><span>${s.totalCap}</span><span>${fmt(order.total)}</span></div></div>
<div class="pay"><b>${s.payShort}</b> ${s.payShortList}</div>
${order.notes ? `<div style="font-size:10px;margin-top:4px;font-style:italic">${order.notes}</div>` : ""}
<div class="ftr">${s.thankLong}<br>https://dulcesaborca.com</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=320,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <div>
      {/* Language toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          fontSize: 12,
          color: "#555",
        }}
      >
        <span style={{ fontWeight: 600 }}>{s.langLabel}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["es", "en"] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setOverrideLang(opt)}
              style={{
                padding: "4px 12px",
                border: `1px solid ${lang === opt ? "#1B7340" : "#ddd"}`,
                borderRadius: 6,
                background: lang === opt ? "#1B7340" : "#fff",
                color: lang === opt ? "#fff" : "#666",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {opt === "es" ? s.langEs : s.langEn}
            </button>
          ))}
        </div>
        {cl?.language && cl.language !== lang && (
          <span style={{ fontSize: 11, color: "#999", fontStyle: "italic" }}>
            (override — client prefers {cl.language === "es" ? s.langEs : s.langEn})
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Btn primary onClick={printThermal} style={{ background: "#D35400" }}>
          {s.btnPrint}
        </Btn>
        <Btn primary onClick={downloadPDF}>
          {s.btnPdf}
        </Btn>
        {cl?.phone && (
          <WaBtn
            phone={cl.phone}
            msg={waReceipt(order, cl, lang)}
            label={s.btnWa}
          />
        )}
        {cl?.phone && order.status !== "paid" && (
          <WaBtn
            phone={cl.phone}
            msg={waPayment(order, cl, lang)}
            label={s.btnPayReminder}
          />
        )}
      </div>
      <div
        style={{
          maxWidth: 500,
          margin: "0 auto",
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 24,
        }}
      >
        <div
          style={{
            textAlign: "center",
            borderBottom: "2px solid #C41E3A",
            paddingBottom: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, color: "#C41E3A" }}>
            DULCE SABOR
          </div>
          <div style={{ fontSize: 11, color: "#777" }}>{s.tagline}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            José Flores • (707) 360-7420 • megapg.norcal@gmail.com
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <b>{cl?.name}</b>
            {cl?.address && <div style={{ color: "#777" }}>{cl.address}</div>}
            {cl?.phone && <div style={{ color: "#777" }}>{cl.phone}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <b>
              {s.orderHash}
              {order.id.slice(-6).toUpperCase()}
            </b>
            <div style={{ color: "#777" }}>{fmtD(order.date)}</div>
            <Badge
              text={STATUS_LABEL[lang][order.status]}
              color={ST_CLR[order.status]}
            />
          </div>
        </div>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #C41E3A" }}>
              <th
                style={{ textAlign: "left", padding: "6px 0", color: "#C41E3A" }}
              >
                {s.thProduct}
              </th>
              <th style={{ textAlign: "center", color: "#C41E3A" }}>
                {s.thQty}
              </th>
              <th style={{ textAlign: "right", color: "#C41E3A" }}>
                {s.thPrice}
              </th>
              <th style={{ textAlign: "right", color: "#C41E3A" }}>
                {s.thTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => {
              const p = pF(it.productId);
              return (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "6px 0" }}>{p?.name || it.productId}</td>
                  <td style={{ textAlign: "center" }}>{it.qty}</td>
                  <td style={{ textAlign: "right" }}>{fmt(p?.price)}</td>
                  <td style={{ textAlign: "right" }}>
                    {fmt((p?.price || 0) * it.qty)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ borderTop: "1px solid #ddd", paddingTop: 8, fontSize: 13 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3px 0",
            }}
          >
            <span>{s.subtotal}</span>
            <span>{fmt(sub)}</span>
          </div>
          {disc > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                color: "#1B7340",
              }}
            >
              <span>
                {s.discount} ({cl?.tier} {Math.round(disc * 100)}%)
              </span>
              <span>-{fmt(sub * disc)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              borderTop: "2px solid #C41E3A",
              marginTop: 4,
              fontSize: 18,
              fontWeight: 900,
              color: "#C41E3A",
            }}
          >
            <span>{s.totalCap}</span>
            <span>{fmt(order.total)}</span>
          </div>
        </div>
        {order.notes && (
          <div
            style={{
              fontSize: 11,
              color: "#777",
              marginTop: 8,
              fontStyle: "italic",
            }}
          >
            {s.notes} {order.notes}
          </div>
        )}
        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 10,
            color: "#999",
            borderTop: "1px solid #eee",
            paddingTop: 8,
          }}
        >
          {s.thankShort} • https://dulcesaborca.com
        </div>
      </div>
    </div>
  );
};
