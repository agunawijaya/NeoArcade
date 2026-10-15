/** A key's name as it is printed on the key, from its KeyboardEvent.code. */
export function keyLabel(code: string): string {
  const arrows: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  return arrows[code] ?? code.replace(/^(Key|Digit|Numpad)/, '');
}
