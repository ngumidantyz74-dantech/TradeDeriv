import React, { useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, BaselineSeries, type UTCTimestamp } from 'lightweight-charts';
import type { OrderRecord } from '../types';

interface Props {
  orders: OrderRecord[];
  theme: 'light' | 'dark';
  accountMode: 'real' | 'demo';
  startingCapital?: number;
}

export const LightweightEquityChart: React.FC<Props> = ({
  orders,
  theme,
  accountMode,
  startingCapital = 0,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const equitySeries = useMemo(() => {
    const closed = orders
      .filter(
        (o) =>
          o.status === 'CLOSED' &&
          (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
      )
      .sort((a, b) => {
        const ta = new Date(a.closed_at || a.opened_at).getTime();
        const tb = new Date(b.closed_at || b.opened_at).getTime();
        return ta - tb;
      });

    if (closed.length === 0) return [];

    let cum = startingCapital;
    const pts: Array<{ time: UTCTimestamp; value: number }> = [];
    let lastTs = 0;

    for (const o of closed) {
      cum = Number((cum + Number(o.pnl || 0)).toFixed(2));
      let sec = Math.floor(new Date(o.closed_at || o.opened_at).getTime() / 1000);
      if (!Number.isFinite(sec) || sec <= 0) sec = Math.floor(Date.now() / 1000);
      if (sec <= lastTs) sec = lastTs + 1;
      lastTs = sec;
      pts.push({ time: sec as UTCTimestamp, value: cum });
    }
    return pts;
  }, [orders, accountMode, startingCapital]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || equitySeries.length === 0) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#151820' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
      },
      grid: {
        vertLines: { color: isDark ? '#1F2430' : '#F1F5F9' },
        horzLines: { color: isDark ? '#1F2430' : '#F1F5F9' },
      },
      rightPriceScale: { borderColor: isDark ? '#2A2F3D' : '#E2E8F0' },
      timeScale: { borderColor: isDark ? '#2A2F3D' : '#E2E8F0', timeVisible: true },
    });

    const baseline = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: startingCapital },
      topLineColor: '#00A878',
      topFillColor1: 'rgba(0, 168, 120, 0.28)',
      topFillColor2: 'rgba(0, 168, 120, 0.02)',
      bottomLineColor: '#FF444F',
      bottomFillColor1: 'rgba(255, 68, 79, 0.04)',
      bottomFillColor2: 'rgba(255, 68, 79, 0.28)',
      lineWidth: 2,
    });

    baseline.setData(equitySeries);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [equitySeries, theme, startingCapital]);

  if (equitySeries.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-xs text-slate-500 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D]">
        Close at least one {accountMode.toUpperCase()} trade to plot your live Lightweight Charts P/L progress curve.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-[220px] rounded-xl overflow-hidden" />;
};
