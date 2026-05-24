// src/lib/catalog.ts
// =============================================================================
// Catálogo de productos y constantes de referencia compartidas.
//
// Hogar canónico de los tipos y datos del dominio "catálogo":
//   - Product (Block 4.d), InventoryItem (Block 4.d)
//   - PRODUCTS, pF (catálogo Mega PG / Pigüi)
//   - TIER_DISC (mapa ClientTier → descuento)
//   - ST_CLR (mapa OrderStatus → color hex)
//   - itemPrice, itemCost (helpers historical-aware, Block 4.g)
// =============================================================================

import type { ClientTier, OrderItem, OrderStatus } from "../types/domain";

// ============================================================
// Tipos del dominio "catálogo"
// ============================================================

/** Producto del catálogo Mega PG / Pigüi (datos estáticos del CRM). */
export type Product = {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  /** Precio de venta a cliente, USD por caja. */
  readonly price: number;
  /** Costo de adquisición, USD por caja. */
  readonly cost: number;
  /** Bolsas / displays por caja. */
  readonly bags: number;
};

/** Estado de inventario por producto. */
export interface InventoryItem {
  productId: string;
  /** Unidades (cajas) disponibles. */
  stock: number;
  /** ISO datetime del último restock. */
  lastRestock?: string;
}

// ============================================================
// Datos del catálogo
// ============================================================

export const PRODUCTS: readonly Product[] = [
  // SLAPS LOLLIPOPS
  { id: "slaps-mix", name: "Slaps Mix", sku: "DPG-SLPMIX-25", price: 50, cost: 22.00, bags: 25 },
  { id: "slaps-tam", name: "Slaps Tamarind", sku: "DPG-SLPTAM-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-mgo", name: "Slaps Mango", sku: "DPG-SLPMGO-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-wtm", name: "Slaps Watermelon", sku: "DPG-SLPWTM-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-app", name: "Slaps Green Apple", sku: "DPG-SLPAPP-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-dbx", name: "Slaps DobleX", sku: "DPG-DBXPIC-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-pkl", name: "Slaps Pickle", sku: "DPG-SLPPIK-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-dev", name: "Slaps Devora", sku: "DPG-SLPDEV-40", price: 80, cost: 50.00, bags: 40 },
  { id: "slaps-aln", name: "Slaps DevorAlien", sku: "DPG-SLPALN-40", price: 80, cost: 50.00, bags: 40 },
  // CACHETADA
  { id: "cachetada", name: "Pigüi Cachetada 100ct", sku: "DPG-CACHE100", price: 270, cost: 181, bags: 100 },
  // SOFT CANDIES
  { id: "piguileta", name: "Piguileta Fuego", sku: "DPG-PGFUEG-16", price: 85, cost: 57.60, bags: 16 },
  { id: "piguileta-c", name: "Piguileta Cool", sku: "DPG-PGCOOL-16", price: 85, cost: 57.60, bags: 16 },
  { id: "mega-hue-d", name: "Mega Huevón Display", sku: "DPG-MGAHUE-30", price: 84, cost: 51.20, bags: 16 },
  { id: "mega-hue-b", name: "Mega Huevón Bolsa", sku: "DPG-MGAHUE-10", price: 105, cost: 62.00, bags: 10 },
  { id: "don-cuco", name: "Bolas Don Cuco", sku: "DPG-DONCUC-12", price: 115, cost: 76.80, bags: 12 },
  { id: "mordidilla", name: "Mordidilla", sku: "DPG-MORDCH-12", price: 60, cost: 35.40, bags: 12 },
  { id: "flamkiyos", name: "Flamkiyos", sku: "DPG-FLAMKI-10", price: 93, cost: 55.20, bags: 12 },
  // CANDY POWDER
  { id: "cache-chm", name: "Cache Colors Chamoy Lg", sku: "DPG-CLRCHM-12", price: 115, cost: 76.80, bags: 12 },
  { id: "cache-mix", name: "Cache Colors Assorted Lg", sku: "DPG-CLRMIX-12", price: 115, cost: 76.80, bags: 12 },
  { id: "cache-pkl", name: "Cache Colors Pickle Lg", sku: "DPG-CLRPIK-12", price: 135, cost: 90.60, bags: 12 },
  // SLIM LICKS & BIBI LICKS
  { id: "slim-sour", name: "Slim Licks Sour", sku: "MPG-SLMSOU-24", price: 32, cost: 21.12, bags: 24 },
  { id: "slim-spcy", name: "Slim Licks Spicy", sku: "MPG-SLMSPI-24", price: 32, cost: 21.12, bags: 24 },
  { id: "bibi-sour", name: "Bibi Licks Sour", sku: "MPG-BIBSOU-12", price: 85, cost: 53.76, bags: 12 },
  { id: "bibi-spcy", name: "Bibi Licks Spicy", sku: "MPG-BIBISPI-12", price: 85, cost: 53.76, bags: 12 },
];

/** Find a product by id. Returns undefined if no match. */
export const pF = (id: string): Product | undefined =>
  PRODUCTS.find(p => p.id === id);

/** Client tier → discount fraction (0 to 1, e.g. 0.0625 = 6.25% off list). */
export const TIER_DISC: Record<ClientTier, number> = {
  Lista: 0,
  Bronce: 0.03125,
  Plata: 0.0625,
  Oro: 0.125,
};

/** Order status → display color (hex). */
export const ST_CLR: Record<OrderStatus, string> = {
  pending: "#D35400",
  delivered: "#1A5276",
  paid: "#1B7340",
};

// ============================================================
// Item price/cost helpers historical-aware (Block 4.g)
// ============================================================

/** Precio unitario de un line item. Prefiere `priceAtSale` (preciso para
 *  pedidos viejos cuyo catálogo cambió) y cae al precio actual del catálogo
 *  como fallback para pedidos legacy sin snapshot. Devuelve 0 si nada disponible. */
export const itemPrice = (it: OrderItem): number =>
  it.priceAtSale ?? pF(it.productId)?.price ?? 0;

/** Costo unitario de un line item. Mismo patrón de fallback que itemPrice. */
export const itemCost = (it: OrderItem): number =>
  it.costAtSale ?? pF(it.productId)?.cost ?? 0;
