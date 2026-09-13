import { RANKS, SUITS, type KnownCard, type Suit } from "../../domain/card";
import type { TableTarget } from "../../domain/events";
import type { DerivedTableState } from "../../state/selectors";
import { cardAccessibleName, SUIT_SYMBOLS } from "../table/PlayingCard";

type CardPickerProps = Readonly<{
  activeTarget: TableTarget | null;
  decks: number | null;
  onKnownCard: (target: TableTarget, card: KnownCard) => void;
  onUnknownCard: (target: TableTarget) => void;
  table: DerivedTableState;
}>;

const SUIT_LABELS: Record<Suit, string> = {
  spades: "Spades",
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
};

const CARD_PICKER_RANKS = [...RANKS.slice(1), RANKS[0]];

export default function CardPicker({
  activeTarget,
  decks,
  onKnownCard,
  onUnknownCard,
  table,
}: CardPickerProps) {
  const observed = [
    ...table.dealerCards,
    ...table.discardedCards,
    ...Object.values(table.playerHands).flatMap((hands) =>
      hands.flatMap((hand) => hand.cards)
    ),
  ];
  const activeHandIndex = activeTarget?.kind === "player-hand"
    ? table.playerHands[activeTarget.seat].findIndex(
        (hand) => hand.handId === activeTarget.handId,
      )
    : -1;
  const targetName = activeTarget?.kind === "dealer"
    ? "Dealer"
    : activeTarget?.kind === "player-hand" && activeHandIndex >= 0
      ? `Seat ${activeTarget.seat}, Hand ${activeHandIndex + 1}`
      : null;

  const isUnavailable = (card: KnownCard): boolean => {
    if (decks === null) return false;
    const usedCopies = observed.filter((item) => item.kind === "known" &&
      item.rank === card.rank && item.suit === card.suit).length;
    return usedCopies >= decks;
  };

  return (
    <section className="workspace-panel card-picker" aria-labelledby="card-picker-title">
      <div className="workspace-panel__heading">
        <div>
          <p className="eyebrow">Direct observation</p>
          <h2 id="card-picker-title">Card Assignment</h2>
        </div>
        <span className="panel-icon" aria-hidden="true">♠</span>
      </div>
      <p id="assignment-prompt" className="assignment-prompt" role="status" aria-live="polite" aria-atomic="true">
        {targetName
          ? <>Assigning to: <strong>{targetName}</strong></>
          : "Select the dealer or an occupied player first, then choose a hand."}
      </p>

      <div className="card-inventory" aria-label="All 52 cards">
        {SUITS.map((suit) => (
          <section
            className={`suit-group suit-group--${suit}`}
            key={suit}
            aria-labelledby={`suit-${suit}`}
          >
            <h3 id={`suit-${suit}`}>{SUIT_SYMBOLS[suit]} {SUIT_LABELS[suit]}</h3>
            <div className="picker-card-grid">
              {CARD_PICKER_RANKS.map((rank, index) => {
                const card = { kind: "known", rank, suit } as const;
                const unavailable = isUnavailable(card);
                return (
                  <button
                    type="button"
                    className={`picker-card picker-card--${suit}${index === 6 ? " picker-card--row-break" : ""}`}
                    disabled={!activeTarget || unavailable}
                    key={`${rank}-${suit}`}
                    aria-label={`${cardAccessibleName(rank, suit)}${unavailable ? ", unavailable: all configured copies are already observed" : ""}`}
                    aria-describedby={!activeTarget ? "assignment-prompt" : unavailable ? "card-picker-note" : undefined}
                    onClick={() => activeTarget && onKnownCard(activeTarget, card)}
                  >
                    <span>{rank}</span>
                    <span aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="unknown-card-control">
        <button
          type="button"
          className="unknown-card-button"
          disabled={!activeTarget}
          aria-label="Assign unknown card"
          aria-describedby={!activeTarget ? "assignment-prompt" : undefined}
          onClick={() => activeTarget && onUnknownCard(activeTarget)}
        >
          <strong aria-hidden="true">?</strong>
          <span>Unknown</span>
        </button>
      </div>
      <p id="card-picker-note" className="picker-note">
        Used copies are disabled for known deck counts. Python validation remains authoritative.
      </p>
    </section>
  );
}
