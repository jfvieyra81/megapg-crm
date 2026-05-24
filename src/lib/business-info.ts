// src/lib/business-info.ts
// =============================================================================
// Información legal / regulatoria del negocio.
//
// Constantes usadas en recibos formales (PDF, térmico, on-screen) para
// cumplimiento con CDTFA (California Department of Tax and Fee Administration)
// y prácticas estándar de invoicing B2B "for resale".
//
// Agregado en Block 4.h. Si cambia algo (mudanza, renovación de permiso, etc.),
// es el único lugar a editar — todos los recibos lo reflejan automáticamente.
// =============================================================================

/** Razón social legal exacta como aparece en Articles of Organization. */
export const BUSINESS_LEGAL_NAME = "Dulce Sabor LLC";

/** Dirección física de operación. Requerida en invoices CA (best practice). */
export const BUSINESS_ADDRESS = "1123 W Standley St, Ukiah, CA 95482";

/** Número de Seller's Permit con CDTFA. Demuestra registro fiscal y le sirve
 *  al comprador para documentar la transacción "for resale" en su contabilidad. */
export const SELLER_PERMIT_NUMBER = "213-306080";
