import type { Vector2Like } from "./types";

export const vec = (x = 0, y = 0): Vector2Like => ({ x, y });
export const add = (a: Vector2Like, b: Vector2Like): Vector2Like => ({
  x: a.x + b.x,
  y: a.y + b.y,
});
export const sub = (a: Vector2Like, b: Vector2Like): Vector2Like => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
export const scale = (a: Vector2Like, amount: number): Vector2Like => ({
  x: a.x * amount,
  y: a.y * amount,
});
export const dot = (a: Vector2Like, b: Vector2Like): number => a.x * b.x + a.y * b.y;
export const length = (a: Vector2Like): number => Math.hypot(a.x, a.y);
export const distance = (a: Vector2Like, b: Vector2Like): number => length(sub(a, b));
export const normalize = (a: Vector2Like): Vector2Like => {
  const len = length(a);
  return len > 0.0001 ? scale(a, 1 / len) : vec(1, 0);
};
export const perpendicular = (a: Vector2Like): Vector2Like => ({ x: -a.y, y: a.x });
export const lerp = (a: Vector2Like, b: Vector2Like, t: number): Vector2Like => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export const clamp01 = (value: number): number => clamp(value, 0, 1);
export const rotate = (a: Vector2Like, radians: number): Vector2Like => ({
  x: a.x * Math.cos(radians) - a.y * Math.sin(radians),
  y: a.x * Math.sin(radians) + a.y * Math.cos(radians),
});
export const average = (points: Vector2Like[]): Vector2Like => {
  if (points.length === 0) return vec();
  return scale(points.reduce((sum, point) => add(sum, point), vec()), 1 / points.length);
};
export const signedAngle = (a: Vector2Like, b: Vector2Like): number =>
  Math.atan2(a.x * b.y - a.y * b.x, dot(a, b));
