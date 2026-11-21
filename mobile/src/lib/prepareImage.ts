import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PickedImage } from './useGeneration';

const MAX_SIDE = 2048;

/**
 * iPad photos are ~12 MP. Downscale to ≤2048 px (plenty for image-to-3D) and re-encode as JPEG so
 * uploads over campus Wi-Fi take seconds, not minutes. Also normalizes HEIC → JPEG.
 */
export async function prepareImageForUpload(img: PickedImage): Promise<PickedImage> {
  const longSide = Math.max(img.width, img.height);
  const ctx = ImageManipulator.manipulate(img.uri);
  if (longSide > MAX_SIDE) {
    ctx.resize(img.width >= img.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg', fileName: 'capture.jpg' };
}
