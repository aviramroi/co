#!/usr/bin/env python3
"""Tests for the overnight gap-streak engine. Run: python test_overnight_streak.py"""

from __future__ import annotations

import numpy as np
import pandas as pd

from overnight_streak import (
    Config,
    Panel,
    _panel_from_long,
    compute_stats,
    run_strategy,
    synthetic_panel,
)


def _panel(dates, opens, closes) -> Panel:
    idx = pd.DatetimeIndex(dates)
    o = pd.DataFrame({"A": opens}, index=idx)
    c = pd.DataFrame({"A": closes}, index=idx)
    return Panel(o, c, pd.DataFrame({"A": [1e9] * len(idx)}, index=idx))


DATES = pd.bdate_range("2024-01-01", periods=6)
#            d1    d2    d3    d4    d5    d6
OPENS = [100.0, 101.0, 101.0, 101.0, 110.0, 100.0]
CLOSES = [100.0, 100.0, 100.0, 100.0, 100.0, 100.0]


def test_streak_entry_and_trade_return():
    """Three gap-ups ending d4 -> buy close d4, sell open d5 (+10%)."""
    res = run_strategy(_panel(DATES, OPENS, CLOSES), Config(streak=3, cost_bps=0.0))
    invested = res.daily[res.daily["n_positions"] > 0]
    assert list(invested.index) == [DATES[3], DATES[4]], list(invested.index)
    assert abs(invested.loc[DATES[3], "ret_gross"] - 0.10) < 1e-12
    assert abs(invested.loc[DATES[4], "ret_gross"] - 0.0) < 1e-12
    # the exit of the final signal day falls outside the sample and is dropped
    assert DATES[5] not in res.daily.index


def test_streak_length_gates_entries():
    """A 4-day streak requirement is not met by three gap-ups."""
    res = run_strategy(_panel(DATES, OPENS, CLOSES), Config(streak=4, cost_bps=0.0))
    # only d5 completes four consecutive gap-ups (d2..d5)
    invested = res.daily[res.daily["n_positions"] > 0]
    assert list(invested.index) == [DATES[4]], list(invested.index)


def test_no_lookahead():
    """Changing prices strictly after the exit cannot change a trade's result."""
    base = run_strategy(_panel(DATES, OPENS, CLOSES), Config(streak=3, cost_bps=0.0))
    tampered_opens = list(OPENS)
    tampered_opens[5] = 500.0  # far future open
    tampered = run_strategy(_panel(DATES, tampered_opens, CLOSES), Config(streak=3, cost_bps=0.0))
    assert abs(base.daily.loc[DATES[3], "ret_gross"] - tampered.daily.loc[DATES[3], "ret_gross"]) < 1e-12


def test_costs_are_applied_once_per_trade():
    res = run_strategy(_panel(DATES, OPENS, CLOSES), Config(streak=3, cost_bps=25.0))
    assert abs(res.daily.loc[DATES[3], "ret_net"] - (0.10 - 0.0025)) < 1e-12
    # no cost is charged on days with no position
    assert res.daily.loc[DATES[0], "ret_net"] == 0.0


def test_short_side_flips_sign():
    res = run_strategy(_panel(DATES, OPENS, CLOSES), Config(streak=3, cost_bps=0.0, side="short"))
    assert abs(res.daily.loc[DATES[3], "ret_gross"] + 0.10) < 1e-12


def test_outlier_gaps_discarded():
    opens = list(OPENS)
    opens[4] = 100_000.0  # bogus print
    res = run_strategy(_panel(DATES, opens, CLOSES), Config(streak=3, cost_bps=0.0))
    assert res.diagnostics["discarded_outlier_gaps"] == 1
    assert res.daily.loc[DATES[3], "n_positions"] == 0  # its exit price was rejected


def test_split_does_not_create_a_fake_gap():
    """A 2:1 split shows up in raw prices but must vanish after adjustment."""
    dates = pd.bdate_range("2024-01-01", periods=3)
    raw = pd.DataFrame(
        {
            "date": list(dates) * 1,
            "symbol": ["A"] * 3,
            "open": [100.0, 100.0, 50.0],
            "close": [100.0, 100.0, 50.0],
            "adj_close": [50.0, 50.0, 50.0],  # vendor halves pre-split closes
            "volume": [1e6] * 3,
        }
    )
    panel = _panel_from_long(raw)
    gap = panel.open / panel.close.shift(1) - 1.0
    assert abs(float(gap["A"].iloc[2])) < 1e-12, gap


def test_engine_recovers_a_planted_edge():
    """With a 40 bps edge planted after 3 gap-ups, the engine must find it."""
    panel = synthetic_panel(n_symbols=200, n_days=760, seed=3, planted_edge_bps=40.0)
    res = run_strategy(panel, Config(streak=3, cost_bps=0.0))
    assert res.stats["mean_trade_bps"] > 25.0, res.stats
    assert res.stats["t_stat_daily"] > 3.0, res.stats


def test_engine_finds_nothing_in_a_null_market():
    """With no planted edge the mean trade return must be indistinguishable from zero."""
    panel = synthetic_panel(n_symbols=200, n_days=760, seed=5, ann_drift=0.0, planted_edge_bps=0.0)
    res = run_strategy(panel, Config(streak=3, cost_bps=0.0))
    assert abs(res.stats["t_stat_daily"]) < 3.0, res.stats


def test_stats_are_sane():
    """Compounding, drawdown and exposure agree with a hand-computed series."""
    idx = pd.bdate_range("2021-01-04", periods=504)  # ~2 calendar years
    rng = np.random.default_rng(0)
    r = pd.Series(rng.normal(0.0004, 0.01, len(idx)), index=idx)
    s = compute_stats(r)
    equity = float((1 + r).prod())
    assert abs(s["total_return_pct"] - (equity - 1) * 100) < 0.01  # reported rounded to 2dp
    assert abs((1 + s["cagr_pct"] / 100) ** s["years"] - equity) < 1e-3
    assert s["max_drawdown_pct"] < 0.0
    assert s["exposure_pct"] == 100.0
    assert abs(s["ann_vol_pct"] - float(r.std(ddof=1)) * (252**0.5) * 100) < 0.01


def test_zero_variance_series_does_not_blow_up():
    s = compute_stats(pd.Series(0.001, index=pd.bdate_range("2021-01-04", periods=100)))
    assert s["sharpe"] == 0.0 and s["t_stat_daily"] == 0.0


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"ERROR {t.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
