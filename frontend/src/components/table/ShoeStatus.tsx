import type { SessionState } from "../../state/gameReducer";
import {
  selectObservedCardCount,
  selectUnknownCardCount,
} from "../../state/selectors";

type ShoeStatusProps = Readonly<{
  state: SessionState;
}>;

export default function ShoeStatus({ state }: ShoeStatusProps) {
  const observed = selectObservedCardCount(state);
  const unknown = selectUnknownCardCount(state);
  const decks = state.configuration.rules.decks;

  return (
    <dl className="shoe-status" aria-label="Session observation summary">
      <div>
        <dt>Deck configuration</dt>
        <dd>{decks === null ? "Unknown" : `${decks} deck${decks === 1 ? "" : "s"}`}</dd>
      </div>
      <div>
        <dt>Initial cards</dt>
        <dd>{decks === null ? "Unknown" : decks * 52}</dd>
      </div>
      <div>
        <dt>Known observations</dt>
        <dd>{observed - unknown}</dd>
      </div>
      <div>
        <dt>Unknown observations</dt>
        <dd>{unknown}</dd>
      </div>
    </dl>
  );
}
