import { useEffect, useRef } from "react";

import type { TableTarget } from "../../domain/events";
import type { SeatNumber } from "../../domain/game";
import type { DerivedPlayerHand } from "../../state/selectors";
import PlayingCard from "./PlayingCard";

type PlayerSeatProps = Readonly<{
  activeHandId: string | null;
  hands: readonly DerivedPlayerHand[];
  isOccupied: boolean;
  isUser: boolean;
  onAdd: (seat: SeatNumber) => void;
  onSelect: (target: TableTarget) => void;
  seat: SeatNumber;
}>;

export default function PlayerSeat({
  activeHandId,
  hands,
  isOccupied,
  isUser,
  onAdd,
  onSelect,
  seat,
}: PlayerSeatProps) {
  const firstHandButton = useRef<HTMLButtonElement | null>(null);
  const wasOccupied = useRef(isOccupied);

  useEffect(() => {
    if (!wasOccupied.current && isOccupied) firstHandButton.current?.focus();
    wasOccupied.current = isOccupied;
  }, [isOccupied]);

  const active = activeHandId !== null;
  return (
    <div className={`table-position player-seat player-seat--${seat}${active ? " table-position--active" : ""}`}>
      {isOccupied ? (
        <div className="occupied-seat">
          <div className="occupied-seat__label">
            <span className="person-icon" aria-hidden="true"><span /><i /></span>
            <span className="target-label">Seat {seat}</span>
            {isUser && <span className="user-badge">Primary</span>}
          </div>
          <div className="seat-hands" aria-label={`Seat ${seat} hands`}>
            {hands.map((hand, index) => {
              const handActive = hand.handId === activeHandId;
              return (
                <button
                  ref={index === 0 ? firstHandButton : undefined}
                  type="button"
                  className={`seat-hand${handActive ? " seat-hand--active" : ""}`}
                  aria-label={`Seat ${seat}, occupied${isUser ? ", primary hand" : ""}${handActive ? ", active target" : ""}, Hand ${index + 1}`}
                  aria-pressed={handActive}
                  key={hand.handId}
                  onClick={() => onSelect({
                    kind: "player-hand",
                    seat,
                    handId: hand.handId,
                  })}
                >
                  <span className="seat-hand__heading">
                    Hand {index + 1}
                    {handActive && <span className="active-badge">Active</span>}
                  </span>
                  <span className="table-card-row" aria-label={hands.length === 1
                    ? `Seat ${seat} observed cards`
                    : `Seat ${seat}, Hand ${index + 1} observed cards`} aria-live="polite">
                    {hand.cards.length === 0 && <small>No cards</small>}
                    {hand.cards.map((card, cardIndex) => (
                      <PlayingCard
                        card={card}
                        key={`${card.kind}-${cardIndex}`}
                        compact
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
    </div>
  );
}
