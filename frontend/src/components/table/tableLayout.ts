import { SEAT_NUMBERS, type SeatNumber } from "../../domain/game";
import type { WorkspaceMode } from "../../domain/workspace";
import {
  CARD_MIN_READABLE_WIDTH,
  calculateCardFan,
  minimumReadableCardRowWidth,
  preferredCardRowWidth,
} from "./cardFan";

export const MIN_DESKTOP_TABLE_SIZE = Object.freeze({
  width: 34 * 16,
  height: 35 * 16,
});

export type TableLayoutRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type TableLayoutHandInput = Readonly<{
  cardCount: number;
  handId: string;
}>;

export type TableLayoutSeatInput = Readonly<{
  hands: readonly TableLayoutHandInput[];
  occupied: boolean;
  seat: SeatNumber;
}>;

export type TableHandLayout = Readonly<{
  cardGap: number;
  cardHeight: number;
  cardVisualWidth: number;
  cardWidth: number;
  handId: string;
  rect: TableLayoutRect;
}>;

export type TableSeatLayout = Readonly<{
  columns: number;
  gap: number;
  hands: readonly TableHandLayout[];
  occupied: boolean;
  rect: TableLayoutRect;
  seat: SeatNumber;
}>;

export type BlackjackTableLayout = Readonly<{
  bounds: TableLayoutRect;
  dealer: TableLayoutRect;
  mode: WorkspaceMode;
  seats: Readonly<Record<SeatNumber, TableSeatLayout>>;
}>;

export type BlackjackTableLayoutInput = Readonly<{
  dealerCardCount: number;
  height: number;
  mode: WorkspaceMode;
  seats: readonly TableLayoutSeatInput[];
  width: number;
}>;

type SeatZone = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

const PREFERRED_HAND_WIDTH = 64;
const PREFERRED_HAND_HEIGHT = 72;
const PREFERRED_LABEL_HEIGHT = 60;
const HAND_LABEL_GAP = 4;
const HAND_HORIZONTAL_CARD_PADDING = 4;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function centeredRect(zone: SeatZone, width: number, height: number): TableLayoutRect {
  return {
    x: zone.x + (zone.width - width) / 2,
    y: zone.y + (zone.height - height) / 2,
    width,
    height,
  };
}

function seatZones(
  width: number,
  height: number,
  dealer: TableLayoutRect,
  padding: number,
  zoneGap: number,
): Readonly<Record<SeatNumber, SeatZone>> {
  const upperBottom = height * 0.325;
  const middleTop = height * 0.35;
  const bottomTop = height * 0.67;
  const sideWidth = Math.max(1, dealer.x - zoneGap - padding);
  const sideHeight = Math.max(1, upperBottom - padding);
  const middleHeight = Math.max(1, bottomTop - zoneGap - middleTop);
  const rightX = dealer.x + dealer.width + zoneGap;
  const bottomWidth = Math.max(1, width - 2 * padding);
  const bottomColumnGap = zoneGap;
  const bottomColumnWidth = Math.max(
    1,
    (bottomWidth - 2 * bottomColumnGap) / 3,
  );
  const bottomHeight = Math.max(1, height - padding - bottomTop);

  return {
    1: { x: padding, y: padding, width: sideWidth, height: sideHeight },
    2: { x: padding, y: middleTop, width: sideWidth, height: middleHeight },
    3: { x: padding, y: bottomTop, width: bottomColumnWidth, height: bottomHeight },
    4: {
      x: padding + bottomColumnWidth + bottomColumnGap,
      y: bottomTop,
      width: bottomColumnWidth,
      height: bottomHeight,
    },
    5: {
      x: padding + 2 * (bottomColumnWidth + bottomColumnGap),
      y: bottomTop,
      width: bottomColumnWidth,
      height: bottomHeight,
    },
    6: { x: rightX, y: middleTop, width: sideWidth, height: middleHeight },
    7: { x: rightX, y: padding, width: sideWidth, height: sideHeight },
  };
}

type Packing = Readonly<{
  columns: number;
  gap: number;
  handHeight: number;
  handWidth: number;
  labelHeight: number;
  rows: number;
}>;

function choosePacking(
  zone: SeatZone,
  hands: readonly TableLayoutHandInput[],
  gap: number,
): Packing {
  const handCount = hands.length;
  const labelHeight = Math.min(PREFERRED_LABEL_HEIGHT, zone.height);
  const preferredHandWidth = Math.max(
    PREFERRED_HAND_WIDTH,
    ...hands.map((hand) =>
      preferredCardRowWidth(hand.cardCount) + HAND_HORIZONTAL_CARD_PADDING
    ),
  );
  let best: Packing | null = null;
  let bestIsReadable = false;
  let bestScale = -1;

  for (let columns = 1; columns <= handCount; columns += 1) {
    const rows = Math.ceil(handCount / columns);
    const availableWidth = (
      zone.width - gap * (columns - 1)
    ) / columns;
    const availableHeight = (
      zone.height - labelHeight - HAND_LABEL_GAP - gap * (rows - 1)
    ) / rows;
    const widthScale = Math.max(0, Math.min(1, availableWidth / preferredHandWidth));
    const heightScale = Math.max(0, Math.min(1, availableHeight / PREFERRED_HAND_HEIGHT));
    const scale = Math.min(widthScale, heightScale);
    const candidate = {
      columns,
      gap,
      handWidth: preferredHandWidth * widthScale,
      handHeight: PREFERRED_HAND_HEIGHT * heightScale,
      labelHeight,
      rows,
    };
    const isReadable = hands.every((hand) => (
      candidate.handWidth >= minimumReadableCardRowWidth(hand.cardCount) +
        HAND_HORIZONTAL_CARD_PADDING &&
      candidate.handHeight >= CARD_MIN_READABLE_WIDTH + 20
    ));
    const sameScale = Math.abs(scale - bestScale) < 0.0001;
    const preferableShape = sameScale && best !== null && (
      rows < best.rows || (rows === best.rows && columns < best.columns)
    );
    if (
      (isReadable && !bestIsReadable) ||
      (isReadable === bestIsReadable && (scale > bestScale + 0.0001 || preferableShape))
    ) {
      best = candidate;
      bestIsReadable = isReadable;
      bestScale = scale;
    }
  }

  return best ?? {
    columns: 1,
    gap,
    handWidth: 0,
    handHeight: 0,
    labelHeight,
    rows: 0,
  };
}

function emptySeatLayout(seat: SeatNumber, zone: SeatZone): TableSeatLayout {
  const width = Math.min(94, zone.width);
  const height = Math.min(84, zone.height);
  return {
    columns: 0,
    gap: 0,
    hands: [],
    occupied: false,
    rect: centeredRect(zone, width, height),
    seat,
  };
}

function occupiedSeatLayout(
  seat: SeatNumber,
  zone: SeatZone,
  hands: readonly TableLayoutHandInput[],
  gap: number,
): TableSeatLayout {
  if (hands.length === 0) {
    const width = Math.min(94, zone.width);
    const height = Math.min(PREFERRED_LABEL_HEIGHT, zone.height);
    return {
      columns: 0,
      gap,
      hands: [],
      occupied: true,
      rect: centeredRect(zone, width, height),
      seat,
    };
  }

  const packing = choosePacking(zone, hands, gap);
  const groupWidth = packing.columns * packing.handWidth +
    (packing.columns - 1) * gap;
  const handAreaHeight = packing.rows * packing.handHeight +
    (packing.rows - 1) * gap;
  const groupHeight = handAreaHeight + HAND_LABEL_GAP + packing.labelHeight;
  const rect = centeredRect(zone, groupWidth, groupHeight);
  const handLayouts = hands.map((hand, index) => {
    const row = Math.floor(index / packing.columns);
    const column = index % packing.columns;
    const rowStart = row * packing.columns;
    const rowCount = Math.min(packing.columns, hands.length - rowStart);
    const rowWidth = rowCount * packing.handWidth + (rowCount - 1) * gap;
    const rowOffset = (groupWidth - rowWidth) / 2;
    const handRect = {
      x: rect.x + rowOffset + column * (packing.handWidth + gap),
      y: rect.y + row * (packing.handHeight + gap),
      width: packing.handWidth,
      height: packing.handHeight,
    };
    const fan = calculateCardFan({
      availableHeight: packing.handHeight - 20,
      availableWidth: Math.max(20, packing.handWidth - HAND_HORIZONTAL_CARD_PADDING),
      cardCount: hand.cardCount,
    });
    return {
      cardGap: fan.cardGap,
      cardHeight: fan.cardHeight,
      cardVisualWidth: fan.visualWidth,
      cardWidth: fan.cardWidth,
      handId: hand.handId,
      rect: handRect,
    };
  });

  return {
    columns: packing.columns,
    gap,
    hands: handLayouts,
    occupied: true,
    rect,
    seat,
  };
}

export function calculateBlackjackTableLayout({
  dealerCardCount,
  height: rawHeight,
  mode,
  seats,
  width: rawWidth,
}: BlackjackTableLayoutInput): BlackjackTableLayout {
  const width = finiteDimension(rawWidth);
  const height = finiteDimension(rawHeight);
  const padding = clamp(Math.min(width, height) * 0.022, 10, 18);
  const zoneGap = clamp(width * 0.015, 8, 14);
  const dealerWidth = Math.min(
    width - 2 * padding,
    Math.max(
      clamp(width * 0.27, 148, 210),
      preferredCardRowWidth(dealerCardCount),
    ),
  );
  const dealerHeight = clamp(height * 0.235, 124, 148);
  const dealer = {
    x: (width - dealerWidth) / 2,
    y: padding,
    width: dealerWidth,
    height: dealerHeight,
  };
  const zones = seatZones(width, height, dealer, padding, zoneGap);
  const inputs = new Map(seats.map((seat) => [seat.seat, seat]));
  const seatLayouts = {} as Record<SeatNumber, TableSeatLayout>;

  for (const seat of SEAT_NUMBERS) {
    const input = inputs.get(seat);
    seatLayouts[seat] = input?.occupied
      ? occupiedSeatLayout(seat, zones[seat], input.hands, Math.max(3, zoneGap / 2))
      : emptySeatLayout(seat, zones[seat]);
  }

  return {
    bounds: { x: 0, y: 0, width, height },
    dealer,
    mode,
    seats: seatLayouts,
  };
}
