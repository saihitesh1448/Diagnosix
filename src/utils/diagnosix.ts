export function createSessionId(): string {
  const suffix = Date.now().toString().slice(-4);
  return `DX-${suffix}`;
}

export function cn(...inputs: (string | boolean | undefined)[]): string {
  return inputs.filter(Boolean).join(' ');
}
