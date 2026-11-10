export type TimedSlot = {
  id: number;
  starts_at: string;
  ends_at: string;
  position: number;
};

/** Time Slot endpoints are non-conflicting; only positive-duration overlap conflicts. */
export function overlappingSlotPairs<T extends TimedSlot>(slots: T[]) {
  const pairs: [T, T][] = [];
  for (let left = 0; left < slots.length; left += 1) {
    for (let right = left + 1; right < slots.length; right += 1) {
      const first = slots[left];
      const second = slots[right];
      if (
        Date.parse(first.starts_at) < Date.parse(second.ends_at) &&
        Date.parse(second.starts_at) < Date.parse(first.ends_at)
      )
        pairs.push([first, second]);
    }
  }
  return pairs;
}

export function slotIsFull(capacity: number | null, registrationCount: number) {
  return capacity !== null && registrationCount >= capacity;
}
