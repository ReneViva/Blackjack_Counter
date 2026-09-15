import type { ObservedCard } from "../../domain/card";
import type { TableTarget } from "../../domain/events";
import type { WorkspaceMode } from "../../domain/workspace";
import PlayingCard from "./PlayingCard";
import { calculateCardFan } from "./cardFan";
import type { TableLayoutRect } from "./tableLayout";

type DealerPositionProps = Readonly<{
  active: boolean;
  cards: readonly ObservedCard[];
  layout: TableLayoutRect;
  onSelect: (target: TableTarget) => void;
  workspaceMode: WorkspaceMode;
}>;

export default function DealerPosition({ active, cards, layout, onSelect, workspaceMode }: DealerPositionProps) {
  const cardRow = calculateCardFan({
    availableHeight: 54,
    availableWidth: layout.width,
    cardCount: cards.length,
  });
  return (
    <div
      className={`table-position dealer-position${active ? " table-position--active" : ""}`}
      data-layout-height={layout.height}
      data-layout-width={layout.width}
      data-layout-x={layout.x}
      data-layout-y={layout.y}
      style={{
        height: layout.height,
        left: layout.x,
        top: layout.y,
        width: layout.width,
      }}
    >
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
      <div
        className="table-card-row"
        data-card-count={cards.length}
        data-card-gap={cardRow.cardGap}
        data-card-width={cardRow.cardWidth}
        aria-label="Dealer observed cards"
        aria-live={workspaceMode === "pro" ? "off" : "polite"}
        style={{
          "--dealer-card-gap": `${cardRow.cardGap}px`,
          "--dealer-card-height": `${cardRow.cardHeight}px`,
          "--dealer-card-width": `${cardRow.cardWidth}px`,
        } as React.CSSProperties}
      >
        {cards.map((card, index) => (
          <PlayingCard card={card} key={`${card.kind}-${index}`} compact workspaceMode={workspaceMode} />
        ))}
      </div>
    </div>
  );
}
