// src/components/Receipt.tsx
// =============================================================================
// Receipt — Vista de recibo individual con export a PDF (jsPDF) e impresión
// térmica (window.open con HTML formateado para 80mm).
// Extraído de App.tsx en Block 4.d. Comportamiento idéntico al original.
//
// Helpers duplicados inline (cleanPhone, waLink, waReceipt, waPayment, WaBtn):
// son copias temporales del original en App.tsx; se consolidarán en un
// bloque futuro de limpieza de helpers de WhatsApp.
// =============================================================================

import { jsPDF } from "jspdf";
import type { Client, Order, OrderStatus } from "../types/domain";
import { pF, ST_CLR } from "../lib/catalog";
import { fmt, fmtD } from "../lib/format";
import { Btn, Badge } from "./ui";

// ============================================================
// WhatsApp helpers (duplicados inline — consolidar en bloque futuro)
// ============================================================
const cleanPhone = (ph: string | undefined | null): string => {
  if (!ph) return "";
  return ph.replace(/[^0-9]/g, "").replace(/^1?(\d{10})$/, "1$1");
};

const waLink = (phone: string, msg: string): string =>
  `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`;

const waReceipt = (order: Order, client: Client | undefined): string => {
  const items = order.items
    .map(it => {
      const p = pF(it.productId);
      return `${p?.name || it.productId} x${it.qty}`;
    })
    .join(", ");
  return `*DULCE SABOR — Recibo #${order.id.slice(-6).toUpperCase()}*\nFecha: ${fmtD(order.date)}\nCliente: ${client?.name || ""}\nArtículos: ${items}\n${order.discount > 0 ? `Descuento: ${Math.round(order.discount * 100)}%\n` : ""}*Total: ${fmt(order.total)}*\nEstado: ${order.status.toUpperCase()}\n\n¡Gracias por tu compra!\nJosé Flores • (707) 360-7420\nhttps://dulcesaborca.com`;
};

const waPayment = (order: Order, client: Client | undefined): string => {
  return `Hola ${client?.contact || client?.name || ""},\n\nRecordatorio amistoso sobre tu pedido #${order.id.slice(-6).toUpperCase()} del ${fmtD(order.date)} por *${fmt(order.total)}*.\n\nEstado: ${order.status === "delivered" ? "Entregado — pago pendiente" : "Pendiente"}\n\nFormas de pago:\n• Efectivo en la próxima visita\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Cheque a nombre de Dulce Sabor LLC\n\n¿Preguntas? Llámame al (707) 360-7420\n\n¡Gracias!\n— José Flores, Dulce Sabor`;
};

interface WaBtnProps {
  phone: string;
  msg: string;
  label?: string;
  small?: boolean;
}
const WaBtn = ({ phone, msg, label, small }: WaBtnProps) => (
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

// Status → RGB triple para el badge en el PDF.
const PDF_STATUS_COLOR: Record<OrderStatus, [number, number, number]> = {
  pending: [211, 84, 0],
  delivered: [26, 82, 118],
  paid: [27, 115, 64],
};

// ============================================================
// Component
// ============================================================
interface ReceiptProps {
  order: Order | null;
  clients: Client[];
}

export const Receipt = ({ order, clients }: ReceiptProps) => {
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
        Select from Orders tab.
      </p>
    );

  const cl = clients.find(c => c.id === order.clientId);
  const disc = order.discount || 0;
  const sub = order.items.reduce(
    (s, it) => s + (pF(it.productId)?.price || 0) * it.qty,
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
    doc.text("Dulces Mexicanos Aut\u00e9nticos \u2022 Norte de California", W / 2, y, { align: "center" });
    y += 14;
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("Jos\u00e9 Flores \u2022 (707) 360-7420 \u2022 megapg.norcal@gmail.com", W / 2, y, { align: "center" });
    y += 10;
    doc.setDrawColor(196, 30, 58);
    doc.setLineWidth(2);
    doc.line(mg, y, W - mg, y);
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text(cl?.name || "\u2014", mg, y);
    doc.text(`Pedido #${orderNum}`, W - mg, y, { align: "right" });
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
    doc.text(order.status.toUpperCase(), W - mg, y, { align: "right" });
    y += (cl?.phone ? 14 : 8) + 10;
    doc.setDrawColor(196, 30, 58);
    doc.setLineWidth(2);
    doc.line(mg, y, W - mg, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(196, 30, 58);
    const cols = [mg, mg + cw * 0.5, mg + cw * 0.65, mg + cw * 0.82];
    doc.text("Producto", cols[0], y);
    doc.text("Cant.", cols[1], y, { align: "center" });
    doc.text("Precio", cols[2], y, { align: "right" });
    doc.text("Total", W - mg, y, { align: "right" });
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
    doc.text("Subtotal", mg + cw * 0.5, y);
    doc.text(fmt(sub), W - mg, y, { align: "right" });
    y += 18;
    if (disc > 0) {
      doc.setTextColor(27, 115, 64);
      doc.text(`Descuento (${cl?.tier} ${Math.round(disc * 100)}%)`, mg + cw * 0.5, y);
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
    doc.text("TOTAL", mg + cw * 0.5, y);
    doc.text(fmt(order.total), W - mg, y, { align: "right" });
    y += 14;
    if (order.notes) {
      y += 10;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(`Notas: ${order.notes}`, mg, y);
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
    doc.text("Formas de pago", mg, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    [
      "Efectivo contra entrega",
      "Zelle: megapg.norcal@gmail.com",
      "Venmo: @MegaPG-NorCal",
      "Cheque a nombre de: Dulce Sabor LLC",
    ].forEach(pm => {
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
    doc.text("\u00a1Gracias por tu compra!", W / 2, y, { align: "center" });
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
<table><thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
<div class="tot"><div class="line"><span>Subtotal</span><span>${fmt(sub)}</span></div>
${disc > 0 ? `<div class="line"><span>Desc. ${cl?.tier} ${Math.round(disc * 100)}%</span><span>-${fmt(sub * disc)}</span></div>` : ""}
<div class="line grand"><span>TOTAL</span><span>${fmt(order.total)}</span></div></div>
<div class="pay"><b>Pago:</b> Efectivo &bull; Zelle &bull; Venmo &bull; Cheque</div>
${order.notes ? `<div style="font-size:10px;margin-top:4px;font-style:italic">${order.notes}</div>` : ""}
<div class="ftr">&iexcl;Gracias por su compra!<br>https://dulcesaborca.com</div>
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
          🖨 Imprimir recibo
        </Btn>
        <Btn primary onClick={downloadPDF}>
          Descargar PDF
        </Btn>
        {cl?.phone && (
          <WaBtn
            phone={cl.phone}
            msg={waReceipt(order, cl)}
            label="Enviar por WhatsApp"
          />
        )}
        {cl?.phone && order.status !== "paid" && (
          <WaBtn
            phone={cl.phone}
            msg={waPayment(order, cl)}
            label="Recordatorio de pago"
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
          <div style={{ fontSize: 11, color: "#777" }}>
            Dulces Mexicanos Auténticos • Norte de California
          </div>
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
            <b>#{order.id.slice(-6).toUpperCase()}</b>
            <div style={{ color: "#777" }}>{fmtD(order.date)}</div>
            <Badge text={order.status} color={ST_CLR[order.status]} />
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
              <th style={{ textAlign: "left", padding: "6px 0", color: "#C41E3A" }}>
                Producto
              </th>
              <th style={{ textAlign: "center", color: "#C41E3A" }}>Cant.</th>
              <th style={{ textAlign: "right", color: "#C41E3A" }}>Precio</th>
              <th style={{ textAlign: "right", color: "#C41E3A" }}>Total</th>
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
            <span>Subtotal</span>
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
                Descuento ({cl?.tier} {Math.round(disc * 100)}%)
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
            <span>TOTAL</span>
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
            Notas: {order.notes}
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
          ¡Gracias! • https://dulcesaborca.com
        </div>
      </div>
    </div>
  );
};
