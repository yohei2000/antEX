import type { ArmySlime, SlimeOrder } from "./types";
import { clamp, distance, dot, normalize } from "./vector";

export function calculateCommandDelay(slime: ArmySlime, order: Omit<SlimeOrder, "executeAt" | "status">): number {
  if (slime.side === "player" && slime.manualControl) return 0;

  const shapeChange =
    Math.abs((order.targetWidth ?? slime.desiredWidth) - slime.currentWidth) / 180 +
    Math.abs((order.targetDepth ?? slime.desiredDepth) - slime.currentDepth) / 150 +
    distance(order.targetCenter ?? slime.center, slime.center) / 550 +
    distance(order.targetFocusPoint ?? slime.desiredFocusPoint ?? slime.center, slime.desiredFocusPoint ?? slime.center) / 620 +
    (Math.abs(order.targetLeftWingAdvance ?? slime.desiredLeftWingAdvance) +
      Math.abs(order.targetRightWingAdvance ?? slime.desiredRightWingAdvance)) /
      260 +
    (1 -
      dot(
        normalize(order.targetDirection ?? slime.desiredDirection),
        normalize(slime.facing),
      )) *
      0.8;

  return clamp(
    0.22 +
      slime.fatigue * 0.005 +
      slime.pressure * 0.004 +
      (slime.isEngaged ? 0.32 : 0) +
      (100 - slime.cohesion) * 0.007 +
      shapeChange * 0.85 +
      slime.crowding * 0.9 +
      0.38,
    0.18,
    2.8,
  );
}

export function issueOrder(
  slime: ArmySlime,
  order: Omit<SlimeOrder, "executeAt" | "status">,
): SlimeOrder | undefined {
  if (slime.isRouting) return undefined;
  const delay = calculateCommandDelay(slime, order);
  const activeOrder: SlimeOrder = {
    ...order,
    executeAt: order.issuedAt + delay,
    status: "transmitting",
  };
  slime.activeOrder = activeOrder;
  slime.commandDelay = delay;
  if (delay <= 0) updateOrder(slime, order.issuedAt);
  return activeOrder;
}

export function updateOrder(slime: ArmySlime, now: number): void {
  const order = slime.activeOrder;
  if (!order) return;
  if (order.status === "transmitting" && now >= order.executeAt) {
    order.status = "executing";
    slime.posture = order.posture;
    if (order.targetCenter) slime.desiredCenter = { ...order.targetCenter };
    if (order.targetDirection) {
      slime.desiredDirection = { ...order.targetDirection };
    }
    if (order.targetWidth !== undefined) slime.desiredWidth = order.targetWidth;
    if (order.targetDepth !== undefined) slime.desiredDepth = order.targetDepth;
    if (order.targetDensity !== undefined) slime.desiredDensity = order.targetDensity;
    if (order.targetLeftWingAdvance !== undefined)
      slime.desiredLeftWingAdvance = order.targetLeftWingAdvance;
    if (order.targetRightWingAdvance !== undefined)
      slime.desiredRightWingAdvance = order.targetRightWingAdvance;
    if (order.targetFocusPoint !== undefined) {
      slime.desiredFocusPoint = { ...order.targetFocusPoint };
    } else if (order.posture !== "breakthrough" && order.posture !== "envelop") {
      slime.desiredFocusPoint = undefined;
    }
    if (order.posture === "breakthrough") slime.shockTimer = 1.75;
  }

  if (
    order.status === "executing" &&
    now - order.executeAt >
      (order.posture === "breakthrough"
        ? 2.1
        : order.posture === "envelop"
          ? 1.65
          : 0.8)
  ) {
    order.status = "completed";
    slime.activeOrder = undefined;
  }
}
