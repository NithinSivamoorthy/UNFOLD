/**
 * Proposed interfaces between the frontend shell (owned by frontend) and teammate-owned modules.
 * Physics/Measurements/AR teammate: implement these in the folders listed in README.md.
 * Frontend will only import from those folders' index.ts — it never edits them.
 */
import type { ComponentType } from 'react';

/** A real model stored on the device. */
export interface ModelRef {
  id: string;
  name: string;
  /** file:// URI of the GLB on device storage */
  glbUri: string;
  /** Raw extents reported by the renderer, in GLB model units (NOT centimetres). */
  modelExtents?: { x: number; y: number; z: number };
}

/** Result of user calibration: how many real centimetres one model unit represents. */
export interface Calibration {
  cmPerModelUnit: number;
  /** How the reference was obtained, e.g. "Known length: 15 cm ruler along X" */
  method: string;
}

export interface MeasurementPanelProps {
  model: ModelRef;
  calibration?: Calibration;
  onCalibrated(c: Calibration): void;
}

export interface PhysicsLabProps {
  model: ModelRef;
  calibration?: Calibration;
  onExit(): void;
}

export interface ARPlacementProps {
  model: ModelRef;
  calibration?: Calibration;
  onExit(): void;
}

export interface TeammateModules {
  MeasurementPanel?: ComponentType<MeasurementPanelProps>;
  PhysicsLab?: ComponentType<PhysicsLabProps>;
  /** Only provide when backed by real ARKit tracking; check `isSupported()` before showing. */
  ARPlacement?: ComponentType<ARPlacementProps> & { isSupported(): Promise<boolean> };
}
