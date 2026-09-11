import type { SessionRules } from "./rules";

export const SEAT_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

export type SeatNumber = (typeof SEAT_NUMBERS)[number];

export type SessionConfiguration = Readonly<{
  rules: SessionRules;
  activeSeats: readonly SeatNumber[];
  userSeat: SeatNumber | null;
}>;
