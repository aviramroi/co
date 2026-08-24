#!/usr/bin/env python3
"""Backtest of the "overnight gap streak" strategy.

Strategy under test
-------------------
Signal : the stock gapped up (open > previous close) on each of the last N
         consecutive trading days (default N = 3).
Entry  : buy at that day's close (market-on-close).
Exit   : sell at the next day's open (market-on-open).

Every trade therefore holds exactly one overnight session. The signal for a
close-entry on day t only uses gaps observed at or before the open of day t,
so there is no look-ahead.

All arithmetic runs on split- and dividend-adjusted prices, so a trade's
return is the total return an overnight holder actually earns (an overnight
holder is a holder of record over an ex-dividend date, so dividend adjustment
is the correct convention here).

Usage
-----
    # real data
    python overnight_streak.py --prices prices.parquet --universe universe_top1000.csv

    # engine self-test / demo on generated data (no network, no data files)
    python overnight_streak.py --synthetic
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

TRADING_DAYS = 252

# --------------------------------------------------------------------------
# data loading
# --------------------------------------------------------------------------

_COLUMN_ALIASES = {
    "adj close": "adj_close",
    "adjclose": "adj_close",
    "adjusted_close": "adj_close",
    "ticker": "symbol",
    "code": "symbol",
    "datetime": "date",
    "timestamp": "date",
}


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={c: str(c).strip().lower() for c in df.columns})
    df = df.rename(columns=_COLUMN_ALIASES)
    return df


@dataclass
class Panel:
    """Wide, adjusted price panel: index = date, columns = symbol."""

    open: pd.DataFrame
    close: pd.DataFrame
    dollar_volume: pd.DataFrame

    @property
    def symbols(self) -> list[str]:
        return list(self.close.columns)

    def slice_dates(self, start: str | None, end: str | None) -> "Panel":
        def cut(df: pd.DataFrame) -> pd.DataFrame:
            if start:
                df = df.loc[df.index >= pd.Timestamp(start)]
            if end:
                df = df.loc[df.index <= pd.Timestamp(end)]
            return df

        return Panel(cut(self.open), cut(self.close), cut(self.dollar_volume))

    def restrict(self, symbols: list[str]) -> "Panel":
        keep = [s for s in symbols if s in self.close.columns]
        return Panel(self.open[keep], self.close[keep], self.dollar_volume[keep])


def _panel_from_long(df: pd.DataFrame) -> Panel:
    df = _normalise(df)
    required = {"date", "symbol", "open", "close"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"price data is missing columns: {sorted(missing)}")

    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()
    df = df.dropna(subset=["date", "symbol", "open", "close"])
    df = df[(df["open"] > 0) & (df["close"] > 0)]

    # Adjust open by the same factor the vendor applied to close, so that
    # splits and dividends cannot masquerade as overnight moves.
    if "adj_close" in df.columns and df["adj_close"].notna().any():
        factor = (df["adj_close"] / df["close"]).replace([np.inf, -np.inf], np.nan)
        factor = factor.fillna(1.0)
    else:
        factor = pd.Series(1.0, index=df.index)
    df["open_adj"] = df["open"] * factor
    df["close_adj"] = df["close"] * factor

    volume = df["volume"] if "volume" in df.columns else pd.Series(np.nan, index=df.index)
    df["dollar_volume"] = volume * df["close"]

    df = df.drop_duplicates(subset=["date", "symbol"], keep="last")
    piv = lambda col: df.pivot(index="date", columns="symbol", values=col).sort_index()
    return Panel(piv("open_adj"), piv("close_adj"), piv("dollar_volume"))


def load_prices(path: str) -> Panel:
    """Load prices from a long-format parquet/csv file or a directory of per-symbol csvs."""
    if os.path.isdir(path):
        frames = []
        for name in sorted(os.listdir(path)):
            if not name.lower().endswith((".csv", ".csv.gz", ".parquet")):
                continue
            symbol = name.split(".")[0].upper()
            full = os.path.join(path, name)
            part = pd.read_parquet(full) if name.endswith(".parquet") else pd.read_csv(full)
            part = _normalise(part)
            part["symbol"] = symbol
            frames.append(part)
        if not frames:
            raise ValueError(f"no price files found in {path}")
        return _panel_from_long(pd.concat(frames, ignore_index=True))

    df = pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path)
    return _panel_from_long(df)


def load_universe(path: str, limit: int | None) -> list[str]:
    df = _normalise(pd.read_csv(path))
    col = "symbol" if "symbol" in df.columns else df.columns[0]
    symbols = [str(s).strip().upper() for s in df[col].dropna()]
    return symbols[:limit] if limit else symbols


def select_by_liquidity(panel: Panel, n: int) -> list[str]:
    """Fallback universe: the n names with the highest median dollar volume."""
    med = panel.dollar_volume.median(axis=0, skipna=True)
    return list(med.sort_values(ascending=False).head(n).index)


# --------------------------------------------------------------------------
# synthetic data (engine validation / demo)
# --------------------------------------------------------------------------


def synthetic_panel(
    n_symbols: int = 1000,
    n_days: int = 1260,
    seed: int = 7,
    ann_drift: float = 0.08,
    ann_vol: float = 0.32,
    overnight_share: float = 0.5,
    planted_edge_bps: float = 0.0,
    streak_for_edge: int = 3,
) -> Panel:
    """Generate a price panel with a known data-generating process.

    ``planted_edge_bps`` adds a deterministic drift to the overnight return that
    follows ``streak_for_edge`` consecutive gap-ups, which lets the tests assert
    that the engine recovers an edge it is supposed to find (and finds nothing
    when there is nothing to find).
    """
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2021-01-04", periods=n_days)
    symbols = [f"SYN{i:04d}" for i in range(n_symbols)]

    mu_d = ann_drift / TRADING_DAYS
    sd_d = ann_vol / math.sqrt(TRADING_DAYS)
    sd_on = sd_d * math.sqrt(overnight_share)
    sd_id = sd_d * math.sqrt(1.0 - overnight_share)

    overnight = rng.normal(mu_d * overnight_share, sd_on, size=(n_days, n_symbols))
    intraday = rng.normal(mu_d * (1 - overnight_share), sd_id, size=(n_days, n_symbols))

    if planted_edge_bps:
        up = overnight > 0
        streak = np.zeros_like(up, dtype=bool)
        if streak_for_edge <= n_days:
            stacked = np.stack(
                [up[i : n_days - streak_for_edge + 1 + i] for i in range(streak_for_edge)]
            )
            streak[streak_for_edge - 1 :] = stacked.all(axis=0)
        # a streak ending on day t predicts the overnight return of day t+1
        overnight[1:] += np.where(streak[:-1], planted_edge_bps / 1e4, 0.0)

    close = np.empty((n_days, n_symbols))
    open_ = np.empty((n_days, n_symbols))
    prev_close = np.full(n_symbols, 50.0)
    for t in range(n_days):
        open_[t] = prev_close * (1.0 + overnight[t])
        close[t] = open_[t] * (1.0 + intraday[t])
        prev_close = close[t]

    idx = pd.DatetimeIndex(dates)
    dv = pd.DataFrame(1e8, index=idx, columns=symbols)
    return Panel(
        pd.DataFrame(open_, index=idx, columns=symbols),
        pd.DataFrame(close, index=idx, columns=symbols),
        dv,
    )


# --------------------------------------------------------------------------
# strategy
# --------------------------------------------------------------------------


@dataclass
class Config:
    streak: int = 3
    cost_bps: float = 10.0  # round-trip, in basis points of notional
    side: str = "long"  # "long" or "short"
    signal: str = "gap"  # "gap" | "day" | "intraday"
    max_abs_move: float = 0.5  # overnight moves beyond this are treated as bad data
    min_dollar_volume: float = 0.0
    max_positions: int = 0  # 0 = unlimited


@dataclass
class Result:
    config: Config
    daily: pd.DataFrame  # per-signal-date portfolio results
    trades: pd.DataFrame  # pooled per-trade returns (net of cost)
    stats: dict = field(default_factory=dict)
    diagnostics: dict = field(default_factory=dict)


def _overnight_returns(panel: Panel, max_abs_move: float) -> tuple[pd.DataFrame, int]:
    prev_close = panel.close.shift(1)
    overnight = panel.open / prev_close - 1.0
    overnight = overnight.replace([np.inf, -np.inf], np.nan)
    bad = (overnight.abs() > max_abs_move) & overnight.notna()
    n_bad = int(bad.to_numpy().sum())
    return overnight.mask(bad), n_bad


def _signal_matrix(panel: Panel, overnight: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    if cfg.signal == "gap":
        up = overnight > 0
        valid = overnight.notna()
    elif cfg.signal == "day":
        daily = panel.close / panel.close.shift(1) - 1.0
        up, valid = daily > 0, daily.notna()
    elif cfg.signal == "intraday":
        intraday = panel.close / panel.open - 1.0
        up, valid = intraday > 0, intraday.notna()
    else:
        raise ValueError(f"unknown signal: {cfg.signal}")

    up = up.where(valid, False).astype(float)
    hits = up.rolling(cfg.streak, min_periods=cfg.streak).sum()
    return hits >= cfg.streak


def run_strategy(panel: Panel, cfg: Config) -> Result:
    overnight, n_bad = _overnight_returns(panel, cfg.max_abs_move)
    signal = _signal_matrix(panel, overnight, cfg)

    # The trade opened at the close of day t is closed at the open of day t+1.
    trade_ret = overnight.shift(-1)
    entries = signal & trade_ret.notna() & panel.close.notna()

    if cfg.min_dollar_volume > 0:
        liquid = panel.dollar_volume.rolling(21, min_periods=5).median()
        entries &= liquid >= cfg.min_dollar_volume

    if cfg.max_positions > 0:
        # keep the most liquid names when more signals fire than we can hold
        rank = panel.dollar_volume.where(entries).rank(axis=1, ascending=False, method="first")
        entries &= rank <= cfg.max_positions

    gross = trade_ret.where(entries)
    sign = 1.0 if cfg.side == "long" else -1.0
    net = sign * gross - cfg.cost_bps / 1e4

    n_pos = entries.sum(axis=1)
    port_gross = sign * gross.mean(axis=1)
    port_net = port_gross.where(n_pos > 0) - cfg.cost_bps / 1e4
    port_net = port_net.fillna(0.0)
    port_gross = port_gross.fillna(0.0)

    daily = pd.DataFrame(
        {"n_positions": n_pos, "ret_gross": port_gross, "ret_net": port_net}
    )
    # Returns are realised at the next open; drop the final signal day, whose
    # exit falls outside the sample.
    daily = daily.iloc[:-1]

    stacked = net.stack()
    trades = pd.DataFrame({"ret_net": stacked.to_numpy()}, index=stacked.index)
    trades.index.names = ["date", "symbol"]

    res = Result(config=cfg, daily=daily, trades=trades)
    res.diagnostics = {
        "symbols": len(panel.symbols),
        "trading_days": int(len(panel.close)),
        "first_date": str(panel.close.index.min().date()) if len(panel.close) else None,
        "last_date": str(panel.close.index.max().date()) if len(panel.close) else None,
        "discarded_outlier_gaps": n_bad,
    }
    res.stats = compute_stats(daily["ret_net"], trades["ret_net"], daily["n_positions"])
    return res


# --------------------------------------------------------------------------
# statistics
# --------------------------------------------------------------------------


def _max_drawdown(equity: pd.Series) -> float:
    peak = equity.cummax()
    return float((equity / peak - 1.0).min()) if len(equity) else 0.0


def compute_stats(
    daily_ret: pd.Series, trade_ret: pd.Series | None = None, n_pos: pd.Series | None = None
) -> dict:
    r = daily_ret.dropna()
    if r.empty:
        return {"n_days": 0}

    equity = (1.0 + r).cumprod()
    total = float(equity.iloc[-1] - 1.0)
    years = max((r.index[-1] - r.index[0]).days / 365.25, 1e-9)
    cagr = float((1.0 + total) ** (1.0 / years) - 1.0) if total > -1 else -1.0
    sd = float(r.std(ddof=1))
    vol = sd * math.sqrt(TRADING_DAYS)
    sharpe = float(r.mean() / sd * math.sqrt(TRADING_DAYS)) if sd > 1e-12 else 0.0

    invested = r[r != 0] if n_pos is None else r[n_pos.reindex(r.index).fillna(0) > 0]
    sd_inv = float(invested.std(ddof=1)) if len(invested) > 1 else 0.0
    t_stat = (
        float(invested.mean() / (sd_inv / math.sqrt(len(invested)))) if sd_inv > 1e-12 else 0.0
    )

    out = {
        "n_days": int(len(r)),
        "years": round(years, 2),
        "total_return_pct": round(total * 100, 2),
        "cagr_pct": round(cagr * 100, 2),
        "ann_vol_pct": round(vol * 100, 2),
        "sharpe": round(sharpe, 2),
        "max_drawdown_pct": round(_max_drawdown(equity) * 100, 2),
        "best_day_pct": round(float(r.max()) * 100, 2),
        "worst_day_pct": round(float(r.min()) * 100, 2),
        "days_invested": int(len(invested)),
        "exposure_pct": round(100 * len(invested) / len(r), 1),
        "mean_day_bps": round(float(invested.mean()) * 1e4, 2) if len(invested) else 0.0,
        "t_stat_daily": round(t_stat, 2),
    }
    if n_pos is not None:
        held = n_pos.reindex(r.index).fillna(0)
        out["avg_positions"] = round(float(held[held > 0].mean()) if (held > 0).any() else 0.0, 1)
    if trade_ret is not None:
        tr = trade_ret.dropna()
        out["n_trades"] = int(len(tr))
        if len(tr):
            out["mean_trade_bps"] = round(float(tr.mean()) * 1e4, 2)
            out["median_trade_bps"] = round(float(tr.median()) * 1e4, 2)
            out["win_rate_pct"] = round(float((tr > 0).mean()) * 100, 2)
    return out


def yearly_breakdown(daily_ret: pd.Series) -> pd.DataFrame:
    r = daily_ret.dropna()
    if r.empty:
        return pd.DataFrame()
    grp = r.groupby(r.index.year)
    return pd.DataFrame(
        {
            "return_pct": (grp.apply(lambda x: (1 + x).prod() - 1) * 100).round(2),
            "days": grp.size(),
        }
    )


# --------------------------------------------------------------------------
# benchmarks
# --------------------------------------------------------------------------


def benchmarks(panel: Panel, cfg: Config) -> dict[str, pd.Series]:
    overnight, _ = _overnight_returns(panel, cfg.max_abs_move)
    close_to_close = (panel.close / panel.close.shift(1) - 1.0).replace(
        [np.inf, -np.inf], np.nan
    )
    close_to_close = close_to_close.mask(close_to_close.abs() > cfg.max_abs_move)
    intraday = (panel.close / panel.open - 1.0).replace([np.inf, -np.inf], np.nan)
    intraday = intraday.mask(intraday.abs() > cfg.max_abs_move)
    return {
        "buy_and_hold_ew": close_to_close.mean(axis=1).fillna(0.0),
        "overnight_every_night_gross": overnight.mean(axis=1).fillna(0.0),
        "overnight_every_night_net": (overnight.mean(axis=1) - cfg.cost_bps / 1e4).fillna(0.0),
        "intraday_every_day_gross": intraday.mean(axis=1).fillna(0.0),
    }


# --------------------------------------------------------------------------
# sweeps and reporting
# --------------------------------------------------------------------------


def sweep(panel: Panel, streaks: list[int], costs: list[float], base: Config) -> pd.DataFrame:
    rows = []
    for n in streaks:
        for c in costs:
            cfg = Config(**{**base.__dict__, "streak": n, "cost_bps": c})
            res = run_strategy(panel, cfg)
            rows.append(
                {
                    "streak": n,
                    "cost_bps": c,
                    "trades": res.stats.get("n_trades", 0),
                    "mean_trade_bps": res.stats.get("mean_trade_bps", 0.0),
                    "win_rate_pct": res.stats.get("win_rate_pct", 0.0),
                    "total_return_pct": res.stats.get("total_return_pct", 0.0),
                    "cagr_pct": res.stats.get("cagr_pct", 0.0),
                    "sharpe": res.stats.get("sharpe", 0.0),
                    "max_dd_pct": res.stats.get("max_drawdown_pct", 0.0),
                    "t_stat": res.stats.get("t_stat_daily", 0.0),
                }
            )
    return pd.DataFrame(rows)


def _md_table(df: pd.DataFrame, index_name: str | None = None) -> str:
    if df.empty:
        return "_(no rows)_\n"
    d = df.reset_index() if index_name else df
    if index_name:
        d = d.rename(columns={d.columns[0]: index_name})
    header = "| " + " | ".join(str(c) for c in d.columns) + " |"
    sep = "| " + " | ".join("---" for _ in d.columns) + " |"
    lines = [header, sep]
    for _, row in d.iterrows():
        lines.append("| " + " | ".join(f"{v}" for v in row.to_numpy()) + " |")
    return "\n".join(lines) + "\n"


def report(res: Result, bench: dict[str, pd.Series], sweep_df: pd.DataFrame) -> str:
    cfg = res.config
    out = ["# Overnight gap-streak backtest", ""]
    out.append(
        f"Buy at the close after **{cfg.streak}** consecutive gap-ups, sell at the next open "
        f"({cfg.side}, {cfg.cost_bps:.0f} bps round-trip cost).\n"
    )
    out.append("## Sample\n")
    out.append(_md_table(pd.DataFrame([res.diagnostics])))
    out.append("\n## Headline\n")
    out.append(_md_table(pd.DataFrame([res.stats])))
    out.append("\n## By calendar year\n")
    out.append(_md_table(yearly_breakdown(res.daily["ret_net"]), index_name="year"))
    out.append("\n## Benchmarks\n")
    brows = {k: compute_stats(v) for k, v in bench.items()}
    out.append(_md_table(pd.DataFrame(brows).T, index_name="strategy"))
    out.append("\n## Streak length x cost sweep\n")
    out.append(_md_table(sweep_df))
    return "\n".join(out)


# --------------------------------------------------------------------------
# cli
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--prices", help="long-format parquet/csv, or a directory of per-symbol csvs")
    src.add_argument("--synthetic", action="store_true", help="run on generated data (no data files needed)")
    p.add_argument("--universe", help="csv with a 'symbol' column")
    p.add_argument("--top", type=int, default=1000, help="cap the universe to this many symbols")
    p.add_argument("--start", help="YYYY-MM-DD")
    p.add_argument("--end", help="YYYY-MM-DD")
    p.add_argument("--streak", type=int, default=3)
    p.add_argument("--cost-bps", type=float, default=10.0, help="round-trip cost in bps")
    p.add_argument("--side", choices=["long", "short"], default="long")
    p.add_argument("--signal", choices=["gap", "day", "intraday"], default="gap")
    p.add_argument("--min-dollar-volume", type=float, default=0.0)
    p.add_argument("--max-positions", type=int, default=0)
    p.add_argument("--synthetic-edge-bps", type=float, default=0.0)
    p.add_argument("--out-dir", help="write report.md, stats.json and equity.csv here")
    args = p.parse_args(argv)

    if args.synthetic:
        panel = synthetic_panel(
            n_symbols=min(args.top, 1000), planted_edge_bps=args.synthetic_edge_bps
        )
    else:
        panel = load_prices(args.prices)
        if args.universe:
            panel = panel.restrict(load_universe(args.universe, args.top))
        elif args.top:
            panel = panel.restrict(select_by_liquidity(panel, args.top))
    panel = panel.slice_dates(args.start, args.end)

    cfg = Config(
        streak=args.streak,
        cost_bps=args.cost_bps,
        side=args.side,
        signal=args.signal,
        min_dollar_volume=args.min_dollar_volume,
        max_positions=args.max_positions,
    )
    res = run_strategy(panel, cfg)
    bench = benchmarks(panel, cfg)
    sweep_df = sweep(panel, [1, 2, 3, 4, 5], [0.0, 5.0, 10.0, 20.0], cfg)

    text = report(res, bench, sweep_df)
    print(text)

    if args.out_dir:
        os.makedirs(args.out_dir, exist_ok=True)
        with open(os.path.join(args.out_dir, "report.md"), "w") as fh:
            fh.write(text)
        payload = {
            "config": cfg.__dict__,
            "diagnostics": res.diagnostics,
            "stats": res.stats,
            "benchmarks": {k: compute_stats(v) for k, v in bench.items()},
            "sweep": sweep_df.to_dict(orient="records"),
        }
        with open(os.path.join(args.out_dir, "stats.json"), "w") as fh:
            json.dump(payload, fh, indent=2, default=str)
        equity = (1.0 + res.daily["ret_net"]).cumprod().rename("equity")
        equity.to_csv(os.path.join(args.out_dir, "equity.csv"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
