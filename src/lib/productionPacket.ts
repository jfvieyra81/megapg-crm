// src/lib/productionPacket.ts
// =============================================================================
// Agente Productor de TikTok — tipos y plantilla estructurada del paquete de
// producción (guion, tomas, iluminación, audio, checklist, etc.) asociado 1:1
// a un plan de contenido (tiktok_content_plans).
//
// No hay proveedor de IA configurado en el proyecto (ver AGENTS.md / búsqueda
// de credenciales en supabase/functions): buildTemplatePacket genera una
// plantilla profesional y editable a partir de los datos del plan, sin
// llamar a ningún servicio externo. Si en el futuro se conecta un proveedor
// de IA vía Edge Function, esa generación reemplazaría o complementaría esta
// plantilla, pero el tipo ProductionPacketContent es el mismo contrato.
// =============================================================================

export type PacketStatus = "borrador" | "aprobado" | "grabado" | "publicado";
export type PacketSource = "template" | "ai";

export type GuionBeat = { seg_inicio: number; seg_fin: number; accion: string; dialogo: string; texto_pantalla: string };
export type Toma = { seg_inicio: number; seg_fin: number; encuadre: string; distancia: string; movimiento: string; accion: string };
export type LuzSetup = { posicion: string; tipo_luz: string; resultado: string };

export type ProductionPacketContent = {
  objetivo: string;
  audiencia: string;
  hipotesis: string;
  producto_principal_id: string;
  productos_secundarios_ids: string[];
  duracion_objetivo_seg: number;
  formato_video: "9:16";
  guion: GuionBeat[];
  tomas: Toma[];
  iluminacion: LuzSetup[];
  audio: { musica_ambiente: string; efectos: string; momentos_corte: string };
  props: string;
  vestuario: string;
  ubicacion: string;
  instrucciones_edicion: string;
  caption: string;
  cta: string;
  hashtags: string[];
  checklist_pre_grabacion: string[];
  checklist_pre_publicacion: string[];
  nota_seguridad: string;
};

export type ProductionPacket = {
  id: string;
  plan_id: string;
  status: PacketStatus;
  source: PacketSource;
  content: ProductionPacketContent;
  created_at: string;
  updated_at: string;
};

type PlanForTemplate = {
  title: string;
  product_ids: string[];
  theme: string | null;
  format: string | null;
  hook: string | null;
  cta: string | null;
  rationale: string | null;
};

export const NOTA_SEGURIDAD_DEFAULT =
  "No hacer afirmaciones de salud (curas, beneficios médicos), ni mencionar precios, disponibilidad o promociones que no estén confirmadas por José antes de publicar este video.";

/** Plantilla estructurada editable — sin IA, generada de los datos del plan. */
export const buildTemplatePacket = (plan: PlanForTemplate, productNames: string[]): ProductionPacketContent => {
  const principal = productNames[0] || "el producto destacado";
  const secundarios = productNames.slice(1);
  const tema = plan.theme || "comunidad";
  const formato = plan.format || "reto de comunidad";
  const gancho = plan.hook || "¡Aguanta, tienes que ver esto!";
  const llamada = plan.cta || "Coméntame abajo cuál quieres que probemos después.";
  return {
    objetivo: `Mostrar ${principal} de forma apetecible y generar comentarios/guardados con el formato "${formato}".`,
    audiencia: "Seguidores actuales de @maestroflores1 y descubrimiento por hashtags de comida/dulces mexicanos en EE. UU.",
    hipotesis: plan.rationale || "Sin datos suficientes todavía — completa esta hipótesis manualmente antes de aprobar el paquete.",
    producto_principal_id: plan.product_ids[0] || "",
    productos_secundarios_ids: plan.product_ids.slice(1),
    duracion_objetivo_seg: 30,
    formato_video: "9:16",
    guion: [
      { seg_inicio: 0, seg_fin: 3, accion: `Primer plano de ${principal}, cámara en mano, energía alta desde el segundo 0.`, dialogo: gancho, texto_pantalla: gancho },
      { seg_inicio: 3, seg_fin: 10, accion: `Presentación del producto — Maestro Flores lo agarra, lo muestra de cerca: textura, color, lo apetecible que se ve.`, dialogo: `Este es ${principal}${secundarios.length ? ` con ${secundarios.join(" y ")}` : ""}, directo de Dulce Sabor.`, texto_pantalla: principal },
      { seg_inicio: 10, seg_fin: 20, accion: `Desarrollo del formato "${formato}": reacción real, comparación o demostración según el tema "${tema}".`, dialogo: "Cuéntame qué se te antoja más…", texto_pantalla: "" },
      { seg_inicio: 20, seg_fin: 27, accion: "Cierre con el producto en cámara, sonrisa, gesto directo a cámara.", dialogo: llamada, texto_pantalla: llamada },
      { seg_inicio: 27, seg_fin: 30, accion: "Logo o mención de marca en los últimos 3 segundos.", dialogo: "Dulce Sabor, el Maestro de los antojos.", texto_pantalla: "@maestroflores1" },
    ],
    tomas: [
      { seg_inicio: 0, seg_fin: 3, encuadre: "Primer plano (producto)", distancia: "Muy cerca", movimiento: "Cámara en mano, ligero movimiento", accion: "Revelar el producto" },
      { seg_inicio: 3, seg_fin: 10, encuadre: "Medio (Maestro + producto)", distancia: "Media", movimiento: "Estático o paneo lento", accion: "Mostrar textura y color" },
      { seg_inicio: 10, seg_fin: 20, encuadre: "Medio / close-up alternado", distancia: "Media a cerca", movimiento: "Corte rápido entre tomas", accion: "Desarrollar el formato" },
      { seg_inicio: 20, seg_fin: 27, encuadre: "Medio (rostro + producto)", distancia: "Media", movimiento: "Estático, mirada a cámara", accion: "Llamado a la acción" },
      { seg_inicio: 27, seg_fin: 30, encuadre: "Primer plano (logo / empaque)", distancia: "Cerca", movimiento: "Estático", accion: "Cierre de marca" },
    ],
    iluminacion: [
      { posicion: "Frontal, ~45° del sujeto", tipo_luz: "Luz natural de ventana o luz suave (softbox / aro)", resultado: "Cara y producto bien iluminados, sin sombras duras" },
      { posicion: "Contraluz suave (opcional)", tipo_luz: "Luz de relleno tenue", resultado: "Separar al sujeto del fondo" },
    ],
    audio: {
      musica_ambiente: "Canción trending de TikTok con energía alta que combine con el gancho; confirmar cuál está sonando esa semana antes de grabar.",
      efectos: "Efecto tipo 'pop' o 'whoosh' en los cortes de los segundos 3 y 20.",
      momentos_corte: "Cortes marcados en los segundos 3, 10, 20 y 27 — sincronizar con el beat de la música.",
    },
    props: "Empaque del producto visible con logo, servilletas/mantel de marca si hay, mesa limpia o fondo de tienda/cocina.",
    vestuario: "Ropa casual de marca (gorra o playera Dulce Sabor si está disponible), colores que no compitan con el empaque del producto.",
    ubicacion: "Punto de venta o cocina/casa con buena luz natural — confirmar disponibilidad antes de grabar.",
    instrucciones_edicion: "Cortes rápidos (1–3 s por toma en el desarrollo), texto en pantalla legible en celular (fuente grande, alto contraste), subtítulos quemados si hay diálogo, música desde el segundo 0.",
    caption: `${gancho} 🍬`,
    cta: llamada,
    hashtags: ["#DulceSabor", "#MaestroFlores", "#dulcesmexicanos", "#fyp"],
    checklist_pre_grabacion: [
      "Producto principal disponible y en buen estado visual",
      "Cámara cargada y con espacio de almacenamiento",
      "Buena luz confirmada (natural o artificial)",
      "Audio/música elegida",
      "Ubicación y props listos",
    ],
    checklist_pre_publicacion: [
      "Guion y tomas revisados contra el video final",
      "Texto en pantalla sin errores de ortografía",
      "Caption, CTA y hashtags listos",
      "Ninguna afirmación de salud, precio, disponibilidad o promoción sin confirmar",
      "Aprobado por José antes de publicar",
    ],
    nota_seguridad: NOTA_SEGURIDAD_DEFAULT,
  };
};
