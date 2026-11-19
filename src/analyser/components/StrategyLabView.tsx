import React, { useState } from 'react';
import { FlaskConical, CheckCircle2 } from 'lucide-react';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { useAnalyser } from '../AnalyserContext';

interface WindowMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnlUsd: number;
  profitFactor: number;
  maxDrawdownUsd: number;
  expectancyUsd: number;
}

interface WalkForwardResult {
  instrument: string;
  timeframe: string;
  strategyName: string;
  candleCount: number;
  spreadPipsCost: number;
  commissionPerLotUsd: number;
  slippagePips: number;
  inSample: WindowMetrics;
  outOfSample: WindowMetrics;
  overall: WindowMetrics;
  equityCurve: Array<{ index: number; time: number; equity: number }>;
  noLookaheadVerified: boolean;
  disclaimer: string;
}

export const StrategyLabView: React.FC = () => {
  const { notify } = useAnalyser();
  const [instrument, setInstrument] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('M15');
  const [strategyName, setStrategyName] = useState('EMA20/50 + RSI Walk-Forward');
  const [riskUsdPerTrade, setRiskUsdPerTrade] = useState('25');
  const [spreadPipsCost, setSpreadPipsCost] = useState('1.8');
  const [commissionPerLotUsd, setCommissionPerLotUsd] = useState('7');
  const [slippagePips, setSlippagePips] = useState('0.5');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WalkForwardResult | null>(null);

  const runBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    try {
      const res = await apiFetch<{ backtest: WalkForwardResult }>('/api/analyser/backtest', {
        method: 'POST',
        body: JSON.stringify({
          instrument,
          timeframe,
          strategyName,
          riskUsdPerTrade: Number(riskUsdPerTrade) || 25,
          spreadPipsCost: Number(spreadPipsCost) || 1.5,
          commissionPerLotUsd: Number(commissionPerLotUsd) || 7,
          slippagePips: Number(slippagePips) || 0.5,
        }),
      });
      setResult(res.backtest);
      notify(`Walk-forward backtest completed for ${instrument} (${timeframe})`, 'success');
    } catch (err) {
      notify(sanitizeUiError(err, 'Walk-forward backtest failed'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const renderEquitySvg = (curve: WalkForwardResult['equityCurve']) => {
    if (!curve || curve.length < 2) return null;
    const vals = curve.map((c) => c.equity);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = Math.max(1, max - min);
    const w = 700;
    const h = 150;
    const pad = 12;
    const pts = curve
      .map((c, idx) => {
        const x = pad + (idx / Math.max(1, curve.length - 1)) * (w - pad * 2);
        const y = h - pad - ((c.equity - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const stroke = curve[curve.length - 1].equity >= curve[0].equity ? '#00A878' : '#FF444F';
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
        <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} />
      </svg>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Walk-Forward Strategy Validation Laboratory</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Causal historical testing with explicit spread, commission, and slippage modeling split across In-Sample and Out-of-Sample windows.
        </p>
      </div>

      <form
        onSubmit={runBacktest}
        className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs items-end"
      >
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Instrument</label>
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-bold"
          >
            {['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'].map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono font-bold"
          >
            {['M5', 'M15', 'M30', 'H1', 'H4'].map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Risk / Trade ($)</label>
          <input
            type="number"
            value={riskUsdPerTrade}
            onChange={(e) => setRiskUsdPerTrade(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Spread (Pips)</label>
          <input
            type="number"
            step="0.1"
            value={spreadPipsCost}
            onChange={(e) => setSpreadPipsCost(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Comm ($/Lot)</label>
          <input
            type="number"
            step="0.5"
            value={commissionPerLotUsd}
            onChange={(e) => setCommissionPerLotUsd(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Slippage (Pips)</label>
          <input
            type="number"
            step="0.1"
            value={slippagePips}
            onChange={(e) => setSlippagePips(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
          />
        </div>
        <button
          type="submit"
          disabled={running}
          className="py-2.5 px-4 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          {running ? 'Running...' : 'Run Test'}
        </button>
      </form>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {(
              [
                { title: 'In-Sample Window', w: result.inSample },
                { title: 'Out-of-Sample Window', w: result.outOfSample },
                { title: 'Combined Overall', w: result.overall },
              ] as const
            ).map((seg) => (
              <div
                key={seg.title}
                className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold">{seg.title}</h2>
                  <span className="font-mono tabular-nums text-slate-400">{seg.w.trades} trades</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                  <div>
                    <p className="text-[10px] text-slate-400">Net P/L</p>
                    <p className={`text-base font-bold ${seg.w.netPnlUsd >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                      ${seg.w.netPnlUsd.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Win Rate</p>
                    <p className="text-base font-bold">{seg.w.winRatePct}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Profit Factor</p>
                    <p className="font-bold">{seg.w.profitFactor}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Max Drawdown</p>
                    <p className="font-bold text-[#FF444F]">${seg.w.maxDrawdownUsd.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold">Simulated Account Equity Curve ({result.candleCount} bars)</span>
              {result.noLookaheadVerified && (
                <span className="text-[#00A878] font-semibold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> No-Lookahead Verified
                </span>
              )}
            </div>
            {renderEquitySvg(result.equityCurve)}
            <p className="text-[11px] text-slate-500">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
};
