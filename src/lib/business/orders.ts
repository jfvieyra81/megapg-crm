// src/lib/business/orders.ts
// =============================================================================
// Lógica compartida de armado de pedidos + efecto en inventario.
//
// Usada por Orders.tsx (captura completa de escritorio) y FieldOrder.tsx
// (captura rápida en campo) para que ambas produzcan pedidos IDÉNTICOS y
// descuenten inventario igual — sin riesgo de divergencia.
//
// Funciones puras (sin estado/IO): el caller persiste el resultado vía saveAll.
// Precios/costos/cajas vienen de catalog.ts (unitPrice/unitCost/casesFor) y se
// hacen snapshot al momento de la venta (priceAtSale/costAtSale en cada item).
// =============================================================================

import type { Order, OrderItem, OrderStatus, SaleUnit } from "../../types/domain";
import { pF, unitPrice, unitCost, casesFor, type InventoryItem } from "../catalog";
import { uid } from "../format";

/** Línea de pedido en captura, antes del snapshot de precio/costo. */
export interface DraftItem {
  productId: string;
  qty: number;
  unit: SaleUnit;
}

/** Snapshot de line items: precio/costo unitario al momento de la venta.
 *  Bolsa ⇒ precio = bagPrice, costo = costo de caja / bolsas (vía catalog). */
export const buildOrderItems = (items: DraftItem[]): OrderItem[] =>
  items
    .filter(it => it.productId)
    .map(it => {
      const p = pF(it.productId);
      return {
        productId: it.productId,
        qty: it.qty,
        unit: it.unit,
        priceAtSale: unitPrice(p, it.unit),
        costAtSale: unitCost(p, it.unit),
      };
    });

/** Total con descuento de tier aplicado (disc: 0 a 1). */
export const orderTotal = (items: DraftItem[], disc: number): number =>
  items.reduce((acc, it) => {
    const p = pF(it.productId);
    return acc + (p ? unitPrice(p, it.unit) * it.qty * (1 - disc) : 0);
  }, 0);

/** Costo total del pedido (sin descuento). */
export const orderCost = (items: DraftItem[]): number =>
  items.reduce((acc, it) => {
    const p = pF(it.productId);
    return acc + (p ? unitCost(p, it.unit) * it.qty : 0);
  }, 0);

/** Inventario decrementado por los items de un pedido. Una bolsa descuenta una
 *  fracción de caja (qty / bags). Devuelve una copia nueva (no muta el input). */
export const applyInventory = (inventory: InventoryItem[], items: OrderItem[]): InventoryItem[] => {
  const ni = [...inventory];
  items.forEach(it => {
    const idx = ni.findIndex(inv => inv.productId === it.productId);
    if (idx >= 0) {
      const used = casesFor(pF(it.productId), it.unit ?? "case", it.qty);
      ni[idx] = { ...ni[idx], stock: Math.max(0, ni[idx].stock - used) };
    }
  });
  return ni;
};

/** Advertencias de stock: se pide más de lo disponible. Solo informativo. */
export const stockWarnings = (items: DraftItem[], inventory: InventoryItem[]): string[] => {
  const warnings: string[] = [];
  items
    .filter(it => it.productId)
    .forEach(it => {
      const p = pF(it.productId);
      const inv = inventory.find(i => i.productId === it.productId);
      const availCases = inv?.stock || 0;
      if (casesFor(p, it.unit, it.qty) > availCases) {
        const unitWord = it.unit === "bag" ? "bag(s)" : "case(s)";
        const availInUnit =
          it.unit === "bag" ? Math.floor(availCases * (p?.bags || 1)) : availCases;
        warnings.push(`${p?.name}: requesting ${it.qty} ${unitWord}, only ${availInUnit} in stock`);
      }
    });
  return warnings;
};

/** Arma un Order completo a partir de la captura. Genera id + created.
 *  total = orderTotal(items, disc); discount = disc. */
export const buildOrder = (input: {
  clientId: string;
  date: string;
  notes: string;
  status: OrderStatus;
  items: DraftItem[];
  disc: number;
}): Order => ({
  id: uid(),
  clientId: input.clientId,
  date: input.date,
  items: buildOrderItems(input.items),
  total: orderTotal(input.items, input.disc),
  discount: input.disc,
  status: input.status,
  notes: input.notes,
  created: new Date().toISOString(),
});
