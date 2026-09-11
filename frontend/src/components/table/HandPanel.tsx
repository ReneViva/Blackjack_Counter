import type { ObservedCard, Suit } from "../../domain/card";

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

type HandPanelProps = Readonly<{
  cards: readonly ObservedCard[];
  label: string;
  isUser?: boolean;
}>;

export default function HandPanel({
  cards,
  label,
  isUser = false,
}: HandPanelProps) {
  return (
    <section className={`hand-panel${isUser ? " hand-panel--user" : ""}`}>
      <h3>
        {label}
        {isUser && <span className="user-badge">You</span>}
      </h3>
      <div className="card-row" aria-label={`${label} observed cards`}>
        {cards.length === 0 ? (
          <span className="empty-hand">No cards observed</span>
        ) : (
          cards.map((card, index) =>
            card.kind === "known" ? (
              <span
                className={`playing-card playing-card--${card.suit}`}
                key={`${card.rank}-${card.suit}-${index}`}
                aria-label={`${card.rank} of ${card.suit}`}
              >
                {card.rank}
                {SUIT_SYMBOLS[card.suit]}
              </span>
            ) : (
              <span
                className="playing-card playing-card--unknown"
                key={`unknown-${index}`}
                aria-label="Unknown card"
              >
                ?
              </span>
            ),
          )
        )}
      </div>
    </section>
  );
}
