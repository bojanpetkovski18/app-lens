export type WildcardToken =
  | { type: 'char'; char: string }
  /** Exactly one character other than a slash. */
  | { type: 'one' }
  /** Any run of characters, stopping at a slash unless `crossSlash` is set. */
  | { type: 'star'; crossSlash: boolean }
  /** "**\/": zero or more whole folders. */
  | { type: 'folders' };

export interface WildcardBounds {
  canStart: (index: number) => boolean;
  canEnd: (index: number) => boolean;
}

/**
 * Patterns come from files in other people's projects and websites, and a regular expression built
 * from them can take years to fail. This walks all live positions at once, so the cost is at most
 * pattern length times text length.
 */
export function matchesWildcard(tokens: readonly WildcardToken[], text: string, { canStart, canEnd }: WildcardBounds): boolean {
  const reach = (states: Set<number>, state: number): void => {
    if (states.has(state)) return;
    states.add(state);
    const type = tokens[state]?.type;
    if (type === 'star' || type === 'folders') reach(states, state + 1);
  };

  let active = new Set<number>();
  for (let index = 0; index <= text.length; index++) {
    if (canStart(index)) reach(active, 0);
    if (active.has(tokens.length) && canEnd(index)) return true;
    if (index === text.length) break;

    const char = text[index] as string;
    const next = new Set<number>();
    for (const state of active) {
      const token = tokens[state];
      if (!token) continue;
      if (token.type === 'char') {
        if (token.char === char) reach(next, state + 1);
      } else if (token.type === 'one') {
        if (char !== '/') reach(next, state + 1);
      } else if (token.type === 'star') {
        if (token.crossSlash || char !== '/') reach(next, state);
      } else {
        reach(next, state);
        if (char === '/') reach(next, state + 1);
      }
    }
    active = next;
  }
  return false;
}
