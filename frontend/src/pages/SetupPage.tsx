import { DECK_COUNTS, type DeckCount } from "../domain/rules";
import {
  SEAT_NUMBERS,
  type SeatNumber,
  type SessionConfiguration,
} from "../domain/game";

type SetupPageProps = Readonly<{
  configuration: SessionConfiguration;
  onChange: (configuration: SessionConfiguration) => void;
  onStart: () => void;
}>;

export default function SetupPage({
  configuration,
  onChange,
  onStart,
}: SetupPageProps) {
  const updateSeatCount = (count: number) => {
    const activeSeats = SEAT_NUMBERS.slice(0, count);
    const userSeat =
      configuration.userSeat !== null &&
      activeSeats.includes(configuration.userSeat)
        ? configuration.userSeat
        : activeSeats[0];
    onChange({ ...configuration, activeSeats, userSeat });
  };

  return (
    <section className="panel setup-page" aria-labelledby="setup-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Session setup</p>
          <h2 id="setup-title">Configure the observed table</h2>
        </div>
        <p>Unknown assumptions stay explicit.</p>
      </div>

      <div className="control-grid">
        <label>
          Deck count
          <select
            value={configuration.rules.decks ?? "unknown"}
            onChange={(event) =>
              onChange({
                ...configuration,
                rules: {
                  ...configuration.rules,
                  decks:
                    event.target.value === "unknown"
                      ? null
                      : (Number(event.target.value) as DeckCount),
                },
              })
            }
          >
            <option value="unknown">Unknown</option>
            {DECK_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>

        <label>
          Active player seats
          <select
            value={configuration.activeSeats.length}
            onChange={(event) => updateSeatCount(Number(event.target.value))}
          >
            {SEAT_NUMBERS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>

        <label>
          Your seat
          <select
            value={configuration.userSeat ?? "none"}
            onChange={(event) =>
              onChange({
                ...configuration,
                userSeat:
                  event.target.value === "none"
                    ? null
                    : (Number(event.target.value) as SeatNumber),
              })
            }
          >
            <option value="none">No selected user seat</option>
            {configuration.activeSeats.map((seat) => (
              <option key={seat} value={seat}>
                Player seat {seat}
              </option>
            ))}
          </select>
        </label>

        <label>
          Dealer soft 17
          <select
            value={configuration.rules.dealerSoft17}
            onChange={(event) =>
              onChange({
                ...configuration,
                rules: {
                  ...configuration.rules,
                  dealerSoft17: event.target.value as "hit" | "stand",
                },
              })
            }
          >
            <option value="stand">Stand</option>
            <option value="hit">Hit</option>
          </select>
        </label>
      </div>

      <button className="button-primary" type="button" onClick={onStart}>
        Start new shoe
      </button>
    </section>
  );
}
