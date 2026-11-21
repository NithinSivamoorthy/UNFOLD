import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Polygon } from 'react-native-svg';

import { SECTORS } from './coverage';

/**
 * ILLUSTRATIVE scan overlay — a procedurally triangulated dome drawn inside the user-adjustable target
 * region. It is not recovered geometry: UNFOLD has no depth/segmentation here. Triangles light up per
 * heading sector in which a real photo has been accepted (see coverage.ts), so the animation tracks
 * genuine capture progress without pretending to be a reconstructed surface.
 */
type P = { x: number; y: number };
type Tri = { pts: [P, P, P]; sector: number; ring: number };

const RINGS = 4;

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildMesh(w: number, h: number): { tris: Tri[]; verts: (P & { sector: number })[] } {
  const cx = w / 2;
  const cy = h / 2;
  const rings: { p: P; a: number }[][] = [[{ p: { x: cx, y: cy }, a: 0 }]];
  for (let k = 1; k <= RINGS; k++) {
    const n = 6 * k;
    const r = Math.sin(((k / RINGS) * Math.PI) / 2); // dome bulge
    const ring: { p: P; a: number }[] = [];
    for (let i = 0; i < n; i++) {
      const jitter = k < RINGS ? (rand(k * 97 + i) - 0.5) * (Math.PI / n) * 0.6 : 0;
      const a = ((i + (k % 2) * 0.5) / n) * Math.PI * 2 + jitter;
      const rr = k < RINGS ? r * (0.94 + rand(i * 31 + k) * 0.08) : r;
      ring.push({ p: { x: cx + (w / 2) * rr * Math.sin(a), y: cy - (h / 2) * rr * Math.cos(a) }, a });
    }
    rings.push(ring);
  }
  const sectorAt = (pts: P[]) => {
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length - cx;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length - cy;
    const ang = (Math.atan2(mx / (w || 1), -my / (h || 1)) + Math.PI * 2) % (Math.PI * 2); // 0 = top, clockwise
    return Math.min(SECTORS - 1, Math.floor((ang / (Math.PI * 2)) * SECTORS));
  };
  const tris: Tri[] = [];
  for (let k = 1; k <= RINGS; k++) {
    const A = rings[k - 1];
    const B = rings[k];
    if (A.length === 1) {
      for (let j = 0; j < B.length; j++) {
        const pts: [P, P, P] = [A[0].p, B[j].p, B[(j + 1) % B.length].p];
        tris.push({ pts, sector: sectorAt(pts), ring: k });
      }
      continue;
    }
    // March around both rings, always advancing the one whose next vertex comes first by angle.
    let i = 0;
    let j = 0;
    const m = A.length;
    const n = B.length;
    const ang = (ring: { a: number }[], idx: number) => ring[idx % ring.length].a + Math.floor(idx / ring.length) * Math.PI * 2;
    while (i < m || j < n) {
      const advanceA = j >= n || (i < m && ang(A, i + 1) < ang(B, j + 1));
      const pts: [P, P, P] = advanceA
        ? [A[i % m].p, A[(i + 1) % m].p, B[j % n].p]
        : [A[i % m].p, B[j % n].p, B[(j + 1) % n].p];
      tris.push({ pts, sector: sectorAt(pts), ring: k });
      if (advanceA) i++;
      else j++;
    }
  }
  const verts = rings.flat().map(({ p }) => ({ ...p, sector: sectorAt([p]) }));
  return { tris, verts };
}

export function ScanMesh({
  width,
  height,
  filled,
  visited,
  scanning,
  complete,
}: {
  width: number;
  height: number;
  filled: boolean[];
  visited: boolean[];
  scanning: boolean;
  complete: boolean;
}) {
  const { tris, verts } = useMemo(() => buildMesh(width, height), [width, height]);
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    sweep.set(withRepeat(withTiming(1, { duration: scanning ? 2000 : 3200, easing: Easing.inOut(Easing.quad) }), -1, true));
    pulse.set(withRepeat(withSequence(withTiming(0.35, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
  }, [scanning, sweep, pulse]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.get() * (height - 24) }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  const anyFilled = filled.some(Boolean);
  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        <Ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2 - 1}
          ry={height / 2 - 1}
          stroke="#5EEAD4"
          strokeOpacity={scanning || complete ? 0.5 : 0.8}
          strokeWidth={1.5}
          strokeDasharray={scanning || complete ? undefined : '6 8'}
          fill="none"
        />
        {scanning || complete || anyFilled ? (
          <G>
            {tris.map((t, i) => {
              const on = complete || filled[t.sector];
              const seen = visited[t.sector];
              if (!on && !seen) return null;
              return (
                <Polygon
                  key={i}
                  points={t.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="#5EEAD4"
                  fillOpacity={on ? 0.07 + (t.ring / RINGS) * 0.05 : 0.0}
                  stroke="#5EEAD4"
                  strokeOpacity={on ? 0.75 : 0.18}
                  strokeWidth={on ? 1 : 0.6}
                  strokeLinejoin="round"
                />
              );
            })}
          </G>
        ) : null}
      </Svg>

      {/* animated surface vertices */}
      <Animated.View style={[StyleSheet.absoluteFill, pulseStyle]}>
        <Svg width={width} height={height}>
          {verts.map((v, i) =>
            complete || filled[v.sector] ? <Circle key={i} cx={v.x} cy={v.y} r={2.2} fill="#A7FFF3" /> : null
          )}
        </Svg>
      </Animated.View>

      {/* horizontal scan sweep, clipped to the target ellipse */}
      {!complete ? (
        <View style={[StyleSheet.absoluteFill, { borderRadius: Math.max(width, height), overflow: 'hidden' }]}>
          <Animated.View style={[styles.sweep, sweepStyle]}>
            <LinearGradient colors={['rgba(94,234,212,0)', 'rgba(94,234,212,0.28)', 'rgba(94,234,212,0)']} style={StyleSheet.absoluteFill} />
            <View style={styles.sweepLine} />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', left: 0, right: 0, top: 0, height: 24, justifyContent: 'center' },
  sweepLine: { height: 1.5, backgroundColor: '#5EEAD4', opacity: 0.9 },
});
