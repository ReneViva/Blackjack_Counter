import type { TableTarget } from "../../domain/events";
import { SEAT_NUMBERS } from "../../domain/game";
import type { DerivedTableState } from "../../state/selectors";

export type AssignmentNavigationDirection =
  | "previous"
  | "next"
  | "dealer"
  | "middle-player";

export function assignmentTargetKey(target: TableTarget | null): string | null {
  return target?.kind === "dealer"
    ? "dealer"
    : target
      ? `seat-${target.seat}:${target.handId}`
      : null;
}

export function assignmentTargetName(
  table: DerivedTableState,
  target: TableTarget | null,
): string | null {
  if (target?.kind === "dealer") return "Dealer";
  if (!target) return null;
  const handIndex = table.playerHands[target.seat].findIndex(
    (hand) => hand.handId === target.handId,
  );
  return handIndex < 0 ? null : `Seat ${target.seat}, Hand ${handIndex + 1}`;
}

/**
 * The current table renders seats 1 through 7 from left to right. Each seat's
 * reconstructed hand array is already the stable split/resplit display order.
 * Dealer is the terminal target in the one-dimensional assignment order.
 */
export function deriveAssignmentTargets(
  table: DerivedTableState,
): readonly TableTarget[] {
  return [
    ...SEAT_NUMBERS.flatMap((seat) =>
      table.playerHands[seat].map((hand) => ({
        kind: "player-hand" as const,
        seat,
        handId: hand.handId,
      })),
    ),
    { kind: "dealer" as const },
  ];
}

function middlePlayerTarget(table: DerivedTableState): TableTarget | null {
  const occupiedTargets = SEAT_NUMBERS.flatMap((seat) => {
    const firstAssignableHand = table.playerHands[seat][0];
    return firstAssignableHand
      ? [{
          kind: "player-hand" as const,
          seat,
          handId: firstAssignableHand.handId,
        }]
      : [];
  });
  if (occupiedTargets.length === 0) return null;
  return occupiedTargets[Math.floor((occupiedTargets.length - 1) / 2)];
}

export function navigateAssignmentTarget(
  table: DerivedTableState,
  currentTarget: TableTarget | null,
  direction: AssignmentNavigationDirection,
): TableTarget | null {
  if (direction === "dealer") return { kind: "dealer" };
  if (direction === "middle-player") return middlePlayerTarget(table);

  const targets = deriveAssignmentTargets(table);
  const currentIndex = targets.findIndex(
    (target) => assignmentTargetKey(target) === assignmentTargetKey(currentTarget),
  );
  if (currentIndex < 0) return null;

  const offset = direction === "previous" ? -1 : 1;
  return targets[currentIndex + offset] ?? targets[currentIndex];
}
