/**
 * Move & Recover: safety defaults in one place.
 *
 * Every value here is a DEFAULT chosen for the build and is PENDING founder
 * and clinical sign-off (see docs/FITNESS-PROTOCOLS.md, "Decisions pending
 * sign-off"). Change a number here and the server, the screen outcomes, the
 * pre-session check and the app copy all follow: the app reads these values
 * from GET /api/fitness/status, it never hard-codes them.
 */
export const FITNESS_RULES = Object.freeze({
  /** D1. After any alcohol or other drug use, heat, cold and contrast sessions lock for this many hours. */
  substanceLockHours: 24,
  /** D2. Withdrawal or detox (now, or within this many days) locks sauna, cold and contrast (temporary red). */
  withdrawalLocksHeatCold: true,
  withdrawalRecheckDays: 14,
  /** D3. Coldest water the app will guide (°C). Below this, the cold session will not start. */
  coldFloorC: 10,
  /** Longest single cold immersion the app times (minutes). */
  coldMaxMinutes: 5,
  /** Longest single sauna round the app times (minutes), and the most rounds per session. */
  saunaMaxMinutesPerRound: 20,
  saunaMaxRounds: 2,
  /** Contrast: most rounds and the most total sauna minutes per session. */
  contrastMaxRounds: 3,
  contrastMaxSaunaMinutes: 45,
  /** D4. On a "Struggling" check-in day or with "Strong" cravings, heat and cold are not suggested (not blocked). */
  notSuggestedOnStruggling: true,
  /** D5. A stable, managed heart condition gives an amber result: unlock only after the doctor's OK is ticked. */
  stableHeartOutcome: 'amber',
  /** Keep cold water away from strength sessions (hours after a strength workout). */
  strengthColdGapHours: 6,
  /** Re-screen after this many months, or sooner after a change in health or medicines. */
  rescreenMonths: 6,
  /** Other temporary reds (recent surgery, wounds) are re-checked after this many days. */
  temporaryRecheckDays: 42,
  /** Weekly guideline targets shown in the movement ring (Australian 24-hour movement guidelines, 2026). */
  weeklyMinutesTarget: 150,
  weeklyStrengthDaysTarget: 2,
});

/** The decisions the founder asked to flag. Shown in docs and in the founder preview. */
export const PENDING_DECISIONS = Object.freeze([
  { id: 'D1', rule: 'substanceLockHours', text: 'Sessions lock for 24 hours after any alcohol or drug use.' },
  { id: 'D2', rule: 'withdrawalLocksHeatCold', text: 'Sauna and cold are locked during withdrawal or detox (re-check after 14 days).' },
  { id: 'D3', rule: 'coldFloorC', text: 'The cold floor is 10 °C.' },
  { id: 'D4', rule: 'notSuggestedOnStruggling', text: "Sauna and cold aren't suggested on 'Struggling' or strong-craving days." },
  { id: 'D5', rule: 'stableHeartOutcome', text: "Stable heart conditions get an amber result that needs the doctor's OK." },
]);

/** Session kinds. Workouts are exercise; the other three are the heat and cold protocols. */
export const SESSION_KINDS = Object.freeze(['workout', 'sauna', 'cold', 'contrast']);
export const HEAT_COLD = Object.freeze(['sauna', 'cold', 'contrast']);
/** Screen areas: "move" gates the workout plan; the other three gate the protocols. */
export const SCREEN_AREAS = Object.freeze(['move', 'sauna', 'cold', 'contrast']);
export const OUTCOMES = Object.freeze(['green', 'amber', 'red']);
