import type { GameEvent } from "../../domain/events";

type EventHistoryProps = Readonly<{
  events: readonly GameEvent[];
}>;

function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case "NEW_SHOE":
      return "New shoe started";
    case "PLAYER_ADDED":
      return `Player added at seat ${event.seat}`;
    case "PLAYER_HAND_SPLIT":
      return `Seat ${event.seat} split ${event.sourceHandId} into two hands`;
    case "PLAYER_LEFT":
      return `Player left seat ${event.seat}`;
    case "DEAL_KNOWN_CARD": {
      const target =
        event.target.kind === "dealer"
          ? "Dealer"
          : event.target.kind === "player-hand"
            ? `Player seat ${event.target.seat}, hand ${event.target.handId}`
            : `Player seat ${event.target.seat}`;
      return `${target} observed ${event.card.rank} of ${event.card.suit}`;
    }
    case "DEAL_UNKNOWN_CARD":
      return event.target.kind === "dealer"
        ? "Dealer observed an unknown card"
        : event.target.kind === "player-hand"
          ? `Player seat ${event.target.seat}, hand ${event.target.handId} observed an unknown card`
          : `Player seat ${event.target.seat} observed an unknown card`;
    case "ROUND_COMPLETE":
      return "Round marked complete";
    case "SHUFFLE":
      return "Shoe shuffled";
  }
}

export default function EventHistory({ events }: EventHistoryProps) {
  return (
    <section className="panel event-history" aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Chronology</p>
          <h2 id="history-title">Event history</h2>
        </div>
        <span>{events.length} events</span>
      </div>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <span>{event.sequence}</span>
            {describeEvent(event)}
          </li>
        ))}
      </ol>
    </section>
  );
}
