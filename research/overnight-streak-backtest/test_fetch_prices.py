#!/usr/bin/env python3
"""Tests for the download reshaping. Run: python test_fetch_prices.py

These exercise the shape yfinance actually returns (verified against yfinance
1.6.0's download signature) without touching the network.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from fetch_prices import _reshape, read_universe
from overnight_streak import Config, _panel_from_long, run_strategy

FIELDS = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]


def _yf_frame(symbols: list[str], n: int = 8) -> pd.DataFrame:
    """A yfinance download with group_by='ticker' and auto_adjust=False."""
    idx = pd.DatetimeIndex(pd.bdate_range("2024-01-02", periods=n), name="Date")
    cols = pd.MultiIndex.from_product([symbols, FIELDS])
    rng = np.random.default_rng(1)
    data = rng.uniform(90, 110, size=(n, len(cols)))
    df = pd.DataFrame(data, index=idx, columns=cols)
    for s in symbols:
        df[(s, "Volume")] = 1_000_000.0
    return df


def test_reshape_multi_ticker():
    parts = _reshape(_yf_frame(["AAPL", "MSFT"]), ["AAPL", "MSFT"])
    assert len(parts) == 2
    for part in parts:
        assert "date" in part.columns and "adj_close" in part.columns
        assert set(part["symbol"].unique()) <= {"AAPL", "MSFT"}
        assert len(part) == 8


def test_reshape_skips_symbols_absent_from_the_response():
    parts = _reshape(_yf_frame(["AAPL"]), ["AAPL", "DELISTED"])
    assert len(parts) == 1 and parts[0]["symbol"].iloc[0] == "AAPL"


def test_reshape_handles_single_ticker_flat_columns():
    """With one ticker some yfinance versions return flat columns."""
    idx = pd.DatetimeIndex(pd.bdate_range("2024-01-02", periods=5), name="Date")
    flat = pd.DataFrame(
        {f: np.linspace(100, 105, 5) for f in FIELDS},
        index=idx,
    )
    parts = _reshape(flat, ["AAPL"])
    assert len(parts) == 1
    assert list(parts[0]["symbol"].unique()) == ["AAPL"]
    assert "adj_close" in parts[0].columns


def test_reshape_drops_all_nan_symbols():
    frame = _yf_frame(["AAPL", "GHOST"])
    frame[[("GHOST", f) for f in FIELDS]] = np.nan
    parts = _reshape(frame, ["AAPL", "GHOST"])
    assert [p["symbol"].iloc[0] for p in parts] == ["AAPL"]


def test_download_output_feeds_the_engine():
    """End to end: a yfinance-shaped download runs through the backtester."""
    parts = _reshape(_yf_frame(["AAPL", "MSFT"], n=40), ["AAPL", "MSFT"])
    long = pd.concat(parts, ignore_index=True)
    long["date"] = pd.to_datetime(long["date"])
    panel = _panel_from_long(long)
    res = run_strategy(panel, Config(streak=3, cost_bps=10.0))
    assert res.diagnostics["symbols"] == 2
    assert res.stats["n_days"] > 0


def test_read_universe_respects_the_cap():
    assert len(read_universe("universe_top1000.csv", 25)) == 25
    assert read_universe("universe_top1000.csv", 1)[0].isalpha()


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
