const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery.matches;
}

/** The setting can change while the Hall is open, e.g. from the OS accessibility panel. */
export function onMotionPreferenceChange(listener: () => void): () => void {
  reducedMotionQuery.addEventListener('change', listener);
  return () => reducedMotionQuery.removeEventListener('change', listener);
}
