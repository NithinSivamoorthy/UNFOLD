import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Temporary storage for one scan session: Caches/scan/<session>/frame-NN.jpg.
 * Each camera photo is immediately downscaled (long side ≤ 1280 px) and the full-resolution original
 * deleted, so a 30-frame scan stays at a few MB instead of hundreds.
 */
export type Frame = {
  uri: string;
  width: number;
  height: number;
  capturedAt: number;
  sizeBytes: number;
  /** device turn since Start Scan (gyro), degrees — approximate, see coverage.ts */
  headingDeg: number;
};

const MAX_SIDE = 1280;

export function newSession(): Directory {
  const dir = new Directory(Paths.cache, 'scan', `${Date.now().toString(36)}`);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function storeFrame(
  session: Directory,
  index: number,
  photo: { uri: string; width: number; height: number },
  headingDeg: number
): Promise<Frame> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_SIDE) {
    ctx.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const dest = new File(session, `frame-${String(index).padStart(2, '0')}-${Date.now().toString(36)}.jpg`);
  const tmp = new File(img.uri);
  await tmp.move(dest);
  deleteQuietly(photo.uri);
  return {
    uri: dest.uri,
    width: img.width,
    height: img.height,
    capturedAt: Date.now(),
    sizeBytes: new File(dest.uri).size ?? 0,
    headingDeg,
  };
}

/** Copies a frame out of the session so it survives session cleanup (e.g. as a generation source). */
export async function keepFrame(frame: Frame): Promise<string> {
  const dir = new Directory(Paths.cache, 'scan-keep');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${Date.now().toString(36)}.jpg`);
  await new File(frame.uri).copy(dest);
  return dest.uri;
}

export function deleteQuietly(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

export function deleteSession(session: Directory | null) {
  try {
    if (session?.exists) session.delete();
  } catch {}
}

/** Removes sessions left behind by a crash or force-quit. */
export function purgeStaleSessions() {
  try {
    const root = new Directory(Paths.cache, 'scan');
    if (root.exists) root.delete();
  } catch {}
}
