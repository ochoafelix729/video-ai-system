from backend.contracts import CoverageInterval
from backend.database import merge_coverage


def test_merge_coverage_combines_touching_ranges() -> None:
    merged = merge_coverage(
        [
            CoverageInterval(start_seconds=61, end_seconds=120),
            CoverageInterval(start_seconds=0, end_seconds=60),
            CoverageInterval(start_seconds=200, end_seconds=210),
        ]
    )
    assert [(value.start_seconds, value.end_seconds) for value in merged] == [
        (0, 120),
        (200, 210),
    ]
