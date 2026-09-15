import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BLACKJACK_VALUE_CLASSES,
  RANKS,
  SUITS,
  blackjackValueClassForRank,
  type BlackjackValueClass,
  type KnownCard,
  type Suit,
  type ValueOnlyCard,
} from "../../domain/card";
import type { TableTarget } from "../../domain/events";
import type { WorkspaceMode } from "../../domain/workspace";
import type { DerivedTableState } from "../../state/selectors";
import { cardAccessibleName, SUIT_SYMBOLS } from "../table/PlayingCard";
import {
  assignmentTargetKey,
  assignmentTargetName,
  navigateAssignmentTarget,
  type AssignmentNavigationDirection,
} from "./assignmentNavigation";

type CardPickerProps = Readonly<{
  activeTarget: TableTarget | null;
  decks: number | null;
  onKnownCard: (target: TableTarget, card: KnownCard) => void;
  onNavigateTarget: (target: TableTarget) => void;
  onUnknownCard: (target: TableTarget) => void;
  onValueCard: (target: TableTarget, card: ValueOnlyCard) => void;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  table: DerivedTableState;
  workspaceMode: WorkspaceMode;
}>;

const SUIT_LABELS: Record<Suit, string> = {
  spades: "Spades",
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
};

const VALUE_NAMES: Record<BlackjackValueClass, string> = {
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten-valued card",
};

function valueButtonAccessibleName(
  value: BlackjackValueClass,
  remaining: number | null,
  hasUnknownObservation: boolean,
): string {
  const quantity = remaining === null
    ? "remaining quantity unavailable"
    : hasUnknownObservation && remaining > 0
      ? `up to ${remaining} remaining; Unknown observations make the exact quantity unresolved`
      : `${remaining} remaining${remaining === 0 ? "; unavailable: value is exhausted for the current shoe" : ""}`;
  const representation = value === "10"
    ? "; represents ten, jack, queen, or king"
    : "";
  return `${VALUE_NAMES[value]}, ${quantity}${representation}`;
}

const CARD_PICKER_RANKS = [...RANKS.slice(1), RANKS[0]];

const PRO_VALUE_BY_KEY: Readonly<Record<string, BlackjackValueClass>> = {
  "0": "10",
  "1": "A",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
};

type AssignmentFeedback = Readonly<{
  message: string;
  targetKey: string | null;
  tone: "error" | "success";
}>;

const PRO_NAVIGATION_BY_KEY: Readonly<Record<string, AssignmentNavigationDirection>> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  ArrowUp: "dealer",
  ArrowDown: "middle-player",
};

function blocksProShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const blocker = target.closest(
    'input, textarea, select, [contenteditable], [role="dialog"]',
  );
  if (!(blocker instanceof HTMLElement)) return blocker !== null;
  return !blocker.hasAttribute("contenteditable") || blocker.contentEditable !== "false";
}

export default function CardPicker({
  activeTarget,
  decks,
  onKnownCard,
  onNavigateTarget,
  onUnknownCard,
  onValueCard,
  onWorkspaceModeChange,
  table,
  workspaceMode,
}: CardPickerProps) {
  const [assignmentFeedback, setAssignmentFeedback] = useState<AssignmentFeedback | null>(null);
  const activeTargetRef = useRef(activeTarget);
  const tableRef = useRef(table);
  activeTargetRef.current = activeTarget;
  tableRef.current = table;
  const observed = useMemo(() => [
      ...table.dealerCards,
      ...table.discardedCards,
      ...Object.values(table.playerHands).flatMap((hands) =>
        hands.flatMap((hand) => hand.cards)
      ),
    ], [table.dealerCards, table.discardedCards, table.playerHands]);
  const targetName = assignmentTargetName(table, activeTarget);
  const validTarget = targetName === null ? null : activeTarget;

  const isUnavailable = (card: KnownCard): boolean => {
    if (decks === null) return false;
    const usedCopies = observed.filter((item) => item.kind === "known" &&
      item.rank === card.rank && item.suit === card.suit).length;
    return usedCopies >= decks;
  };

  const valueRemaining = useCallback((value: BlackjackValueClass): number | null => {
    if (decks === null) return null;
    const capacity = value === "10" ? 16 * decks : 4 * decks;
    const used = observed.filter((card) =>
      card.kind === "value"
        ? card.value === value
        : card.kind === "known" && blackjackValueClassForRank(card.rank) === value
    ).length;
    return Math.max(0, capacity - used);
  }, [decks, observed]);

  const proMode = workspaceMode === "pro";
  const hasUnknownObservation = observed.some((card) => card.kind === "unknown");

  const assignProValue = useCallback((value: BlackjackValueClass): boolean => {
    if (!proMode) return false;
    const latestTarget = activeTargetRef.current;
    const latestTargetName = assignmentTargetName(tableRef.current, latestTarget);
    if (!latestTarget || latestTargetName === null) {
      setAssignmentFeedback({
        message: `${value} cannot be added — select the dealer or a player hand first.`,
        targetKey: assignmentTargetKey(latestTarget),
        tone: "error",
      });
      return false;
    }
    if (valueRemaining(value) === 0) {
      setAssignmentFeedback({
        message: `${value} cannot be added — unavailable for the current shoe.`,
        targetKey: assignmentTargetKey(latestTarget),
        tone: "error",
      });
      return false;
    }
    onValueCard(latestTarget, { kind: "value", value });
    setAssignmentFeedback({
      message: `${value} assigned to ${latestTargetName}.`,
      targetKey: assignmentTargetKey(latestTarget),
      tone: "success",
    });
    return true;
  }, [onValueCard, proMode, valueRemaining]);

  const navigateProTarget = useCallback((direction: AssignmentNavigationDirection) => {
    if (!proMode) return;
    const latestTarget = activeTargetRef.current;
    const nextTarget = navigateAssignmentTarget(
      tableRef.current,
      latestTarget,
      direction,
    );
    if (!nextTarget) {
      setAssignmentFeedback({
        message: direction === "middle-player"
          ? "No occupied player target is available."
          : "No adjacent assignment target is available.",
        targetKey: assignmentTargetKey(latestTarget),
        tone: "error",
      });
      return;
    }
    activeTargetRef.current = nextTarget;
    onNavigateTarget(nextTarget);
    setAssignmentFeedback({
      message: `Active target: ${assignmentTargetName(tableRef.current, nextTarget)}.`,
      targetKey: assignmentTargetKey(nextTarget),
      tone: "success",
    });
  }, [onNavigateTarget, proMode]);

  useEffect(() => {
    setAssignmentFeedback((feedback) =>
      feedback?.targetKey === assignmentTargetKey(activeTarget) ? feedback : null
    );
  }, [activeTarget]);

  useEffect(() => {
    setAssignmentFeedback(null);
  }, [workspaceMode]);

  useEffect(() => {
    if (!proMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || blocksProShortcut(event.target)) {
        return;
      }
      const direction = PRO_NAVIGATION_BY_KEY[event.key];
      if (direction !== undefined) {
        event.preventDefault();
        navigateProTarget(direction);
        return;
      }
      const value = PRO_VALUE_BY_KEY[event.key];
      if (value === undefined) return;
      event.preventDefault();
      assignProValue(value);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [assignProValue, navigateProTarget, proMode]);

  return (
    <section className="workspace-panel card-picker" aria-labelledby="card-picker-title">
      <div className="workspace-panel__heading">
        <div>
          <p className="eyebrow">Direct observation</p>
          <h2 id="card-picker-title">Card Assignment</h2>
        </div>
        <span className="panel-icon" aria-hidden="true">♠</span>
      </div>
      <div className="workspace-mode-control">
        <strong>Pro Mode</strong>
        <button
          type="button"
          role="switch"
          aria-label="Pro Mode"
          aria-checked={proMode}
          className="workspace-mode-switch"
          onClick={() => onWorkspaceModeChange(proMode ? "normal" : "pro")}
        >
          <span>{proMode ? "ON" : "OFF"}</span>
          <i aria-hidden="true" />
        </button>
      </div>
      <p id="assignment-prompt" className="assignment-prompt" role="status" aria-live={proMode ? "off" : "polite"} aria-atomic="true">
        {targetName
          ? <>Assigning to: <strong>{targetName}</strong></>
          : "Select the dealer or an occupied player first, then choose a hand."}
      </p>

      {proMode ? (
        <div className="pro-picker-content">
          <p className="pro-picker-explanation">
            Pro Mode uses card values only.<br />
            Exact probabilities and counting systems remain unchanged.
          </p>
          <div className="value-card-grid" aria-label="Card values">
            {BLACKJACK_VALUE_CLASSES.map((value) => {
              const remaining = valueRemaining(value);
              const exhausted = remaining === 0;
              const label = valueButtonAccessibleName(
                value,
                remaining,
                hasUnknownObservation && !exhausted,
              );
              return (
                <button
                  type="button"
                  className="value-card-button"
                  disabled={!validTarget || exhausted}
                  key={value}
                  aria-label={label}
                  aria-describedby={!validTarget
                    ? "assignment-prompt"
                    : exhausted
                      ? "value-picker-note"
                      : value === "10"
                        ? "ten-value-note"
                        : undefined}
                  onClick={() => assignProValue(value)}
                >
                  <strong aria-hidden="true">{value}</strong>
                  {remaining !== null && <span aria-hidden="true">
                    {hasUnknownObservation && !exhausted ? "≤" : "×"}{remaining}
                  </span>}
                </button>
              );
            })}
          </div>
          <p id="ten-value-note" className="ten-value-note">10 = 10/J/Q/K</p>
          <p id="value-picker-note" className="picker-note">
            {decks === null
              ? "Deck count is unknown, so no fixed remaining quantities are shown. Python validation remains authoritative."
              : hasUnknownObservation
                ? "Unknown observations make exact value quantities unresolved; shown quantities are upper bounds. Python validation remains authoritative."
              : "Counts use confirmed exact and value-only observations. Python validation remains authoritative."}
          </p>
          <p
            className={`assignment-feedback${assignmentFeedback?.tone === "error" ? " assignment-feedback--error" : ""}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {assignmentFeedback?.message ?? ""}
          </p>
          <div className="shortcut-placeholder" aria-label="Keyboard shortcuts">
            <strong>Keyboard shortcuts</strong>
            <ul>
              <li><kbd>1</kbd><span>= A</span></li>
              <li><kbd>2–9</kbd><span>= 2–9</span></li>
              <li><kbd>0</kbd><span>= 10 (10/J/Q/K)</span></li>
              <li><kbd>← / →</kbd><span>Move between occupied player/split-hand targets</span></li>
              <li><kbd>↑</kbd><span>Dealer</span></li>
              <li><kbd>↓</kbd><span>Middle-lower occupied player</span></li>
            </ul>
          </div>
        </div>
      ) : <>
        <div className="card-inventory" aria-label="All 52 cards">
          {SUITS.map((suit) => (
            <section
              className={`suit-group suit-group--${suit}`}
              key={suit}
              aria-labelledby={`suit-${suit}`}
            >
              <h3 id={`suit-${suit}`}>{SUIT_SYMBOLS[suit]} {SUIT_LABELS[suit]}</h3>
              <div className="picker-card-grid">
                {CARD_PICKER_RANKS.map((rank, index) => {
                  const card = { kind: "known", rank, suit } as const;
                  const unavailable = isUnavailable(card);
                  return (
                    <button
                      type="button"
                      className={`picker-card picker-card--${suit}${index === 6 ? " picker-card--row-break" : ""}`}
                      disabled={!activeTarget || unavailable}
                      key={`${rank}-${suit}`}
                      aria-label={`${cardAccessibleName(rank, suit)}${unavailable ? ", unavailable: all configured copies are already observed" : ""}`}
                      aria-describedby={!activeTarget ? "assignment-prompt" : unavailable ? "card-picker-note" : undefined}
                      onClick={() => activeTarget && onKnownCard(activeTarget, card)}
                    >
                      <span>{rank}</span>
                      <span aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="unknown-card-control">
          <button
            type="button"
            className="unknown-card-button"
            disabled={!activeTarget}
            aria-label="Assign unknown card"
            aria-describedby={!activeTarget ? "assignment-prompt" : undefined}
            onClick={() => activeTarget && onUnknownCard(activeTarget)}
          >
            <strong aria-hidden="true">?</strong>
            <span>Unknown</span>
          </button>
        </div>
        <p id="card-picker-note" className="picker-note">
          Used copies are disabled for known deck counts. Python validation remains authoritative.
        </p>
      </>}
    </section>
  );
}
