import type { ObservedCard } from "../../domain/card";
import type { TableTarget } from "../../domain/events";
import type { SeatNumber } from "../../domain/game";
import PlayingCard from "./PlayingCard";

type PlayerSeatProps = Readonly<{
  active: boolean;
  cards: readonly ObservedCard[];
  isOccupied: boolean;
  isUser: boolean;
  onAdd: (seat: SeatNumber) => void;
  onSelect: (target: TableTarget) => void;
  seat: SeatNumber;
}>;

export default function PlayerSeat({
  active,
  cards,
  isOccupied,
  isUser,
  onAdd,
  onSelect,
  seat,
}: PlayerSeatProps) {
  return (
    <section className={`table-position player-seat player-seat--${seat}${active ? " table-position--active" : ""}`}>
      {isOccupied ? (
        <button
          type="button"
          className="target-button"
          aria-label={`Seat ${seat}, occupied${isUser ? ", primary hand" : ""}${active ? ", active target" : ""}`}
          aria-pressed={active}
          onClick={() => onSelect({ kind: "player", seat })}
        >
          <span className="person-icon" aria-hidden="true"><span /><i /></span>
          <span className="target-label">Seat {seat}</span>
          {isUser && <span className="user-badge">Primary</span>}
          {active && <span className="active-badge">Active</span>}
        </button>
      ) : (
        <button
          type="button"
          className="empty-seat-button"
          aria-label={`Add player at Seat ${seat}`}
          onClick={() => onAdd(seat)}
        >
          <span className="seat-plus" aria-hidden="true">+</span>
          <span className="target-label">Seat {seat}</span>
          <small>Add player</small>
        </button>
      )}
      {isOccupied && (
        <div className="table-card-row" aria-label={`Seat ${seat} observed cards`}>
          {cards.map((card, index) => (
            <PlayingCard card={card} key={`${card.kind}-${index}`} compact />
          ))}
        </div>
      )}
    </section>
  );
}
