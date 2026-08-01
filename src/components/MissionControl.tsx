// src/components/MissionControl.tsx
//
// Mission Control — pantalla inicial del CRM (admin-only). Guía visual diaria
// de qué estamos haciendo, a dónde vamos, y qué sigue. Debe poder revisarse
// en <2 minutos cada mañana — cero gráficas avanzadas, drag-and-drop,
// automatizaciones, notificaciones, calendarios o dependencias entre
// proyectos (fuera de alcance del MVP a propósito).
//
// Admin-only: la RLS de mission_control_* (is_admin()) bloquea el acceso en
// el servidor. Este componente sólo se monta si App.tsx decide renderizarlo
// (currentUser.role === "admin") — ver App.tsx. Ese gate en App.tsx es UX,
// no seguridad: la seguridad real es la RLS del SQL.
//
// Acceso a Supabase vía prop `supa`, mismo patrón que WebOrders.tsx.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Client, Order } from "../types/domain";
import { Badge, Btn, Card, ST } from "./ui";
import { fmt, fmtD } from "../lib/format";
import { useIsMobile } from "../lib/useIsMobile";
import {
  getCaliforniaDateStr,
  fetchMissionState,
  saveMissionState,
  fetchTasksForDate,
  addTask,
  setTaskStatus,
  deleteTask,
  fetchRecentLearnings,
  addLearning,
  fetchLearningsCount,
  salesThisMonth,
  activeStoresCount,
  type SupaConfig,
  type MissionControlState,
  type MissionTask,
  type MissionLearning,
  type MissionStatus,
  type TaskActionType,
} from "../lib/missionControl";

interface MissionControlProps {
  clients: Client[];
  orders: Order[];
  supa: SupaConfig;
  setTab: (tab: string) => void;
}

// Sprint 02 — Quick Actions. Lista fija aprobada por José: solo pantallas
// generales que no requieren contexto previo (nada de recibos ni registros
// específicos). El id es el mismo `tab.id` real de App.tsx — no inventar uno
// nuevo. No reutilizar el array `tabs` completo de App.tsx.
const TASK_ACTION_TABS: readonly { id: string; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clients", label: "Clientes" },
  { id: "orders", label: "Pedidos" },
  { id: "inventory", label: "Inventario" },
  { id: "reorder", label: "Recordatorios" },
  { id: "postdel", label: "Seguimiento" },
  { id: "welcome", label: "Bienvenida" },
  { id: "purchases", label: "Compras" },
];

type NewTaskActionKind = "none" | "tab" | "url";

const STATUS_OPTIONS: readonly MissionStatus[] = ["En ejecución", "Esperando", "Bloqueado", "No iniciado", "Terminado"];
const STATUS_COLORS: Record<MissionStatus, string> = {
  "En ejecución": "#1B7340",
  "Esperando": "#D35400",
  "Bloqueado": "#C41E3A",
  "No iniciado": "#888",
  "Terminado": "#1A5276",
};

const linesToArray = (s: string): string[] => s.split("\n").map(l => l.trim()).filter(Boolean);

interface Draft {
  mission_year1: string;
  sprint_name: string;
  sprint_status: MissionStatus;
  project_name: string;
  project_status: MissionStatus;
  weekly_business_goal: string;
  weekly_structural_goal: string;
  blockersText: string;
  roadmapNowText: string;
  roadmapNextText: string;
  roadmapLaterText: string;
  projects_completed_count: string;
}

const draftFromState = (s: MissionControlState): Draft => ({
  mission_year1: s.mission_year1,
  sprint_name: s.sprint_name,
  sprint_status: s.sprint_status,
  project_name: s.project_name,
  project_status: s.project_status,
  weekly_business_goal: s.weekly_business_goal,
  weekly_structural_goal: s.weekly_structural_goal,
  blockersText: s.blockers.join("\n"),
  roadmapNowText: s.roadmap_now.join("\n"),
  roadmapNextText: s.roadmap_next.join("\n"),
  roadmapLaterText: s.roadmap_later.join("\n"),
  projects_completed_count: String(s.projects_completed_count),
});

const RoadmapCol = ({ title, items }: { title: string; items: string[] }) => (
  <div style={{ flex: 1, minWidth: 0, background: "#f8f8f8", borderRadius: 8, padding: "10px 12px" }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6 }}>{title}</div>
    {items.length === 0
      ? <div style={{ fontSize: 12, color: "#aaa" }}>—</div>
      : <ul style={{ margin: 0, paddingLeft: 16 }}>{items.map((it, i) => <li key={i} style={{ fontSize: 13, color: "#333", padding: "2px 0" }}>{it}</li>)}</ul>}
  </div>
);

export const MissionControl: React.FC<MissionControlProps> = ({ clients, orders, supa, setTab }) => {
  const isMobile = useIsMobile();
  const today = useMemo(() => getCaliforniaDateStr(), []);

  const [state, setState] = useState<MissionControlState | null>(null);
  const [tasks, setTasks] = useState<MissionTask[]>([]);
  const [learnings, setLearnings] = useState<MissionLearning[]>([]);
  const [learningsCount, setLearningsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [newTaskText, setNewTaskText] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskActionKind, setNewTaskActionKind] = useState<NewTaskActionKind>("none");
  const [newTaskTabTarget, setNewTaskTabTarget] = useState(TASK_ACTION_TABS[0].id);
  const [newTaskUrlTarget, setNewTaskUrlTarget] = useState("");

  const [newLearningText, setNewLearningText] = useState("");
  const [learningError, setLearningError] = useState<string | null>(null);
  const [addingLearning, setAddingLearning] = useState(false);

  const loadAll = useCallback(async () => {
    if (!supa.enabled) { setLoading(false); setLoadError("Supabase no configurado."); return; }
    setLoading(true); setLoadError(null);
    try {
      const [s, t, l, lc] = await Promise.all([
        fetchMissionState(supa),
        fetchTasksForDate(supa, today),
        fetchRecentLearnings(supa, 5),
        fetchLearningsCount(supa),
      ]);
      setState(s);
      setTasks(t);
      setLearnings(l);
      setLearningsCount(lc);
      if (!s) setLoadError("No se encontró el estado de Mission Control. Corre el SQL de inicialización en Supabase.");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar Mission Control");
    } finally {
      setLoading(false);
    }
  }, [supa, today]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const startEdit = () => { if (state) { setDraft(draftFromState(state)); setSaveError(null); setEditMode(true); } };
  const cancelEdit = () => { setEditMode(false); setDraft(null); setSaveError(null); };

  const saveEdit = async () => {
    if (!draft) return;
    setSaving(true); setSaveError(null);
    const patch = {
      mission_year1: draft.mission_year1,
      sprint_name: draft.sprint_name,
      sprint_status: draft.sprint_status,
      project_name: draft.project_name,
      project_status: draft.project_status,
      weekly_business_goal: draft.weekly_business_goal,
      weekly_structural_goal: draft.weekly_structural_goal,
      blockers: linesToArray(draft.blockersText),
      roadmap_now: linesToArray(draft.roadmapNowText),
      roadmap_next: linesToArray(draft.roadmapNextText),
      roadmap_later: linesToArray(draft.roadmapLaterText),
      projects_completed_count: Math.max(0, parseInt(draft.projects_completed_count, 10) || 0),
    };
    const r = await saveMissionState(supa, patch);
    setSaving(false);
    if (!r.ok) { setSaveError(r.error); return; }
    setState(prev => (prev ? { ...prev, ...patch, updated_at: new Date().toISOString() } : prev));
    setEditMode(false); setDraft(null);
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim() || addingTask) return;
    setTaskError(null);

    let action: { type: TaskActionType; target: string } | null = null;
    if (newTaskActionKind === "tab") {
      action = { type: "tab", target: newTaskTabTarget };
    } else if (newTaskActionKind === "url") {
      const trimmedUrl = newTaskUrlTarget.trim();
      if (!/^https?:\/\/.+/.test(trimmedUrl)) {
        setTaskError("El enlace debe empezar con https:// o http://");
        return;
      }
      action = { type: "url", target: trimmedUrl };
    }

    setAddingTask(true);
    const r = await addTask(supa, today, newTaskText, action);
    setAddingTask(false);
    if (!r.ok) { setTaskError(r.error); return; }
    if (r.data) setTasks(prev => [...prev, r.data as MissionTask]);
    setNewTaskText("");
    setNewTaskActionKind("none");
    setNewTaskTabTarget(TASK_ACTION_TABS[0].id);
    setNewTaskUrlTarget("");
  };

  /** Sprint 02 — Quick Actions. "tab" valida contra la lista fija antes de
   *  navegar (defensa extra aunque el formulario ya restringe el valor);
   *  "url" siempre abre con noopener,noreferrer. */
  const handleOpenTask = (t: MissionTask) => {
    if (t.action_type === "tab" && t.action_target) {
      if (TASK_ACTION_TABS.some(opt => opt.id === t.action_target)) setTab(t.action_target);
      return;
    }
    if (t.action_type === "url" && t.action_target) {
      window.open(t.action_target, "_blank", "noopener,noreferrer");
    }
  };

  const handleToggleTask = async (t: MissionTask) => {
    const nextStatus = t.status === "done" ? "pending" : "done";
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, status: nextStatus } : x)));
    const r = await setTaskStatus(supa, t.id, nextStatus);
    if (!r.ok) setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, status: t.status } : x)));
  };

  const handleDeleteTask = async (t: MissionTask) => {
    const prevTasks = tasks;
    setTasks(prev => prev.filter(x => x.id !== t.id));
    const r = await deleteTask(supa, t.id);
    if (!r.ok) setTasks(prevTasks);
  };

  const handleAddLearning = async () => {
    if (!newLearningText.trim() || addingLearning) return;
    setAddingLearning(true); setLearningError(null);
    const r = await addLearning(supa, today, newLearningText);
    setAddingLearning(false);
    if (!r.ok) { setLearningError(r.error); return; }
    setNewLearningText("");
    const [l, lc] = await Promise.all([fetchRecentLearnings(supa, 5), fetchLearningsCount(supa)]);
    setLearnings(l); setLearningsCount(lc);
  };

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>⏳ Cargando Mission Control...</div>;
  if (loadError || !state) return <div style={{ padding: 20, textAlign: "center", color: "#C41E3A", fontSize: 13 }}>⚠️ {loadError || "No se pudo cargar el estado."}</div>;

  const doneCount = tasks.filter(t => t.status === "done").length;
  const progressPct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
  const todaysLearning = learnings.find(l => l.learning_date === today) || null;
  const latestLearning = todaysLearning || learnings[0] || null;

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: "#999" }}>{new Date(today + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</div>
      {!editMode
        ? <Btn small onClick={startEdit}>✏️ Editar</Btn>
        : <div style={{ display: "flex", gap: 6 }}><Btn small onClick={cancelEdit} disabled={saving}>Cancelar</Btn><Btn small primary onClick={saveEdit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Btn></div>}
    </div>
    {saveError && <div style={{ fontSize: 12, color: "#C41E3A", marginBottom: 8 }}>⚠️ {saveError}</div>}

    {/* ── 1. Proyecto activo y estado (+ misión/sprint) ─────────────────── */}
    <div style={{ background: "#FDF2F2", border: "1px solid #F5D5D5", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
      {editMode && draft ? (
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Misión del Año 1</label>
          <input value={draft.mission_year1} onChange={e => setDraft({ ...draft, mission_year1: e.target.value })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Sprint activo</label>
              <input value={draft.sprint_name} onChange={e => setDraft({ ...draft, sprint_name: e.target.value })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ width: isMobile ? "100%" : 170 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Estado del sprint</label>
              <select value={draft.sprint_status} onChange={e => setDraft({ ...draft, sprint_status: e.target.value as MissionStatus })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Proyecto activo</label>
              <input value={draft.project_name} onChange={e => setDraft({ ...draft, project_name: e.target.value })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ width: isMobile ? "100%" : 170 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Estado del proyecto</label>
              <select value={draft.project_status} onChange={e => setDraft({ ...draft, project_status: e.target.value as MissionStatus })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {state.mission_year1 && <div style={{ fontSize: 12, color: "#996633", fontStyle: "italic", marginBottom: 8 }}>🎯 {state.mission_year1}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Sprint activo</div>
            <Badge text={state.sprint_status} color={STATUS_COLORS[state.sprint_status]} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#333", marginBottom: 12 }}>{state.sprint_name || "— sin definir —"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Proyecto activo</div>
            <Badge text={state.project_status} color={STATUS_COLORS[state.project_status]} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#C41E3A" }}>{state.project_name || "— sin definir —"}</div>
        </div>
      )}
    </div>

    {/* ── 2. Tres tareas del día y progreso ──────────────────────────────── */}
    <ST>Tareas de hoy {tasks.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "#999" }}>({doneCount}/{tasks.length} — {progressPct}%)</span>}</ST>
    {tasks.length > 0 && <div style={{ background: "#eee", borderRadius: 4, height: 6, marginBottom: 10, overflow: "hidden" }}><div style={{ background: "#1B7340", height: "100%", width: `${progressPct}%`, transition: "width .2s" }} /></div>}
    {tasks.map(t => (
      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f0f0", minWidth: 0 }}>
        <input type="checkbox" checked={t.status === "done"} onChange={() => handleToggleTask(t)} style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "#aaa" : "#333", overflowWrap: "break-word" }}>{t.text}</span>
        {t.action_type && t.action_target && (
          <button onClick={() => handleOpenTask(t)} title="Abrir" style={{ flexShrink: 0, background: "#F5F5F5", border: "1px solid #ddd", borderRadius: 6, color: "#555", cursor: "pointer", fontSize: 12, padding: "4px 8px" }}>Abrir</button>
        )}
        <button onClick={() => handleDeleteTask(t)} title="Eliminar" style={{ flexShrink: 0, background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
    ))}
    {tasks.length < 3 ? (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }} placeholder={`Agregar tarea (${tasks.length}/3)`} style={{ flex: 1, padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <Btn small primary onClick={handleAddTask} disabled={addingTask || !newTaskText.trim()}>+ Agregar</Btn>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={newTaskActionKind} onChange={e => setNewTaskActionKind(e.target.value as NewTaskActionKind)} style={{ padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }}>
            <option value="none">Sin acción</option>
            <option value="tab">Abrir pestaña del CRM</option>
            <option value="url">Abrir enlace externo</option>
          </select>
          {newTaskActionKind === "tab" && (
            <select value={newTaskTabTarget} onChange={e => setNewTaskTabTarget(e.target.value)} style={{ padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }}>
              {TASK_ACTION_TABS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
          )}
          {newTaskActionKind === "url" && (
            <input value={newTaskUrlTarget} onChange={e => setNewTaskUrlTarget(e.target.value)} placeholder="https://..." style={{ flex: 1, minWidth: 140, padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }} />
          )}
        </div>
      </div>
    ) : <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>Ya tienes 3 tareas — el máximo del día.</div>}
    {taskError && <div style={{ fontSize: 12, color: "#C41E3A", marginTop: 6 }}>⚠️ {taskError}</div>}

    {/* ── 3. Bloqueadores ─────────────────────────────────────────────────── */}
    <ST>Bloqueadores</ST>
    {editMode && draft ? (
      <textarea value={draft.blockersText} onChange={e => setDraft({ ...draft, blockersText: e.target.value })} placeholder="Un bloqueador por línea" rows={3} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
    ) : state.blockers.length === 0 ? (
      <div style={{ fontSize: 13, color: "#1B7340" }}>🎉 Sin bloqueadores</div>
    ) : (
      <div style={{ background: "#FDF2E9", borderLeft: "4px solid #D35400", borderRadius: 6, padding: "10px 14px" }}>
        {state.blockers.map((b, i) => <div key={i} style={{ fontSize: 13, color: "#996633", padding: "2px 0" }}>⛔ {b}</div>)}
      </div>
    )}

    {/* ── 4. Meta comercial y meta estructural de la semana ─────────────── */}
    <ST>Metas de la semana</ST>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 4 }}>
      <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 4 }}>Meta comercial</div>
        {editMode && draft
          ? <textarea value={draft.weekly_business_goal} onChange={e => setDraft({ ...draft, weekly_business_goal: e.target.value })} rows={2} style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
          : <div style={{ fontSize: 13, color: "#333" }}>{state.weekly_business_goal || "— sin definir —"}</div>}
      </div>
      <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 4 }}>Meta estructural</div>
        {editMode && draft
          ? <textarea value={draft.weekly_structural_goal} onChange={e => setDraft({ ...draft, weekly_structural_goal: e.target.value })} rows={2} style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
          : <div style={{ fontSize: 13, color: "#333" }}>{state.weekly_structural_goal || "— sin definir —"}</div>}
      </div>
    </div>

    {/* ── 5. Roadmap: Ahora / Después / Más adelante ─────────────────────── */}
    <ST>Roadmap</ST>
    {editMode && draft ? (
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 4 }}>
        <div><label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Ahora</label><textarea value={draft.roadmapNowText} onChange={e => setDraft({ ...draft, roadmapNowText: e.target.value })} rows={4} placeholder="Uno por línea" style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} /></div>
        <div><label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Después</label><textarea value={draft.roadmapNextText} onChange={e => setDraft({ ...draft, roadmapNextText: e.target.value })} rows={4} placeholder="Uno por línea" style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} /></div>
        <div><label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Más adelante</label><textarea value={draft.roadmapLaterText} onChange={e => setDraft({ ...draft, roadmapLaterText: e.target.value })} rows={4} placeholder="Uno por línea" style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} /></div>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, marginBottom: 4 }}>
        <RoadmapCol title="Ahora" items={state.roadmap_now} />
        <RoadmapCol title="Después" items={state.roadmap_next} />
        <RoadmapCol title="Más adelante" items={state.roadmap_later} />
      </div>
    )}

    {/* ── 6. Métricas rápidas ─────────────────────────────────────────────── */}
    <ST>Métricas rápidas</ST>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 4 }}>
      <Card title="Ventas del mes" value={fmt(salesThisMonth(orders))} color="#1B7340" />
      <Card title="Tiendas activas" value={activeStoresCount(clients, orders)} color="#1A5276" />
      {editMode && draft ? (
        <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", borderLeft: "4px solid #6C3483", minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Proyectos terminados</div>
          <input type="number" min={0} value={draft.projects_completed_count} onChange={e => setDraft({ ...draft, projects_completed_count: e.target.value })} style={{ width: 70, padding: "3px 6px", border: "1px solid #ddd", borderRadius: 4, fontSize: 18, fontWeight: 700, color: "#6C3483" }} />
        </div>
      ) : <Card title="Proyectos terminados" value={state.projects_completed_count} color="#6C3483" />}
      <Card title="Aprendizajes registrados" value={learningsCount} color="#D35400" />
    </div>

    {/* ── 7. Aprendizaje del día ──────────────────────────────────────────── */}
    <ST>Aprendizaje del día</ST>
    {latestLearning
      ? <div style={{ background: "#FEF9E7", borderLeft: "4px solid #D4AC0D", borderRadius: 6, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "#7D6608" }}>💡 {latestLearning.text}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{fmtD(latestLearning.learning_date)}</div>
        </div>
      : <div style={{ fontSize: 13, color: "#999", marginBottom: 10 }}>Aún no hay aprendizajes registrados.</div>}
    <div style={{ display: "flex", gap: 6 }}>
      <input value={newLearningText} onChange={e => setNewLearningText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddLearning(); }} placeholder="¿Qué aprendiste hoy?" style={{ flex: 1, padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
      <Btn small primary onClick={handleAddLearning} disabled={addingLearning || !newLearningText.trim()}>+ Guardar</Btn>
    </div>
    {learningError && <div style={{ fontSize: 12, color: "#C41E3A", marginTop: 6 }}>⚠️ {learningError}</div>}
  </div>;
};
