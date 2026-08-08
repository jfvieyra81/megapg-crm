// src/lib/productionPacketPrint.ts
// =============================================================================
// Construye el documento HTML de impresión/exportación a PDF del paquete de
// producción del Agente Productor de TikTok. Se abre en una ventana aislada
// y usa window.print() (diálogo nativo del navegador) — sin librerías de PDF
// ni servicios externos. Todo el contenido editable se escapa antes de
// insertarse en el HTML para evitar inyección.
// =============================================================================

import type { PacketStatus, ProductionPacketContent } from "./productionPacket";

const STATUS_LABEL: Record<PacketStatus, string> = { borrador: "Borrador", aprobado: "Aprobado", grabado: "Grabado", publicado: "Publicado" };

export const escapeHtml = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const esc = escapeHtml;
const lines = (value: string) => esc(value).replace(/\n/g, "<br>");
const orMuted = (html: string) => html || '<span class="muted">Sin definir.</span>';
const list = (items: string[]) => items.length
  ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join("")}</ul>`
  : '<p class="muted">Sin elementos.</p>';

export type PrintablePlan = { title: string; theme: string | null; format: string | null };

export const buildPrintableHtml = (params: {
  plan: PrintablePlan;
  status: PacketStatus;
  content: ProductionPacketContent;
  principalName: string;
  secundariosNames: string[];
}): string => {
  const { plan, status, content, principalName, secundariosNames } = params;
  const exportedAt = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });

  const guionRows = content.guion.map(beat => `
    <tr>
      <td class="seg">${beat.seg_inicio}s–${beat.seg_fin}s</td>
      <td>${lines(beat.accion)}</td>
      <td>${lines(beat.dialogo)}</td>
      <td>${lines(beat.texto_pantalla)}</td>
    </tr>`).join("");

  const tomasRows = content.tomas.map(toma => `
    <tr>
      <td class="seg">${toma.seg_inicio}s–${toma.seg_fin}s</td>
      <td>${esc(toma.encuadre)}</td>
      <td>${esc(toma.distancia)}</td>
      <td>${esc(toma.movimiento)}</td>
      <td>${lines(toma.accion)}</td>
    </tr>`).join("");

  const iluminacionRows = content.iluminacion.map(luz => `
    <tr>
      <td>${esc(luz.posicion)}</td>
      <td>${esc(luz.tipo_luz)}</td>
      <td>${lines(luz.resultado)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(plan.title)} — Paquete de producción</title>
<style>
  @page { size: letter; margin: 1.6cm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1A1A1A; font-size: 12px; line-height: 1.45; margin: 0; padding: 0; }
  header.doc-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1F6B45; padding-bottom: 8px; margin-bottom: 14px; }
  header.doc-header .brand { font-weight: 800; font-size: 15px; color: #1F6B45; }
  header.doc-header .meta { font-size: 11px; color: #666; text-align: right; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .status-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 10px; background: #EEF5F0; color: #1F6B45; border: 1px solid #CFE5D5; margin-bottom: 14px; }
  section { margin-bottom: 16px; break-inside: avoid; page-break-inside: avoid; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .03em; color: #1F6B45; border-bottom: 1px solid #DCE6DF; padding-bottom: 3px; margin: 0 0 6px; }
  p { margin: 0 0 6px; }
  .muted { color: #888; font-style: italic; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #DDD; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 11.5px; }
  th { background: #F5F7F6; font-size: 10.5px; text-transform: uppercase; color: #555; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td.seg { white-space: nowrap; font-weight: 700; color: #1F6B45; width: 70px; }
  ul { margin: 4px 0 0; padding-left: 18px; }
  li { margin-bottom: 3px; }
  .safety { background: #FDF2F2; border: 1px solid #F3C6C1; border-radius: 6px; padding: 10px; break-inside: auto; page-break-inside: auto; }
  .safety h2 { color: #8A2A22; border-bottom-color: #F3C6C1; break-after: avoid; page-break-after: avoid; }
  footer.doc-footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #DDD; font-size: 10px; color: #999; text-align: center; }
</style>
</head>
<body>
  <header class="doc-header">
    <div class="brand">Maestro Flores</div>
    <div class="meta">Exportado: ${esc(exportedAt)}</div>
  </header>

  <h1>${esc(plan.title)}</h1>
  <span class="status-badge">Estado del paquete: ${esc(STATUS_LABEL[status])}</span>

  <section>
    <h2>Objetivo y audiencia</h2>
    <p><b>Objetivo:</b> ${orMuted(lines(content.objetivo))}</p>
    <p><b>Audiencia:</b> ${orMuted(lines(content.audiencia))}</p>
    <p><b>Hipótesis a probar:</b> ${orMuted(lines(content.hipotesis))}</p>
  </section>

  <section>
    <h2>Producto y formato</h2>
    <div class="grid2">
      <p><b>Producto principal:</b> ${orMuted(esc(principalName))}</p>
      <p><b>Productos secundarios:</b> ${secundariosNames.length ? esc(secundariosNames.join(", ")) : '<span class="muted">Ninguno</span>'}</p>
      <p><b>Duración objetivo:</b> ${content.duracion_objetivo_seg} segundos</p>
      <p><b>Formato:</b> 9:16 (vertical)</p>
    </div>
  </section>

  <section>
    <h2>Guion segundo a segundo</h2>
    ${content.guion.length ? `<table><thead><tr><th>Seg.</th><th>Acción</th><th>Diálogo / voz en off</th><th>Texto en pantalla</th></tr></thead><tbody>${guionRows}</tbody></table>` : '<p class="muted">Sin guion definido.</p>'}
  </section>

  <section>
    <h2>Lista de tomas</h2>
    ${content.tomas.length ? `<table><thead><tr><th>Seg.</th><th>Encuadre</th><th>Distancia</th><th>Movimiento</th><th>Acción</th></tr></thead><tbody>${tomasRows}</tbody></table>` : '<p class="muted">Sin tomas definidas.</p>'}
  </section>

  <section>
    <h2>Iluminación</h2>
    ${content.iluminacion.length ? `<table><thead><tr><th>Posición</th><th>Tipo de luz</th><th>Resultado buscado</th></tr></thead><tbody>${iluminacionRows}</tbody></table>` : '<p class="muted">Sin plan de iluminación.</p>'}
  </section>

  <section>
    <h2>Audio</h2>
    <p><b>Música / ambiente:</b> ${orMuted(lines(content.audio.musica_ambiente))}</p>
    <p><b>Efectos:</b> ${orMuted(lines(content.audio.efectos))}</p>
    <p><b>Momentos de corte:</b> ${orMuted(lines(content.audio.momentos_corte))}</p>
  </section>

  <section>
    <h2>Ubicación, vestuario y props</h2>
    <p><b>Ubicación:</b> ${orMuted(lines(content.ubicacion))}</p>
    <p><b>Vestuario:</b> ${orMuted(lines(content.vestuario))}</p>
    <p><b>Props:</b> ${orMuted(lines(content.props))}</p>
  </section>

  <section>
    <h2>Instrucciones de edición</h2>
    <p>${orMuted(lines(content.instrucciones_edicion))}</p>
  </section>

  <section>
    <h2>Caption, CTA y hashtags</h2>
    <p><b>Caption:</b> ${orMuted(lines(content.caption))}</p>
    <p><b>CTA:</b> ${orMuted(lines(content.cta))}</p>
    <p><b>Hashtags:</b> ${content.hashtags.length ? esc(content.hashtags.join(" ")) : '<span class="muted">Sin definir.</span>'}</p>
  </section>

  <section>
    <h2>Checklist antes de grabar</h2>
    ${list(content.checklist_pre_grabacion)}
  </section>

  <section>
    <h2>Checklist antes de publicar</h2>
    ${list(content.checklist_pre_publicacion)}
  </section>

  <section class="safety">
    <h2>Nota de seguridad</h2>
    <p>${orMuted(lines(content.nota_seguridad))}</p>
  </section>

  <footer class="doc-footer">Maestro Flores · Paquete de producción</footer>

  <script>window.onload = function () { setTimeout(function () { window.print(); }, 150); };</script>
</body>
</html>`;
};
