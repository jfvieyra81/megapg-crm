// src/lib/missionControl.ts
//
// Capa de datos de Mission Control: acceso directo a las 3 tablas Supabase
// (mission_control_state, mission_control_tasks, mission_control_learnings)
// vía la prop `supa` inyectada desde App.tsx — mismo patrón que WebOrders.tsx
// (src/components/WebOrders.tsx), sin usar el mecanismo genérico
// cloudUpsert/CLOUD_TABLES de App.tsx porque esas tablas tienen forma
// distinta (fila única / lista con máximo 3 / log append-only).
//
// Fecha local: NUNCA usar `new Date().toISOString()` para task_date ni
// learning_date — ese es el bug UTC ya documentado en CLAUDE.md (pedidos
// después de ~5pm PT ruedan al día siguiente). getCaliforniaDateStr() es la
// única fuente de verdad para "hoy" en Mission Control.
//
// Admin-only: RLS (is_admin()) ya bloquea esto en el servidor para el rol
// 'rep'. Este archivo no duplica esa validación — MissionControl.tsx decide
// si siquiera monta este componente según currentUser.role.

import { uid } from "./format";
import { isActiveAccount, isInMonth } from "./business/commissions";
import type { Client, Order } from "../types/domain";

// ============================================================
// Config de Supabase inyectada (mismo shape que WebOrdersProps.supa)
// ============================================================

export interface SupaConfig {
  enabled: boolean;
  url: string;
  key: string;
  headers: Record<string, string>;
}

// ============================================================
// Fecha local de California — función central reutilizable
// ============================================================

/** "YYYY-MM-DD" en hora de Los Ángeles, sin importar la zona horaria del
 *  dispositivo. Usa Intl con timeZone fijo (no Date.toISOString(), que es
 *  UTC) — evita el bug conocido de fechas después de ~5pm PT. */
export const getCaliforniaDateStr = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** "YYYY-MM" (mes actual en hora de California) — para filtrar métricas. */
export const getCaliforniaMonthStr = (d: Date = new Date()): string =>
  getCaliforniaDateStr(d).slice(0, 7);

// ============================================================
// Tipos
// ============================================================

export type MissionStatus = "En ejecución" | "Esperando" | "Bloqueado" | "No iniciado" | "Terminado";

export interface MissionControlState {
  id: "main";
  mission_year1: string;
  sprint_name: string;
  sprint_status: MissionStatus;
  project_name: string;
  project_status: MissionStatus;
  weekly_business_goal: string;
  weekly_structural_goal: string;
  blockers: string[];
  roadmap_now: string[];
  roadmap_next: string[];
  roadmap_later: string[];
  projects_completed_count: number;
  updated_at: string;
}

export type TaskStatus = "pending" | "done";

export interface MissionTask {
  id: string;
  task_date: string;
  position: number;
  text: string;
  status: TaskStatus;
  created_at: string;
}

export interface MissionLearning {
  id: string;
  learning_date: string;
  text: string;
  created_at: string;
}

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const MAX_TASKS_PER_DAY = 3;

// ============================================================
// mission_control_state
// ============================================================

export const fetchMissionState = async (supa: SupaConfig): Promise<MissionControlState | null> => {
  if (!supa.enabled) return null;
  const r = await fetch(`${supa.url}/rest/v1/mission_control_state?id=eq.main&select=*`, { headers: supa.headers });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? (rows[0] as MissionControlState) : null;
};

/** Upsert parcial sobre la fila única id='main'. Si aún no existe (primer
 *  uso antes de correr el SQL con el insert inicial), la crea. */
export const saveMissionState = async (
  supa: SupaConfig,
  patch: Partial<Omit<MissionControlState, "id" | "updated_at">>
): Promise<Result> => {
  if (!supa.enabled) return { ok: false, error: "Supabase no configurado" };
  try {
    const body = { id: "main", ...patch, updated_at: new Date().toISOString() };
    const r = await fetch(`${supa.url}/rest/v1/mission_control_state`, {
      method: "POST",
      headers: { ...supa.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 250)}` };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
};

// ============================================================
// mission_control_tasks — máx. 3 por día, validado aquí (capa de acceso)
// ============================================================

export const fetchTasksForDate = async (supa: SupaConfig, dateStr: string): Promise<MissionTask[]> => {
  if (!supa.enabled) return [];
  const r = await fetch(
    `${supa.url}/rest/v1/mission_control_tasks?task_date=eq.${dateStr}&select=*&order=position.asc`,
    { headers: supa.headers }
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? (rows as MissionTask[]) : [];
};

/** Crea una tarea del día. Rechaza con mensaje claro si ya hay 3 — sin
 *  trigger SQL, la regla vive aquí (capa de acceso a datos), como se pidió. */
export const addTask = async (supa: SupaConfig, dateStr: string, text: string): Promise<Result<MissionTask | undefined>> => {
  if (!supa.enabled) return { ok: false, error: "Supabase no configurado" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "La tarea no puede estar vacía" };
  const existing = await fetchTasksForDate(supa, dateStr);
  if (existing.length >= MAX_TASKS_PER_DAY) {
    return { ok: false, error: `Ya tienes ${MAX_TASKS_PER_DAY} tareas para hoy. Termina o borra una antes de agregar otra.` };
  }
  try {
    const row: MissionTask = {
      id: uid(),
      task_date: dateStr,
      position: existing.length,
      text: trimmed,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    const r = await fetch(`${supa.url}/rest/v1/mission_control_tasks`, {
      method: "POST",
      headers: { ...supa.headers, Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 250)}` };
    const created = await r.json();
    return { ok: true, data: Array.isArray(created) ? created[0] : row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
};

export const setTaskStatus = async (supa: SupaConfig, id: string, status: TaskStatus): Promise<Result> => {
  if (!supa.enabled) return { ok: false, error: "Supabase no configurado" };
  try {
    const r = await fetch(`${supa.url}/rest/v1/mission_control_tasks?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...supa.headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 250)}` };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
};

export const deleteTask = async (supa: SupaConfig, id: string): Promise<Result> => {
  if (!supa.enabled) return { ok: false, error: "Supabase no configurado" };
  try {
    const r = await fetch(`${supa.url}/rest/v1/mission_control_tasks?id=eq.${id}`, {
      method: "DELETE",
      headers: supa.headers,
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 250)}` };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
};

// ============================================================
// mission_control_learnings — log append-only
// ============================================================

export const fetchRecentLearnings = async (supa: SupaConfig, limit = 5): Promise<MissionLearning[]> => {
  if (!supa.enabled) return [];
  const r = await fetch(
    `${supa.url}/rest/v1/mission_control_learnings?select=*&order=learning_date.desc,created_at.desc&limit=${limit}`,
    { headers: supa.headers }
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? (rows as MissionLearning[]) : [];
};

export const addLearning = async (supa: SupaConfig, dateStr: string, text: string): Promise<Result> => {
  if (!supa.enabled) return { ok: false, error: "Supabase no configurado" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "El aprendizaje no puede estar vacío" };
  try {
    const row = { id: uid(), learning_date: dateStr, text: trimmed, created_at: new Date().toISOString() };
    const r = await fetch(`${supa.url}/rest/v1/mission_control_learnings`, {
      method: "POST",
      headers: { ...supa.headers, Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 250)}` };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
};

export const fetchLearningsCount = async (supa: SupaConfig): Promise<number> => {
  if (!supa.enabled) return 0;
  const r = await fetch(`${supa.url}/rest/v1/mission_control_learnings?select=id`, {
    headers: { ...supa.headers, Prefer: "count=exact" },
  });
  if (!r.ok) return 0;
  const rows = await r.json();
  return Array.isArray(rows) ? rows.length : 0;
};

// ============================================================
// Métricas rápidas — calculadas en vivo, nada duplicado en Supabase
// ============================================================

/** Suma de `total` de pedidos cuya fecha cae en el mes actual (hora CA).
 *  Reusa `isInMonth` de lib/business/commissions.ts — misma función que ya
 *  usa el módulo de comisiones, cero lógica de fecha nueva. */
export const salesThisMonth = (orders: Order[]): number => {
  const yyyymm = getCaliforniaMonthStr();
  return orders.reduce((sum, o) => (isInMonth(o.date, yyyymm) ? sum + (o.total || 0) : sum), 0);
};

/** Cuenta clientes con "Cuenta Activa" = al menos un pedido cobrado en los
 *  últimos ACTIVE_ACCOUNT_DAYS (90) días — el único criterio de "activo" que
 *  ya existe en el CRM (lib/business/commissions.ts, usado en comisiones).
 *  No se inventa un criterio nuevo. */
export const activeStoresCount = (clients: Client[], orders: Order[]): number =>
  clients.filter(c => isActiveAccount(c.id, orders)).length;
