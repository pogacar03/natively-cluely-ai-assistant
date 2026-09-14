export interface ScreenshotAttachmentPayload {
  path: string;
  preview: string;
  reveal?: boolean;
}

/** Normal attachments keep the existing expand-on-screenshot behavior. */
export function shouldRevealScreenshotAttachment(
  data: Pick<ScreenshotAttachmentPayload, 'reveal'>,
): boolean {
  return data.reveal !== false;
}
