export type CardFanLayout = Readonly<{
  cardGap: number;
  cardHeight: number;
  cardWidth: number;
  cardStep: number;
  readable: boolean;
  visualWidth: number;
}>;

type CardFanInput = Readonly<{
  availableHeight: number;
  availableWidth: number;
  cardCount: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

// "10" is the widest compact marker. At the table font size, 30px leaves
// room for both glyphs, card padding, and borders without turning the card
// into a token-sized strip.
export const CARD_MIN_READABLE_WIDTH = 30;
export const CARD_PREFERRED_WIDTH = 38;
export const CARD_PREFERRED_GAP = 3;

export function preferredCardRowWidth(cardCount: number): number {
  const count = Math.max(0, Math.floor(cardCount));
  if (count === 0) return 0;
  return CARD_PREFERRED_WIDTH * count + CARD_PREFERRED_GAP * (count - 1);
}

export function minimumReadableCardRowWidth(cardCount: number): number {
  const count = Math.max(0, Math.floor(cardCount));
  if (count === 0) return 0;
  return CARD_MIN_READABLE_WIDTH * count + CARD_PREFERRED_GAP * (count - 1);
}

/**
 * Derives a centered, non-overlapping card row inside one P8 hand rectangle.
 * P8 normally reserves preferredCardRowWidth(). When a dense layout has
 * less room, card width compresses before the positive gap is removed; cards
 * never cover one another.
 */
export function calculateCardFan({
  availableHeight,
  availableWidth,
  cardCount,
}: CardFanInput): CardFanLayout {
  const count = Math.max(0, Math.floor(cardCount));
  const width = Math.max(1, availableWidth);
  const cardHeight = clamp(availableHeight, 30, 50);
  const naturalCardWidth = Math.min(
    CARD_PREFERRED_WIDTH,
    Math.max(CARD_MIN_READABLE_WIDTH, cardHeight * 0.76),
  );
  if (count === 0) {
    return {
      cardGap: 0,
      cardHeight,
      cardStep: 0,
      cardWidth: 0,
      readable: true,
      visualWidth: 0,
    };
  }

  const cardGap = count === 1 ? 0 : Math.min(
    CARD_PREFERRED_GAP,
    Math.max(0, (width - count) / (count - 1)),
  );
  const cardWidth = Math.min(
    naturalCardWidth,
    Math.max(0, (width - cardGap * (count - 1)) / count),
  );
  const cardStep = count === 1 ? 0 : cardWidth + cardGap;
  const visualWidth = cardWidth * count + cardGap * (count - 1);
  return {
    cardGap,
    cardHeight,
    cardStep,
    cardWidth,
    readable: cardWidth >= CARD_MIN_READABLE_WIDTH,
    visualWidth,
  };
}
