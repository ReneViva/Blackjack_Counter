from app.domain import ALL_CARDS, Rank, Shoe
from app.probability import possible_draws


def test_compact_rank_draw_scan_matches_independent_physical_composition() -> None:
    counts = tuple(
        0 if index % 5 == 0 else (index % 3) + 1
        for index in range(len(ALL_CARDS))
    )
    shoe = Shoe(decks=3, card_counts=counts)

    draws = possible_draws(shoe)
    expected = {
        rank: sum(
            count
            for card, count in shoe.composition
            if card.rank is rank
        )
        for rank in Rank
    }

    assert {draw.rank: draw.count for draw in draws} == expected
    assert all(draw.card.rank is draw.rank for draw in draws)
    assert all(shoe.count(draw.card) > 0 for draw in draws)
    assert sum(draw.count for draw in draws) == shoe.exact_total
    assert sum(draw.probability for draw in draws) == 1.0
