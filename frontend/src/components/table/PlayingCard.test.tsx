import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PlayingCard from "./PlayingCard";

describe("workspace-mode card presentation", () => {
  it.each([
    [{ kind: "known", rank: "Q", suit: "hearts" } as const, "10", "Queen of hearts"],
    [{ kind: "known", rank: "K", suit: "clubs" } as const, "10", "King of clubs"],
    [{ kind: "known", rank: "A", suit: "spades" } as const, "A", "Ace of spades"],
    [{ kind: "known", rank: "7", suit: "diamonds" } as const, "7", "Seven of diamonds"],
  ])("projects exact %s to its blackjack value without losing accessible identity", (card, value, identity) => {
    const { rerender } = render(<PlayingCard card={card} />);
    expect(screen.getByRole("img", { name: identity })).toBeVisible();

    rerender(<PlayingCard card={card} workspaceMode="pro" />);
    const projected = screen.getByRole("img", {
      name: `${value} value card (exact ${identity})`,
    });
    expect(projected).toHaveTextContent(value);

    rerender(<PlayingCard card={card} workspaceMode="normal" />);
    expect(screen.getByRole("img", { name: identity })).toBeVisible();
  });

  it("keeps value-only and Unknown observations unchanged in both modes", () => {
    const { rerender } = render(
      <PlayingCard card={{ kind: "value", value: "10" }} />,
    );
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();

    rerender(<PlayingCard card={{ kind: "value", value: "10" }} workspaceMode="pro" />);
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();

    rerender(<PlayingCard card={{ kind: "unknown" }} workspaceMode="pro" />);
    expect(screen.getByRole("img", { name: "Unknown card" })).toHaveTextContent("?");
  });
});
