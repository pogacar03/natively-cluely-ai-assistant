export interface PhoneMirrorStealthModeState {
  windowMode: 'launcher' | 'overlay';
  mainWindowVisible: boolean;
  overlayExpanded?: boolean;
  phoneClients: number;
}

/**
 * Keep Cmd+H silent only for the overlay-hidden + connected-phone workflow.
 * `mainWindowVisible` can still be true during the renderer's 400 ms hide
 * grace period, so the mirrored `overlayExpanded` state is part of the check.
 */
export function shouldUsePhoneMirrorStealthMode(
  state: PhoneMirrorStealthModeState,
): boolean {
  if (state.windowMode !== 'overlay') return false;
  if (state.phoneClients < 1) return false;
  return state.mainWindowVisible === false || state.overlayExpanded === false;
}
