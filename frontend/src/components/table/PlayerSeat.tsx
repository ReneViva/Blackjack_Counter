import { useEffect, useRef } from "react";

import type { TableTarget } from "../../domain/events";
import type { SeatNumber } from "../../domain/game";
import type { WorkspaceMode } from "../../domain/workspace";
import type { DerivedPlayerHand } from "../../state/selectors";
import PlayingCard from "./PlayingCard";
import type { TableSeatLayout } from "./tableLayout";

type PlayerSeatProps = Readonly<{
  activeHandId: string | null;
  hands: readonly DerivedPlayerHand[];
  isOccupied: boolean;
  isUser: boolean;
  layout: TableSeatLayout;
  onAdd: (seat: SeatNumber) => void;
  onSelect: (target: TableTarget) => void;
  seat: SeatNumber;
  workspaceMode: WorkspaceMode;
}>;

export default function PlayerSeat({
  activeHandId,
  hands,
  isOccupied,
  isUser,
  layout,
  onAdd,
  onSelect,
  seat,
  workspaceMode,
}: PlayerSeatProps) {
  const firstHandButton = useRef<HTMLButtonElement | null>(null);
  const wasOccupied = useRef(isOccupied);

  useEffect(() => {
    if (!wasOccupied.current && isOccupied) firstHandButton.current?.focus();
    wasOccupied.current = isOccupied;
  }, [isOccupied]);

  const active = activeHandId !== null;
  return (
    <div
      className={`table-position player-seat player-seat--${seat}${active ? " table-position--active" : ""}`}
      data-hand-columns={layout.columns}
      data-layout-height={layout.rect.height}
      data-layout-width={layout.rect.width}
      data-layout-x={layout.rect.x}
      data-layout-y={layout.rect.y}
      style={{
        height: layout.rect.height,
        left: layout.rect.x,
        top: layout.rect.y,
        width: layout.rect.width,
      }}
    >
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
              const handLayout = layout.hands[index];
              if (!handLayout) return null;
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
                  style={{
                    "--layout-card-height": `${handLayout.cardHeight}px`,
                    "--layout-card-gap": `${handLayout.cardGap}px`,
                    "--layout-card-width": `${handLayout.cardWidth}px`,
                    "--layout-fan-width": `${handLayout.cardVisualWidth}px`,
                    height: handLayout.rect.height,
                    left: handLayout.rect.x - layout.rect.x,
                    top: handLayout.rect.y - layout.rect.y,
                    width: handLayout.rect.width,
                  } as React.CSSProperties}
                >
                  <span className="seat-hand__heading">
                    Hand {index + 1}
                    {handActive && <span className="active-badge">Active</span>}
                  </span>
                  <span
                    className="table-card-row"
                    data-card-count={hand.cards.length}
                    data-card-gap={handLayout.cardGap}
                    data-card-width={handLayout.cardWidth}
                    data-fan-width={handLayout.cardVisualWidth}
                    aria-label={hands.length === 1
                    ? `Seat ${seat} observed cards`
                    : `Seat ${seat}, Hand ${index + 1} observed cards`}
                    aria-live={workspaceMode === "pro" ? "off" : "polite"}
                  >
                    {hand.cards.length === 0 && <small>No cards</small>}
                    {hand.cards.map((card, cardIndex) => (
                      <PlayingCard
                        card={card}
                        key={`${card.kind}-${cardIndex}`}
                        compact
                        stackIndex={cardIndex}
                        workspaceMode={workspaceMode}
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
