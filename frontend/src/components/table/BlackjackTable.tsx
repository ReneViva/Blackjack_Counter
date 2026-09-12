import type { TableTarget } from "../../domain/events";
import { SEAT_NUMBERS, type SeatNumber } from "../../domain/game";
import type { DerivedTableState } from "../../state/selectors";
import DealerPosition from "./DealerPosition";
import PlayerSeat from "./PlayerSeat";

type BlackjackTableProps = Readonly<{
  activeSeats: readonly SeatNumber[];
  activeTarget: TableTarget | null;
  onAddPlayer: (seat: SeatNumber) => void;
  onSelectTarget: (target: TableTarget) => void;
  table: DerivedTableState;
  userSeat: SeatNumber | null;
}>;

export default function BlackjackTable({
  activeSeats,
  activeTarget,
  onAddPlayer,
  onSelectTarget,
  table,
  userSeat,
}: BlackjackTableProps) {
  return (
    <section className="blackjack-table" aria-label="Interactive observed blackjack table">
      <div className="table-felt">
        <DealerPosition
          active={activeTarget?.kind === "dealer"}
          cards={table.dealerCards}
          onSelect={onSelectTarget}
        />
        <div className="table-mark" aria-hidden="true">
          <strong>Blackjack probability laboratory</strong>
          <span>Finite-shoe analysis · Educational simulation</span>
        </div>
        {SEAT_NUMBERS.map((seat) => (
          <PlayerSeat
            active={activeTarget?.kind === "player" && activeTarget.seat === seat}
            cards={table.playerCards[seat]}
            isOccupied={activeSeats.includes(seat)}
            isUser={seat === userSeat}
            key={seat}
            onAdd={onAddPlayer}
            onSelect={onSelectTarget}
            seat={seat}
          />
        ))}
      </div>
    </section>
  );
}
