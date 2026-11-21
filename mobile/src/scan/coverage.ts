/**
 * Capture heuristic for the guided scan (pure logic, unit-tested).
 *
 * What it measures: how far the iPad has TURNED around the vertical (gravity) axis since Start Scan,
 * by integrating the gyroscope rate projected onto gravity. When you walk around an object while
 * keeping it centred, the iPad turns by about the angle you walked, so heading sectors are a
 * reasonable proxy for viewpoints.
 *
 * What it does NOT measure: position. Turning on the spot also fills sectors. It is a capture
 * heuristic, not verified 360° spatial coverage, and the UI says so.
 */
export const SECTORS = 10; // 36° each
export const SECTOR_DEG = 360 / SECTORS;
export const REQUIRED_SECTORS = 8; // ≈ 288° of heading change
export const MAX_FRAMES = 12;
export const STABLE_RATE_DEG_S = 30; // capture only when the iPad is nearly still (less blur)
export const FAST_RATE_DEG_S = 70; // show "Move slowly" above this
export const SCAN_TIMEOUT_MS = 150_000;
export const STALL_MS = 12_000; // no new sector for this long → "More angles needed"

type Vec = { x: number; y: number; z: number };

/** Signed turn rate (deg/s) about the gravity axis, from expo-sensors DeviceMotion data. */
export function yawRateAboutGravity(gravity: Vec, rate: { alpha: number; beta: number; gamma: number }): number {
  const g = Math.hypot(gravity.x, gravity.y, gravity.z);
  if (g < 1e-3) return 0;
  // expo-sensors (iOS): gamma = x, beta = y, alpha = z, all in the device frame like gravity.
  return (gravity.x * rate.gamma + gravity.y * rate.beta + gravity.z * rate.alpha) / g;
}

export function sectorOf(headingDeg: number): number {
  const h = ((headingDeg % 360) + 360) % 360;
  return Math.min(SECTORS - 1, Math.floor(h / SECTOR_DEG));
}

export interface CoverageState {
  headingDeg: number; // accumulated, signed, relative to start
  visited: boolean[]; // sectors the heading has passed through
  filled: boolean[]; // sectors with an accepted photo
}

export const initialCoverage = (): CoverageState => ({
  headingDeg: 0,
  visited: Array.from({ length: SECTORS }, (_, i) => i === 0),
  filled: Array(SECTORS).fill(false),
});

/** Advance heading by `rate` deg/s over `dtSec`; ignores absurd gaps (app paused etc.). */
export function integrate(s: CoverageState, rateDegS: number, dtSec: number): CoverageState {
  if (!(dtSec > 0) || dtSec > 0.5) return s;
  const headingDeg = s.headingDeg + rateDegS * dtSec;
  const sec = sectorOf(headingDeg);
  if (s.visited[sec]) return { ...s, headingDeg };
  const visited = [...s.visited];
  visited[sec] = true;
  return { ...s, headingDeg, visited };
}

/** Near-duplicate rejection: only one photo per heading sector. */
export function wantsCapture(s: CoverageState, absRateDegS: number, frameCount: number): boolean {
  return frameCount < MAX_FRAMES && absRateDegS < STABLE_RATE_DEG_S && !s.filled[sectorOf(s.headingDeg)];
}

export const filledCount = (s: CoverageState) => s.filled.filter(Boolean).length;

export function isComplete(s: CoverageState): boolean {
  return filledCount(s) >= REQUIRED_SECTORS;
}

/**
 * Basic blur check without pixel access: for the same scene and encoder settings, motion-blurred
 * JPEGs compress noticeably smaller. Reject a frame far below the median size of accepted frames.
 */
export function isLikelyBlurry(sizeBytes: number, acceptedSizes: number[]): boolean {
  if (acceptedSizes.length < 3 || sizeBytes <= 0) return false;
  const sorted = [...acceptedSizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return sizeBytes < median * 0.6;
}
