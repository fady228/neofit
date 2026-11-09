// Lets a screen ask the exercise library for a pick without passing functions through navigation params.
export interface Picked { id: string; name: string; bestKg?: number | null }
let handler: ((e: Picked) => void) | null = null;
export const setPicker = (fn: ((e: Picked) => void) | null) => { handler = fn; };
export const pick = (e: Picked) => { handler?.(e); };
export const hasPicker = () => !!handler;
