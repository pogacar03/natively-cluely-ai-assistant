export const DEEPSEEK_FLASH_MODEL = 'deepseek-flash';

export function isDeepseekModelId(modelId: string): boolean {
  return /^deepseek-(?:flash|v\d)/i.test(modelId);
}

// The retired V4 Flash names still resolve to V4.1 Flash on DeepSeek's API.
export function deepseekSupportsVision(modelId: string): boolean {
  return ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']
    .includes(modelId.toLowerCase());
}
