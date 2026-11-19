import React, { useState } from 'react';
import { Send, Cpu } from 'lucide-react';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { useAnalyser } from '../AnalyserContext';

interface AiResponse {
  model: string;
  degraded: boolean;
  notice?: string;
  measuredFacts: Record<string, any>;
  answer: string;
}

export const AiAssistantView: React.FC = () => {
  const { notify } = useAnalyser();
  const [instrument, setInstrument] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('M15');
  const [prompt, setPrompt] = useState(
    'Evaluate setup validity, key S/R levels, liquidity sweep context, and invalidation triggers.'
  );
  const [loading, setLoading] = useState(false);
  const [resData, setResData] = useState<AiResponse | null>(null);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<AiResponse>('/api/analyser/ai-assistant', {
        method: 'POST',
        body: JSON.stringify({ instrument, timeframe, prompt }),
      });
      setResData(res);
    } catch (err) {
      notify(sanitizeUiError(err, 'AI Assistant request failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Grounded Quantitative AI Analyst</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Every answer separates direct measured feed facts from analytical interpretation, citing real ATR, RSI, spread, and S/R levels.
        </p>
      </div>

      <form
        onSubmit={handleAsk}
        className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3 text-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#151820] hover:bg-[#252A38] text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-[#FF444F]" />
              {loading ? 'Analyzing Measured Telemetry...' : 'Run Grounded Analysis'}
            </button>
          </div>
        </div>

        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
          placeholder="Ask about structural bias, spread risk, or invalidation levels..."
        />
      </form>

      {resData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">Measured Feed Telemetry</h2>
              <span className="font-mono text-[11px] text-slate-400">{resData.model}</span>
            </div>
            <pre className="p-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono text-[11px] overflow-auto max-h-96">
              {JSON.stringify(resData.measuredFacts, null, 2)}
            </pre>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[#FF444F]" /> Analytical Interpretation
              </h2>
              {resData.notice && <span className="text-[11px] text-amber-500">{resData.notice}</span>}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">
              {resData.answer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
