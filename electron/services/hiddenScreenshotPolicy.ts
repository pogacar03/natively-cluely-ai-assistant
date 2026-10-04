export interface HiddenScreenshotState {
  windowMode: 'launcher' | 'overlay';
  mainWindowVisible: boolean;
  overlayExpanded?: boolean;
}

/**
 * Keep screenshot actions silent whenever the overlay is hidden.
 * `mainWindowVisible` can still be true during the renderer's 400 ms hide
 * grace period, so the mirrored `overlayExpanded` state is part of the check.
 */
export function shouldKeepScreenshotHidden(
  state: HiddenScreenshotState,
): boolean {
  if (state.windowMode !== 'overlay') return false;
  return state.mainWindowVisible === false || state.overlayExpanded === false;
}
