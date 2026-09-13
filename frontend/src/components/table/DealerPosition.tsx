import type { ObservedCard } from "../../domain/card";
import type { TableTarget } from "../../domain/events";
import PlayingCard from "./PlayingCard";

type DealerPositionProps = Readonly<{
  active: boolean;
  cards: readonly ObservedCard[];
  onSelect: (target: TableTarget) => void;
}>;

export default function DealerPosition({ active, cards, onSelect }: DealerPositionProps) {
  return (
    <div className={`table-position dealer-position${active ? " table-position--active" : ""}`}>
      <button
        type="button"
        className="target-button"
        aria-label={`Dealer${active ? ", active target" : ""}`}
        aria-pressed={active}
        onClick={() => onSelect({ kind: "dealer" })}
      >
        <span className="person-icon" aria-hidden="true"><span /><i /></span>
        <span className="target-label">Dealer</span>
        {active && <span className="active-badge">Active</span>}
      </button>
      <div className="table-card-row" aria-label="Dealer observed cards" aria-live="polite">
        {cards.map((card, index) => (
          <PlayingCard card={card} key={`${card.kind}-${index}`} compact />
        ))}
      </div>
    </div>
  );
}
