import {
  DECK_COUNTS,
  type DealerBlackjackCheckRule,
  type DealerSecondCardRule,
  type DeckCount,
  type SessionRules,
  type SurrenderRule,
} from "../domain/rules";
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
  const updateRules = (changes: Partial<SessionRules>) =>
    onChange({
      ...configuration,
      rules: { ...configuration.rules, ...changes },
    });

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
              updateRules({
                decks:
                  event.target.value === "unknown"
                    ? null
                    : (Number(event.target.value) as DeckCount),
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
              updateRules({
                dealerSoft17: event.target.value as "hit" | "stand",
              })
            }
          >
            <option value="stand">Stand</option>
            <option value="hit">Hit</option>
          </select>
        </label>

        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={configuration.rules.splittingEnabled}
            onChange={(event) =>
              updateRules({
                splittingEnabled: event.target.checked,
                maxSplitHands:
                  event.target.checked &&
                  configuration.rules.maxSplitHands === 1
                    ? 2
                    : configuration.rules.maxSplitHands,
              })
            }
          />
          Splitting enabled
        </label>

        <label>
          Maximum split hands
          <select
            value={configuration.rules.maxSplitHands}
            onChange={(event) =>
              updateRules({
                maxSplitHands: Number(event.target.value) as 1 | 2 | 3 | 4,
              })
            }
          >
            {[1, 2, 3, 4].map((count) => (
              <option
                key={count}
                value={count}
                disabled={configuration.rules.splittingEnabled && count === 1}
              >
                {count}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={configuration.rules.resplitAces}
            onChange={(event) => updateRules({ resplitAces: event.target.checked })}
          />
          Resplit Aces
        </label>

        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={configuration.rules.hitSplitAces}
            onChange={(event) => updateRules({ hitSplitAces: event.target.checked })}
          />
          Hit split Aces
        </label>

        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={configuration.rules.blackjackAfterSplit}
            onChange={(event) =>
              updateRules({ blackjackAfterSplit: event.target.checked })
            }
          />
          Blackjack after split
        </label>

        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={configuration.rules.doublingEnabled}
            onChange={(event) =>
              updateRules({ doublingEnabled: event.target.checked })
            }
          />
          Doubling enabled
        </label>

        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={configuration.rules.doubleAfterSplit}
            onChange={(event) =>
              updateRules({ doubleAfterSplit: event.target.checked })
            }
          />
          Double after split
        </label>

        <label>
          Surrender
          <select
            value={configuration.rules.surrender}
            onChange={(event) =>
              updateRules({ surrender: event.target.value as SurrenderRule })
            }
          >
            <option value="none">None</option>
            <option value="late">Late</option>
          </select>
        </label>

        <label>
          Dealer second card
          <select
            value={configuration.rules.dealerSecondCard}
            onChange={(event) => {
              const dealerSecondCard = event.target
                .value as DealerSecondCardRule;
              updateRules({
                dealerSecondCard,
                dealerBlackjackCheck:
                  dealerSecondCard === "no_hole_card"
                    ? "no_peek"
                    : configuration.rules.dealerBlackjackCheck,
              });
            }}
          >
            <option value="hole_card">Hole card</option>
            <option value="no_hole_card">No hole card</option>
          </select>
        </label>

        <label>
          Dealer blackjack check
          <select
            value={configuration.rules.dealerBlackjackCheck}
            onChange={(event) =>
              updateRules({
                dealerBlackjackCheck: event.target
                  .value as DealerBlackjackCheckRule,
              })
            }
            disabled={configuration.rules.dealerSecondCard === "no_hole_card"}
          >
            <option value="no_peek">No peek</option>
            <option value="peek">Peek</option>
          </select>
        </label>
      </div>

      <button className="button-primary" type="button" onClick={onStart}>
        Start new shoe
      </button>
    </section>
  );
}
