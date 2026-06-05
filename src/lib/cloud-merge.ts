// src/lib/cloud-merge.ts
// =============================================================================
// Fusión de registros por id para el "pull" de la nube.
// Estrategia: UNIÓN de ambos lados; en conflicto (mismo id) gana la versión de
// la nube (la última subida). No pierde registros que existan en un solo lado.
// =============================================================================

export interface HasId {
  id: string;
}

/** Une `local` + `cloud` por id. Conserva todos los ids; en conflicto gana `cloud`. */
export const mergeById = <T extends HasId>(local: T[], cloud: T[]): T[] => {
  const map = new Map<string, T>();
  for (const it of local) if (it && it.id) map.set(it.id, it);
  for (const it of cloud) if (it && it.id) map.set(it.id, it); // la nube pisa en conflicto
  return Array.from(map.values());
};
