// Text size: five steps, applied as CSS zoom on <html>. The head script in the locale layout applies the saved step before paint.
export const LEVELS = [0.9, 1, 1.1, 1.25, 1.4];
export const DEFAULT_STEP = 1;
export const applyStep = (i: number) => { document.documentElement.style.zoom = LEVELS[i] === 1 ? "" : String(LEVELS[i]); };
export const percentOf = (i: number) => `${Math.round(LEVELS[i] * 100)}%`;
