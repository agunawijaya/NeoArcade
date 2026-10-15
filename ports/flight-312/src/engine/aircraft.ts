/**
 * The jumbo: a four-engine wide-body of the early 1980s, in round public
 * numbers for its type (the -200 of the 747 family the program named). The
 * figures are the ones published in type summaries and textbooks, not a
 * manufacturer's data; docs/games/flight-312.md lists each with what the
 * model produces from it.
 */
export const JUMBO = {
  wingAreaFt2: 5500,
  spanFt: 195.7,
  /** 1 / (π · aspect ratio · Oswald factor 0.85). */
  inducedDragFactor: 0.0538,
  emptyWeightLb: 380_000,
  payloadLb: 70_000,
  maxTakeoffWeightLb: 833_000,
  maxLandingWeightLb: 630_000,
  liftSlopePerDeg: 0.0905,
  /** Main wheels on the ground, nose wheel just off: past this the tail touches. */
  tailStrikePitchDeg: 11,
  /** Pilot's eye above the main wheels, feet, on the ground. */
  eyeHeightFt: 29,
  /** Eye ahead of the main wheels, feet. */
  eyeAheadFt: 88,
  wheelbaseFt: 84,
  vmoKt: 365,
  mmo: 0.92,
  engineCount: 4,
  /** Static sea-level thrust per engine, a JT9D-class turbofan. */
  staticThrustLbf: 47_000,
} as const;

/** The flap lever's detents and what each does to the wing. */
export interface FlapDetent {
  label: string;
  degrees: number;
  /** Lift at zero angle of attack. */
  liftAtZero: number;
  maxLift: number;
  drag: number;
  /** Placard: fastest the flaps may be at this setting, knots. */
  limitKt: number;
}

export const FLAP_DETENTS: readonly FlapDetent[] = [
  { label: 'UP', degrees: 0, liftAtZero: 0.2, maxLift: 1.25, drag: 0.016, limitKt: Infinity },
  { label: '1', degrees: 1, liftAtZero: 0.45, maxLift: 1.55, drag: 0.02, limitKt: 280 },
  { label: '5', degrees: 5, liftAtZero: 0.7, maxLift: 1.85, drag: 0.027, limitKt: 260 },
  { label: '10', degrees: 10, liftAtZero: 0.85, maxLift: 2.05, drag: 0.033, limitKt: 240 },
  { label: '20', degrees: 20, liftAtZero: 1.0, maxLift: 2.25, drag: 0.047, limitKt: 220 },
  { label: '25', degrees: 25, liftAtZero: 1.1, maxLift: 2.4, drag: 0.06, limitKt: 205 },
  { label: '30', degrees: 30, liftAtZero: 1.2, maxLift: 2.55, drag: 0.08, limitKt: 180 },
];

export const GEAR_DRAG = 0.02;
export const SPEEDBRAKE_DRAG = 0.025;
/** Gear may be lowered up to this speed, and flown down up to it. */
export const GEAR_LIMIT_KT = 270;

/** Lift and drag figures for a flap position between detents (the flaps travel). */
export function flapAero(flapDegrees: number): FlapDetent {
  const detents = FLAP_DETENTS;
  for (let index = 1; index < detents.length; index++) {
    const upper = detents[index] as FlapDetent;
    const lower = detents[index - 1] as FlapDetent;
    if (flapDegrees <= upper.degrees) {
      const t = (flapDegrees - lower.degrees) / (upper.degrees - lower.degrees);
      const mix = (a: number, b: number) => a + (b - a) * t;
      return {
        label: t < 0.5 ? lower.label : upper.label,
        degrees: flapDegrees,
        liftAtZero: mix(lower.liftAtZero, upper.liftAtZero),
        maxLift: mix(lower.maxLift, upper.maxLift),
        drag: mix(lower.drag, upper.drag),
        limitKt: t > 0 ? upper.limitKt : lower.limitKt,
      };
    }
  }
  return detents[detents.length - 1] as FlapDetent;
}

/** Angle of attack at which the wing stalls with these flaps, degrees. */
export function stallAlpha(flapDegrees: number): number {
  const aero = flapAero(flapDegrees);
  return (aero.maxLift - aero.liftAtZero) / JUMBO.liftSlopePerDeg;
}

/**
 * The fuel system: four main tanks, one feeding each engine, two small
 * reserve tanks outboard and the big centre tank. Capacities in pounds
 * (6.7 lb to the US gallon), approximate for the type.
 */
export type TankId = 'main1' | 'main2' | 'main3' | 'main4' | 'reserve1' | 'reserve4' | 'centre';

export const TANK_CAPACITY: Record<TankId, number> = {
  main1: 29_600,
  main2: 82_400,
  main3: 82_400,
  main4: 29_600,
  reserve1: 3_400,
  reserve4: 3_400,
  centre: 115_000,
};

export const TANK_ORDER: readonly TankId[] = [
  'reserve1',
  'main1',
  'main2',
  'centre',
  'main3',
  'main4',
  'reserve4',
];

/**
 * Loads fuel as a crew would: all four mains evenly until the smaller outer
 * ones are full, then the inner mains, the reserves, and the centre tank
 * last. Every engine always has its own tank to draw from.
 */
export function loadFuel(totalLb: number): Record<TankId, number> {
  const tanks: Record<TankId, number> = {
    main1: 0,
    main2: 0,
    main3: 0,
    main4: 0,
    reserve1: 0,
    reserve4: 0,
    centre: 0,
  };
  let left = totalLb;
  // Each group fills evenly until its smallest tank is full.
  const fill = (group: TankId[]) => {
    const room = Math.min(...group.map((tank) => TANK_CAPACITY[tank] - tanks[tank]));
    const each = Math.min(left / group.length, room);
    for (const tank of group) tanks[tank] += each;
    left -= each * group.length;
  };
  fill(['main1', 'main2', 'main3', 'main4']);
  fill(['main2', 'main3']);
  fill(['reserve1', 'reserve4']);
  fill(['centre']);
  return tanks;
}

/**
 * Reference speeds for the weight and flaps, the way a crew reads them off
 * the card: stall from the wing's maximum lift, rotation and V2 above it,
 * Vref = 1.3 × stall in the landing configuration.
 */
export function stallSpeedKt(weightLb: number, flapDegrees: number): number {
  const dynamicPressureNeeded = weightLb / (JUMBO.wingAreaFt2 * flapAero(flapDegrees).maxLift);
  // ½ρV² at sea level: V = √(2q/ρ0), in knots.
  return Math.sqrt((2 * dynamicPressureNeeded) / 0.0023769) / 1.6878098571;
}

export function referenceSpeeds(weightLb: number, takeoffFlaps: number, landingFlaps = 30) {
  const takeoffStall = stallSpeedKt(weightLb, takeoffFlaps);
  return {
    v1: Math.round(takeoffStall * 1.15),
    vr: Math.round(takeoffStall * 1.2),
    v2: Math.round(takeoffStall * 1.28),
    vref: Math.round(stallSpeedKt(weightLb, landingFlaps) * 1.3),
  };
}
