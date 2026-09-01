export const DEFAULT_PREVIEW_VOLUME = 25;

export function normalisePreviewVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREVIEW_VOLUME;
  return Math.min(100, Math.max(0, Math.round(value)));
}
