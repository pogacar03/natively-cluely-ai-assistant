import type { PhoneMirrorInfo } from '../../types/electron';

/**
 * Phone Mirror status events can be intentionally lightweight for the launcher
 * renderer. Keep the last complete snapshot when one of those partial events
 * arrives so pairing details (URL, QR code, token, and bind address) do not
 * disappear after a phone connects or disconnects.
 */
export function mergePhoneMirrorInfo(
  previous: PhoneMirrorInfo,
  next: Partial<PhoneMirrorInfo>,
): PhoneMirrorInfo {
  return { ...previous, ...next };
}
