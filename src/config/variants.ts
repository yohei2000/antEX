export const ANT_VARIANTS = ["worker", "soldier", "heavySoldier", "acidShooter", "builder"] as const;

export type AntVariant = typeof ANT_VARIANTS[number];

export interface AntVariantConfig {
  bodyScale: number;
  headScale: number;
  abdomenScale: number;
  speed: number;
  turnRate: number;
  hp: number;
  carapace: number;
  pushMass: number;
  brace: number;
  attack: number;
  contact: number;
  staminaRecovery: number;
  upkeep: number;
  forageEfficiency: number;
  buildPower: number;
  dangerResponse: number;
}

export const ANT_VARIANT_CONFIG: Record<AntVariant, AntVariantConfig> = {
  worker: {
    bodyScale: 1,
    headScale: 1,
    abdomenScale: 1,
    speed: 1,
    turnRate: 1,
    hp: 1,
    carapace: 1,
    pushMass: 1,
    brace: 1,
    attack: 0.22,
    contact: 0.18,
    staminaRecovery: 1,
    upkeep: 0,
    forageEfficiency: 1,
    buildPower: 0,
    dangerResponse: 1,
  },
  soldier: {
    bodyScale: 1.1,
    headScale: 1.18,
    abdomenScale: 0.94,
    speed: 0.94,
    turnRate: 0.94,
    hp: 1.28,
    carapace: 1.22,
    pushMass: 1.24,
    brace: 1.22,
    attack: 0.58,
    contact: 0.42,
    staminaRecovery: 0.9,
    upkeep: 0.0011,
    forageEfficiency: 0.12,
    buildPower: 0,
    dangerResponse: 0.82,
  },
  heavySoldier: {
    bodyScale: 1.34,
    headScale: 1.42,
    abdomenScale: 0.98,
    speed: 0.68,
    turnRate: 0.72,
    hp: 1.95,
    carapace: 1.8,
    pushMass: 1.86,
    brace: 2.08,
    attack: 0.76,
    contact: 0.68,
    staminaRecovery: 0.58,
    upkeep: 0.0028,
    forageEfficiency: 0,
    buildPower: 0,
    dangerResponse: 0.48,
  },
  acidShooter: {
    bodyScale: 1.08,
    headScale: 0.96,
    abdomenScale: 1.28,
    speed: 0.82,
    turnRate: 0.86,
    hp: 1.04,
    carapace: 0.94,
    pushMass: 0.86,
    brace: 0.72,
    attack: 0.42,
    contact: 0.18,
    staminaRecovery: 0.78,
    upkeep: 0.0017,
    forageEfficiency: 0,
    buildPower: 0,
    dangerResponse: 0.7,
  },
  builder: {
    bodyScale: 1.04,
    headScale: 0.98,
    abdomenScale: 1.12,
    speed: 0.9,
    turnRate: 1.04,
    hp: 0.86,
    carapace: 0.86,
    pushMass: 0.82,
    brace: 0.68,
    attack: 0.12,
    contact: 0.11,
    staminaRecovery: 0.96,
    upkeep: 0.0007,
    forageEfficiency: 0.62,
    buildPower: 1,
    dangerResponse: 1.36,
  },
};

export function normalizeAntVariant(variant: unknown): AntVariant {
  return ANT_VARIANTS.includes(variant as AntVariant) ? variant as AntVariant : "worker";
}

export function getAntVariantConfig(variant: unknown): AntVariantConfig {
  return ANT_VARIANT_CONFIG[normalizeAntVariant(variant)];
}
