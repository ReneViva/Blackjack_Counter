import type { SeatNumber } from "../../domain/game";
import type { DerivedTableState } from "../../state/selectors";
import HandPanel from "./HandPanel";

type BlackjackTableProps = Readonly<{
  activeSeats: readonly SeatNumber[];
  table: DerivedTableState;
  userSeat: SeatNumber | null;
}>;

export default function BlackjackTable({
  activeSeats,
  table,
  userSeat,
}: BlackjackTableProps) {
  return (
    <section className="blackjack-table" aria-label="Observed blackjack table">
      <HandPanel cards={table.dealerCards} label="Dealer" />
      <div className="table-mark" aria-hidden="true">
        Blackjack · Educational simulation
      </div>
      <div className="player-grid">
        {activeSeats.map((seat) => (
          <HandPanel
            cards={table.playerCards[seat]}
            isUser={seat === userSeat}
            key={seat}
            label={`Player seat ${seat}`}
          />
        ))}
      </div>
    </section>
  );
}
