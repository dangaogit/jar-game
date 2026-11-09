export interface Resolution { width: number; height: number }
export const DEFAULT_RESOLUTION: Resolution = { width: 240, height: 320 };
export const PRESETS = ['128x128', '128x160', '176x208', '176x220', '240x320', '320x240', '240x400', '360x640'];
export function resolution(width: number, height: number): Resolution {
  if (![width, height].every((v) => Number.isInteger(v) && v >= 96 && v <= 800)) {
    throw new Error('宽和高必须是 96–800 之间的整数');
  }
  return { width, height };
}
export function savedResolution(id: string): Resolution {
  try {
    const v = JSON.parse(localStorage.getItem(`jargame:resolution:${id}`) ?? 'null');
    return resolution(v.width, v.height);
  } catch { return { ...DEFAULT_RESOLUTION }; }
}
