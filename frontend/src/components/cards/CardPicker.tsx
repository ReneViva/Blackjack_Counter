import { useState } from "react";

import {
  RANKS,
  SUITS,
  type KnownCard,
  type Rank,
  type Suit,
} from "../../domain/card";
import type { SeatNumber } from "../../domain/game";
import type { TableTarget } from "../../domain/events";

type CardPickerProps = Readonly<{
  activeSeats: readonly SeatNumber[];
  onKnownCard: (target: TableTarget, card: KnownCard) => void;
  onUnknownCard: (target: TableTarget) => void;
}>;

function targetValue(target: TableTarget): string {
  return target.kind === "dealer" ? "dealer" : `player-${target.seat}`;
}

function parseTarget(value: string): TableTarget {
  if (value === "dealer") {
    return { kind: "dealer" };
  }

  return {
    kind: "player",
    seat: Number(value.replace("player-", "")) as SeatNumber,
  };
}

export default function CardPicker({
  activeSeats,
  onKnownCard,
  onUnknownCard,
}: CardPickerProps) {
  const [target, setTarget] = useState<TableTarget>({ kind: "dealer" });
  const [rank, setRank] = useState<Rank>("A");
  const [suit, setSuit] = useState<Suit>("spades");

  return (
    <section className="panel card-picker" aria-labelledby="card-picker-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Observation input</p>
          <h2 id="card-picker-title">Add a card</h2>
        </div>
        <p>Record what was observed; Python remains authoritative.</p>
      </div>

      <div className="control-grid control-grid--cards">
        <label>
          Target
          <select
            aria-label="Card target"
            value={targetValue(target)}
            onChange={(event) => setTarget(parseTarget(event.target.value))}
          >
            <option value="dealer">Dealer</option>
            {activeSeats.map((seat) => (
              <option key={seat} value={`player-${seat}`}>
                Player seat {seat}
              </option>
            ))}
          </select>
        </label>

        <label>
          Rank
          <select
            aria-label="Card rank"
            value={rank}
            onChange={(event) => setRank(event.target.value as Rank)}
          >
            {RANKS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Suit
          <select
            aria-label="Card suit"
            value={suit}
            onChange={(event) => setSuit(event.target.value as Suit)}
          >
            {SUITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="button-row">
        <button
          type="button"
          onClick={() => onKnownCard(target, { kind: "known", rank, suit })}
        >
          Add known card
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => onUnknownCard(target)}
        >
          Add unknown card
        </button>
      </div>
    </section>
  );
}
