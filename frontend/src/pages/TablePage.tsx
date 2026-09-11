import type { Dispatch } from "react";

import CardPicker from "../components/cards/CardPicker";
import BlackjackTable from "../components/table/BlackjackTable";
import EventHistory from "../components/table/EventHistory";
import ShoeStatus from "../components/table/ShoeStatus";
import type { SessionAction } from "../domain/events";
import type { SessionState } from "../state/gameReducer";
import { selectTableState } from "../state/selectors";

type TablePageProps = Readonly<{
  dispatch: Dispatch<SessionAction>;
  state: SessionState;
}>;

export default function TablePage({ dispatch, state }: TablePageProps) {
  const table = selectTableState(state);

  return (
    <div className="table-page">
      <ShoeStatus state={state} />

      <BlackjackTable
        activeSeats={state.configuration.activeSeats}
        table={table}
        userSeat={state.configuration.userSeat}
      />

      <CardPicker
        activeSeats={state.configuration.activeSeats}
        onKnownCard={(target, card) =>
          dispatch({ type: "DEAL_KNOWN_CARD", target, card })
        }
        onUnknownCard={(target) =>
          dispatch({ type: "DEAL_UNKNOWN_CARD", target })
        }
      />

      <div className="button-row session-actions" aria-label="Session actions">
        <button
          className="button-secondary"
          type="button"
          onClick={() => dispatch({ type: "UNDO" })}
        >
          Undo last event
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => dispatch({ type: "ROUND_COMPLETE" })}
        >
          Mark round complete
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => dispatch({ type: "SHUFFLE" })}
        >
          Record shuffle
        </button>
        <button
          className="button-danger"
          type="button"
          onClick={() => dispatch({ type: "RESET" })}
        >
          Reset session
        </button>
      </div>

      <EventHistory events={state.events} />
    </div>
  );
}
