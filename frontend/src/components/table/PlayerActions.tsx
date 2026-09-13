import type { LegalAction } from "../../api/playerActions";
import type { TableTarget } from "../../domain/events";

type PlayerActionsProps = Readonly<{
  target: Extract<TableTarget, { kind: "player-hand" }>;
  split: LegalAction | null;
  loading: boolean;
  onSplit: () => void;
  onLeave: () => void;
}>;

export default function PlayerActions({
  target,
  split,
  loading,
  onSplit,
  onLeave,
}: PlayerActionsProps) {
  const reasonId = `split-reason-${target.seat}-${target.handId}`;
  const reason = loading
    ? "Checking split eligibility with Python."
    : split?.reason ?? (
        split?.allowed ? "Python confirmed this split is legal." :
          "Python split eligibility is unavailable."
      );

  return (
    <section className="player-actions" aria-labelledby="player-actions-title">
      <div>
        <p className="eyebrow">Player actions</p>
        <h3 id="player-actions-title">Seat {target.seat}</h3>
      </div>
      <div className="player-actions__commands">
        <button
          type="button"
          className="button-secondary"
          disabled={loading || !split?.allowed}
          aria-describedby={reasonId}
          onClick={onSplit}
        >
          Split
        </button>
        <button
          type="button"
          className="button-danger"
          aria-label={`Leave Seat ${target.seat}`}
          onClick={onLeave}
        >
          Leave Seat
        </button>
      </div>
      <p id={reasonId} className="player-action-reason" role="status">
        {reason}
      </p>
    </section>
  );
}
