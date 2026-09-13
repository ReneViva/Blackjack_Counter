import type { SeatNumber } from "./game";

export function initialHandId(seat: SeatNumber): string {
  return `seat-${seat}-hand-1`;
}

export function splitChildHandIds(parentHandId: string): readonly [string, string] {
  return [`${parentHandId}-1`, `${parentHandId}-2`];
}
