// A player's identity as text, cached by its value. The SDK's toHexString() re-encodes the 256-bit
// number on every call, and the game compares identities (players, plots, gifts, chat) thousands of
// times a frame, so converting each one once keeps the town smooth.
const cache = new Map<bigint, string>();

export function hex(id: { __identity__: bigint; toHexString(): string } | undefined | null): string {
  if (!id) return "";
  let h = cache.get(id.__identity__);
  if (h === undefined) {
    h = id.toHexString();
    if (cache.size > 10_000) cache.clear();
    cache.set(id.__identity__, h);
  }
  return h;
}
