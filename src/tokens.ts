export function estimateTokens(text: string): number {
  if (!text.trim()) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

export function estimateSavings(rawText: string, packedText: string): number {
  const raw = estimateTokens(rawText);
  const packed = estimateTokens(packedText);
  if (raw === 0) {
    return 0;
  }
  return Math.max(0, Math.round(((raw - packed) / raw) * 100));
}
