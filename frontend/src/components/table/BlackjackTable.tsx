import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { TableTarget } from "../../domain/events";
import { SEAT_NUMBERS, type SeatNumber } from "../../domain/game";
import type { WorkspaceMode } from "../../domain/workspace";
import type { DerivedTableState } from "../../state/selectors";
import DealerPosition from "./DealerPosition";
import PlayerSeat from "./PlayerSeat";
import {
  calculateBlackjackTableLayout,
  MIN_DESKTOP_TABLE_SIZE,
} from "./tableLayout";

type BlackjackTableProps = Readonly<{
  activeSeats: readonly SeatNumber[];
  activeTarget: TableTarget | null;
  onAddPlayer: (seat: SeatNumber) => void;
  onSelectTarget: (target: TableTarget) => void;
  table: DerivedTableState;
  userSeat: SeatNumber | null;
  workspaceMode: WorkspaceMode;
}>;

export default function BlackjackTable({
  activeSeats,
  activeTarget,
  onAddPlayer,
  onSelectTarget,
  table,
  userSeat,
  workspaceMode,
}: BlackjackTableProps) {
  const feltRef = useRef<HTMLDivElement | null>(null);
  const [tableSize, setTableSize] = useState(MIN_DESKTOP_TABLE_SIZE);

  useLayoutEffect(() => {
    const felt = feltRef.current;
    if (!felt) return;

    const updateSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setTableSize((current) => current.width === width && current.height === height
        ? current
        : { width, height });
    };
    const measure = () => {
      const rect = felt.getBoundingClientRect();
      updateSize(rect.width, rect.height);
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === felt);
      if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(felt);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => calculateBlackjackTableLayout({
    ...tableSize,
    dealerCardCount: table.dealerCards.length,
    mode: workspaceMode,
    seats: SEAT_NUMBERS.map((seat) => ({
      seat,
      occupied: activeSeats.includes(seat),
      hands: table.playerHands[seat].map((hand) => ({
        handId: hand.handId,
        cardCount: hand.cards.length,
      })),
    })),
  }), [activeSeats, table.dealerCards.length, table.playerHands, tableSize, workspaceMode]);

  return (
    <section className="blackjack-table" aria-labelledby="blackjack-table-title">
      <h2 id="blackjack-table-title" className="visually-hidden">Interactive observed blackjack table</h2>
      <div className="table-felt" ref={feltRef} data-layout-mode={layout.mode}>
        <DealerPosition
          active={activeTarget?.kind === "dealer"}
          cards={table.dealerCards}
          layout={layout.dealer}
          onSelect={onSelectTarget}
          workspaceMode={workspaceMode}
        />
        <div className="table-mark" aria-hidden="true">
          <strong>Blackjack probability laboratory</strong>
          <span>Finite-shoe analysis · Educational simulation</span>
        </div>
        {SEAT_NUMBERS.map((seat) => (
          <PlayerSeat
            activeHandId={activeTarget?.kind === "player-hand" &&
                activeTarget.seat === seat
              ? activeTarget.handId
              : null}
            hands={table.playerHands[seat]}
            isOccupied={activeSeats.includes(seat)}
            isUser={seat === userSeat}
            key={seat}
            layout={layout.seats[seat]}
            onAdd={onAddPlayer}
            onSelect={onSelectTarget}
            seat={seat}
            workspaceMode={workspaceMode}
          />
        ))}
      </div>
    </section>
  );
}
