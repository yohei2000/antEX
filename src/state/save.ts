import { createDefaultColony } from "./colony";
import { migrateColony } from "./migrations";
import type { ColonyState } from "./schema";

export const SAVE_KEY = "ant3d.colonyState";

export function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-critical persistence can fail in private or locked-down contexts.
  }
}

export function readColonyState(): ColonyState {
  const raw = readStorage(SAVE_KEY);
  if (!raw) return createDefaultColony();
  try {
    return migrateColony(JSON.parse(raw));
  } catch {
    return createDefaultColony();
  }
}

export function serializeColonyState(colony: ColonyState) {
  return JSON.stringify(colony);
}
