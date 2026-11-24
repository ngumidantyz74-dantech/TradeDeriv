import React, { useState, useEffect, useMemo } from 'react';
import {
  ListChecks,
  ShoppingBasket,
  Flag,
  Check,
  Plus,
  Minus,
} from 'lucide-react';
import {
  BLOCK_MARKETS,
  BLOCK_SUBMARKETS,
  BLOCK_SYMBOLS,
  TRADE_SUBTYPES,
  CANDLE_INTERVALS,
  DURATION_UNITS,
  BOT_VARIABLES,
  resolveSubtypeDef,
  setAssignmentVal,
  type BotXmlWorkspaceState,
  type BlockMarketName,
  type TradeCategoryName,
} from '../lib/botXml';
import type { MarketInstrument } from '../types';

interface DropdownChoice {
  value: string;
  label: string;
}

interface ActivePopupMenu {
  id: string;
  top: number;
  left: number;
  width: number;
  selectedValue: string;
  choices: DropdownChoice[];
  onSelect: (value: string) => void;
}

interface ActiveValuePrompt {
  title?: string;
  initialValue: string;
  onConfirm: (nextVal: string) => void;
}

interface BotBlocklyCanvasProps {
  state: BotXmlWorkspaceState;
  onChange: (updater: (prev: BotXmlWorkspaceState) => BotXmlWorkspaceState) => void;
  instruments: MarketInstrument[];
  canvasZoom: number;
  onOpenQuickStrategy: () => void;
}

const OP_LABELS: Record<BotXmlWorkspaceState['ifOperator'], string> = {
  EQ: '=',
  NEQ: '≠',
  GT: '>',
  LT: '<',
  GTE: '≥',
  LTE: '≤',
};

export const BotBlocklyCanvas: React.FC<BotBlocklyCanvasProps> = ({
  state,
  onChange,
  instruments,
  canvasZoom,
  onOpenQuickStrategy,
}) => {
  const [popupMenu, setPopupMenu] = useState<ActivePopupMenu | null>(null);
  const [valuePrompt, setValuePrompt] = useState<ActiveValuePrompt | null>(null);
  const [promptInput, setPromptInput] = useState('');

  useEffect(() => {
    if (!popupMenu) return;
    const handleOutside = () => setPopupMenu(null);
    window.addEventListener('scroll', handleOutside, true);
    return () => window.removeEventListener('scroll', handleOutside, true);
  }, [popupMenu]);

  const openDropdown = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
    selectedValue: string,
    choices: DropdownChoice[],
    onSelect: (v: string) => void
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
    const menuWidth = Math.max(150, Math.min(240, rect.width + 72));
    const clampedLeft = Math.max(10, Math.min(rect.left, vw - menuWidth - 10));
    const estHeight = Math.min(340, choices.length * 36 + 16);
    const top = rect.bottom + estHeight > vh - 70 ? Math.max(60, rect.top - estHeight - 6) : rect.bottom + 6;
    setPopupMenu({
      id,
      top,
      left: clampedLeft,
      width: menuWidth,
      selectedValue,
      choices,
      onSelect,
    });
  };

  const openValuePrompt = (initialValue: string, onConfirm: (val: string) => void) => {
    setPopupMenu(null);
    setPromptInput(initialValue);
    setValuePrompt({ initialValue, onConfirm });
  };

  const submarketsForMarket = BLOCK_SUBMARKETS[state.market] || BLOCK_SUBMARKETS.Derived;

  const symbolsForSubmarket = useMemo(() => {
    const matched = BLOCK_SYMBOLS.filter(
      (s) => s.market === state.market && s.submarket === state.submarket
    );
    if (matched.length > 0) return matched;
    if (instruments.length > 0) {
      return instruments.slice(0, 12).map((inst) => ({
        symbol: inst.symbol,
        label: inst.display_name,
        market: state.market,
        submarket: state.submarket,
      }));
    }
    return BLOCK_SYMBOLS.slice(0, 8);
  }, [state.market, state.submarket, instruments]);

  const activeSymbolLabel = useMemo(() => {
    const inCatalog = BLOCK_SYMBOLS.find((s) => s.symbol === state.symbol);
    if (inCatalog) return inCatalog.label;
    const inInst = instruments.find((i) => i.symbol === state.symbol);
    return inInst?.display_name || state.symbol;
  }, [state.symbol, instruments]);

  const subtypesForCategory = useMemo(() => {
    const list = TRADE_SUBTYPES.filter((t) => t.category === state.tradeCategory);
    return list.length > 0 ? list : TRADE_SUBTYPES;
  }, [state.tradeCategory]);

  const activeSubtypeDef = useMemo(
    () => resolveSubtypeDef(state.tradeCategory, state.tradeSubtype),
    [state.tradeCategory, state.tradeSubtype]
  );

  const legChoices: DropdownChoice[] = useMemo(() => {
    return activeSubtypeDef.legs.map((l) => ({ value: l.value, label: l.label }));
  }, [activeSubtypeDef]);

  const contractChoices: DropdownChoice[] = useMemo(() => {
    return [{ value: 'Both', label: 'Both' }, ...legChoices];
  }, [legChoices]);

  const getLegLabel = (val: string) => {
    const found = legChoices.find((l) => l.value === val);
    if (found) return found.label;
    if (val === 'CALL') return 'Rise';
    if (val === 'PUT') return 'Fall';
    if (val === 'DIGITOVER') return 'Over';
    if (val === 'DIGITUNDER') return 'Under';
    if (val === 'DIGITMATCH') return 'Matches';
    if (val === 'DIGITDIFF') return 'Differs';
    if (val === 'DIGITEVEN') return 'Even';
    if (val === 'DIGITODD') return 'Odd';
    if (val === 'MULTUP') return 'Up';
    if (val === 'MULTDOWN') return 'Down';
    if (val === 'ACCU') return 'Accumulators';
    return val;
  };

  const renderPillBtn = (
    id: string,
    displayLabel: string,
    selectedValue: string,
    choices: DropdownChoice[],
    onSelect: (v: string) => void
  ) => (
    <button
      type="button"
      onClick={(e) => openDropdown(e, id, selectedValue, choices, onSelect)}
      className="px-2 py-[2px] rounded-full bg-[#F7F8FA] hover:bg-white dark:bg-[#151820] border border-[#B9C0CA] dark:border-white/20 text-[11px] font-medium text-[#111319] dark:text-slate-100 inline-flex items-center gap-1 cursor-pointer leading-tight shrink-0"
    >
      <span className="truncate max-w-[165px]">{displayLabel}</span>
      <span className="text-[9px] text-[#374151] dark:text-slate-400">▾</span>
    </button>
  );

  const renderValuePill = (value: string, onConfirm: (nextVal: string) => void) => (
    <button
      type="button"
      onClick={() => openValuePrompt(value, onConfirm)}
      className="min-w-[26px] px-2.5 py-[2px] rounded-full bg-[#F7F8FA] hover:bg-white dark:bg-[#151820] border border-[#B9C0CA] dark:border-white/20 text-[11px] font-medium text-[#111319] dark:text-slate-100 text-center cursor-pointer leading-tight shrink-0"
    >
      {value}
    </button>
  );

  const candleLabel =
    CANDLE_INTERVALS.find((c) => c.value === state.candleInterval)?.label || '1 minute';
  const durationUnitLabel =
    DURATION_UNITS.find((u) => u.value === state.durationUnit)?.label || 'Ticks';

  return (
    <div
      onClick={() => setPopupMenu(null)}
      className="relative flex-1 overflow-auto bg-white dark:bg-[#0B0E14] px-3.5 py-3.5"
    >
      {/* Top-Left ONLY Quick Strategy Red Button matching Screenshot 205837 */}
      <div className="mb-5">
        <button
          type="button"
          onClick={onOpenQuickStrategy}
          className="px-4 py-[9px] rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold shadow-xs cursor-pointer"
        >
          Quick strategy
        </button>
      </div>

      {/* Blockly Horizontal Workspace Canvas (Blocks 1 + 2 on Left, Block 4 on Right) */}
      <div
        className="flex flex-row items-start gap-8 pb-16 min-w-max origin-top-left transition-transform"
        style={{ transform: `scale(${canvasZoom / 100})` }}
      >
        {/* LEFT STACK: BLOCK 1 (Trade Parameters) + BLOCK 2 (Purchase Conditions) */}
        <div className="flex flex-col gap-7 items-start pl-3">
          {/* BLOCK 1: 1. Trade parameters */}
          <div className="relative">
            <div className="bg-[#0A405C] text-white rounded-tl-[4px] rounded-tr-[4px] px-2.5 py-1.5 flex items-center gap-2 text-[11.5px] font-medium w-[238px] shadow-xs">
              <ListChecks className="w-3.5 h-3.5 text-white/90 shrink-0" />
              <span>1. Trade parameters</span>
            </div>

            {/* C-Block Body */}
            <div className="border-l-[10px] border-[#0A405C] bg-transparent">
              {/* Top Input Parameters Stack */}
              <div className="space-y-[2px]">
                {/* Market: Market > Submarket > Symbol */}
                <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1 text-[11px] text-[#111319] dark:text-slate-200 whitespace-nowrap">
                  <span>Market:</span>
                  {renderPillBtn(
                    'market',
                    state.market,
                    state.market,
                    BLOCK_MARKETS.map((m) => ({ value: m, label: m })),
                    (nextMarket) => {
                      const mkt = nextMarket as BlockMarketName;
                      const subs = BLOCK_SUBMARKETS[mkt] || ['Continuous Indices'];
                      const nextSub = subs[0];
                      const nextSym =
                        BLOCK_SYMBOLS.find((s) => s.market === mkt && s.submarket === nextSub)?.symbol ||
                        state.symbol;
                      onChange((prev) => ({
                        ...prev,
                        market: mkt,
                        submarket: nextSub,
                        symbol: nextSym,
                      }));
                    }
                  )}
                  <span className="text-[#4B5563]">&gt;</span>
                  {renderPillBtn(
                    'submarket',
                    state.submarket,
                    state.submarket,
                    submarketsForMarket.map((s) => ({ value: s, label: s })),
                    (nextSub) => {
                      const nextSym =
                        BLOCK_SYMBOLS.find((s) => s.market === state.market && s.submarket === nextSub)?.symbol ||
                        state.symbol;
                      onChange((prev) => ({
                        ...prev,
                        submarket: nextSub,
                        symbol: nextSym,
                      }));
                    }
                  )}
                  <span className="text-[#4B5563]">&gt;</span>
                  {renderPillBtn(
                    'symbol',
                    activeSymbolLabel,
                    state.symbol,
                    symbolsForSubmarket.map((s) => ({ value: s.symbol, label: s.label })),
                    (nextSym) => onChange((prev) => ({ ...prev, symbol: nextSym }))
                  )}
                </div>

                {/* Trade Type: Category > Subtype */}
                <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1 text-[11px] text-[#111319] dark:text-slate-200 w-fit whitespace-nowrap">
                  <span>Trade Type:</span>
                  {renderPillBtn(
                    'tradeCat',
                    state.tradeCategory,
                    state.tradeCategory,
                    (['Up/Down', 'Digits', 'Options', 'Multipliers'] as TradeCategoryName[]).map((c) => ({
                      value: c,
                      label: c,
                    })),
                    (nextCat) => {
                      const cat = nextCat as TradeCategoryName;
                      const subDef = resolveSubtypeDef(cat, '');
                      onChange((prev) => ({
                        ...prev,
                        tradeCategory: cat,
                        tradeSubtype: subDef.subtype,
                        contractTypeSelection: 'Both',
                        thenPurchase: subDef.legs[0].value,
                        elsePurchase: subDef.legs[1]?.value || subDef.legs[0].value,
                      }));
                    }
                  )}
                  <span className="text-[#4B5563]">&gt;</span>
                  {renderPillBtn(
                    'tradeSub',
                    state.tradeSubtype,
                    state.tradeSubtype,
                    subtypesForCategory.map((t) => ({ value: t.subtype, label: t.subtype })),
                    (nextSub) => {
                      const subDef = resolveSubtypeDef(state.tradeCategory, nextSub);
                      onChange((prev) => ({
                        ...prev,
                        tradeSubtype: nextSub,
                        contractTypeSelection: 'Both',
                        thenPurchase: subDef.legs[0].value,
                        elsePurchase: subDef.legs[1]?.value || subDef.legs[0].value,
                      }));
                    }
                  )}
                </div>

                {/* Contract Type: [Both ▾] */}
                <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit">
                  <span>Contract Type:</span>
                  {renderPillBtn(
                    'contractType',
                    state.contractTypeSelection === 'Both'
                      ? 'Both'
                      : getLegLabel(state.contractTypeSelection),
                    state.contractTypeSelection,
                    contractChoices,
                    (nextVal) =>
                      onChange((prev) => ({
                        ...prev,
                        contractTypeSelection: nextVal,
                        thenPurchase: nextVal === 'Both' ? prev.thenPurchase : nextVal,
                      }))
                  )}
                </div>

                {/* Default Candle Interval */}
                <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit">
                  <span>Default Candle Interval:</span>
                  {renderPillBtn(
                    'candleInterval',
                    candleLabel,
                    state.candleInterval,
                    CANDLE_INTERVALS,
                    (v) => onChange((prev) => ({ ...prev, candleInterval: v }))
                  )}
                </div>

                {/* Restart buy/sell on error */}
                <div
                  onClick={() =>
                    onChange((prev) => ({ ...prev, restartBuySellOnError: !prev.restartBuySellOnError }))
                  }
                  className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-2 text-[11px] text-[#111319] dark:text-slate-200 w-fit cursor-pointer"
                >
                  <span>Restart buy/sell on error (disable for better performance):</span>
                  <span className="w-[15px] h-[15px] rounded-[2px] bg-[#F7F8FA] border border-[#B9C0CA] flex items-center justify-center text-[10px] font-bold text-[#111319]">
                    {state.restartBuySellOnError ? '✓' : ''}
                  </span>
                </div>

                {/* Restart last trade on error */}
                <div
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      restartLastTradeOnError: !prev.restartLastTradeOnError,
                    }))
                  }
                  className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-2 text-[11px] text-[#111319] dark:text-slate-200 w-fit cursor-pointer"
                >
                  <span>Restart last trade on error (bot ignores the unsuccessful trade):</span>
                  <span className="w-[15px] h-[15px] rounded-[2px] bg-[#F7F8FA] border border-[#B9C0CA] flex items-center justify-center text-[10px] font-bold text-[#111319]">
                    {state.restartLastTradeOnError ? '✓' : ''}
                  </span>
                </div>
              </div>

              {/* Run once at start: Middle C-divider */}
              <div className="mt-1">
                <div className="bg-[#0A405C] text-white px-2.5 py-1.5 text-[11.5px] font-medium w-[228px]">
                  Run once at start:
                </div>
                <div className="border-l-[10px] border-[#0A405C] space-y-[2px] pb-1">
                  {state.assignments.map((row) => (
                    <div
                      key={row.id}
                      className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[4px] flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit"
                    >
                      <span>set</span>
                      {renderPillBtn(
                        `assign-${row.id}`,
                        row.variable,
                        row.variable,
                        BOT_VARIABLES.map((v) => ({ value: v, label: v })),
                        (nextVar) =>
                          onChange((prev) => ({
                            ...prev,
                            assignments: prev.assignments.map((item) =>
                              item.id === row.id ? { ...item, variable: nextVar } : item
                            ),
                          }))
                      )}
                      <span>to</span>
                      {renderValuePill(row.value, (nextVal) =>
                        onChange((prev) => ({
                          ...prev,
                          assignments: prev.assignments.map((item) =>
                            item.id === row.id ? { ...item, value: nextVal } : item
                          ),
                        }))
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Trade options: C-divider */}
              <div>
                <div className="bg-[#0A405C] text-white px-2.5 py-1.5 text-[11.5px] font-medium w-[228px]">
                  Trade options:
                </div>
                <div className="border-l-[10px] border-[#0A405C] pb-1">
                  <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit whitespace-nowrap">
                    <span>Duration:</span>
                    {renderPillBtn(
                      'durationUnit',
                      durationUnitLabel,
                      state.durationUnit,
                      DURATION_UNITS,
                      (v) => onChange((prev) => ({ ...prev, durationUnit: v }))
                    )}
                    {renderValuePill(state.duration, (v) =>
                      onChange((prev) => ({ ...prev, duration: v }))
                    )}
                    <span>Stake: USD</span>
                    {renderValuePill('Get Next Stake', () =>
                      openValuePrompt(
                        state.assignments.find((a) => a.variable === 'initialStake')?.value || '1',
                        (nextStake) =>
                          onChange((prev) => ({
                            ...prev,
                            assignments: setAssignmentVal(prev.assignments, 'initialStake', nextStake),
                          }))
                      )
                    )}
                    {activeSubtypeDef.usesPrediction && (
                      <>
                        <span>Prediction:</span>
                        {renderValuePill(state.prediction, (v) =>
                          onChange((prev) => ({ ...prev, prediction: v }))
                        )}
                      </>
                    )}
                    {activeSubtypeDef.isAccu && (
                      <>
                        <span>Growth Rate:</span>
                        {renderPillBtn(
                          'growthRate',
                          `${Math.round(state.growthRate * 100)}%`,
                          String(state.growthRate),
                          [
                            { value: '0.01', label: '1%' },
                            { value: '0.02', label: '2%' },
                            { value: '0.03', label: '3%' },
                            { value: '0.04', label: '4%' },
                            { value: '0.05', label: '5%' },
                          ],
                          (v) => onChange((prev) => ({ ...prev, growthRate: Number(v) }))
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom C-Block Footer Cap */}
            <div className="bg-[#0A405C] h-5 w-[238px] rounded-b-[4px]" />
          </div>

          {/* BLOCK 2: 2. Purchase conditions (with exact 2px #D99B26 gold top highlight) */}
          <div className="relative">
            <div className="bg-[#0A405C] border-t-[3px] border-t-[#D99B26] text-white rounded-tl-[4px] rounded-tr-[4px] px-2.5 py-1.5 flex items-center gap-2 text-[11.5px] font-medium w-[238px] shadow-xs">
              <ShoppingBasket className="w-3.5 h-3.5 text-white/90 shrink-0" />
              <span>2. Purchase conditions</span>
            </div>

            <div className="border-l-[10px] border-[#0A405C] space-y-[2px]">
              {/* set [msgInfo ▾] to create text with (+) */}
              <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] pl-2.5 pr-2 pt-1.5 pb-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit">
                <div className="flex items-center gap-1.5 pb-1.5">
                  <span>set</span>
                  {renderPillBtn(
                    'notifyVarTop',
                    state.notifyVar,
                    state.notifyVar,
                    BOT_VARIABLES.map((v) => ({ value: v, label: v })),
                    (v) => onChange((prev) => ({ ...prev, notifyVar: v }))
                  )}
                  <span>to</span>
                  <span className="font-medium">create text with</span>
                  <button
                    type="button"
                    title="Add item"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        notifyParts: [
                          ...prev.notifyParts,
                          { id: `p-${Date.now()}`, kind: 'text', value: 'text' },
                        ],
                      }))
                    }
                    className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Nested create text slots with (-) buttons */}
                <div className="ml-4 border-l-4 border-[#D0D4DB] dark:border-white/15 pl-2 space-y-1 py-1 bg-[#EAECEF] dark:bg-[#171C26] rounded-[3px] pr-2">
                  {state.notifyParts.map((part) => (
                    <div key={part.id} className="flex items-center gap-1.5">
                      {part.kind === 'var'
                        ? renderPillBtn(
                            `npart-${part.id}`,
                            part.value,
                            part.value,
                            BOT_VARIABLES.map((v) => ({ value: v, label: v })),
                            (v) =>
                              onChange((prev) => ({
                                ...prev,
                                notifyParts: prev.notifyParts.map((p) =>
                                  p.id === part.id ? { ...p, value: v } : p
                                ),
                              }))
                          )
                        : renderValuePill(part.value, (nextVal) =>
                            onChange((prev) => ({
                              ...prev,
                              notifyParts: prev.notifyParts.map((p) =>
                                p.id === part.id ? { ...p, value: nextVal } : p
                              ),
                            }))
                          )}
                      <button
                        type="button"
                        title="Remove item"
                        onClick={() =>
                          onChange((prev) => ({
                            ...prev,
                            notifyParts: prev.notifyParts.filter((p) => p.id !== part.id),
                          }))
                        }
                        className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notify [blue ▾] with sound: [Silent ▾] [msgInfo ▾] */}
              <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit whitespace-nowrap">
                <span>Notify</span>
                {renderPillBtn(
                  'notifyColor',
                  state.notifyColor,
                  state.notifyColor,
                  [
                    { value: 'blue', label: 'blue' },
                    { value: 'green', label: 'green' },
                    { value: 'yellow', label: 'yellow' },
                    { value: 'red', label: 'red' },
                  ],
                  (v) => onChange((prev) => ({ ...prev, notifyColor: v as any }))
                )}
                <span>with sound:</span>
                {renderPillBtn(
                  'notifySound',
                  state.notifySound,
                  state.notifySound,
                  [
                    { value: 'Silent', label: 'Silent' },
                    { value: 'Announcement', label: 'Announcement' },
                    { value: 'Earned money', label: 'Earned money' },
                    { value: 'Job done', label: 'Job done' },
                    { value: 'Severe error', label: 'Severe error' },
                  ],
                  (v) => onChange((prev) => ({ ...prev, notifySound: v as any }))
                )}
                {renderPillBtn(
                  'notifyVar',
                  state.notifyVar,
                  state.notifyVar,
                  BOT_VARIABLES.map((v) => ({ value: v, label: v })),
                  (v) => onChange((prev) => ({ ...prev, notifyVar: v }))
                )}
              </div>

              {/* if [tradeSide ▾] [= ▾] (CALL) then Purchase [Rise ▾] else Purchase [Fall ▾] */}
              <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] text-[11px] text-[#111319] dark:text-slate-200 w-fit space-y-1.5">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span>if</span>
                  {renderPillBtn(
                    'ifLeftVar',
                    state.ifLeftVar,
                    state.ifLeftVar,
                    BOT_VARIABLES.map((v) => ({ value: v, label: v })),
                    (v) => onChange((prev) => ({ ...prev, ifLeftVar: v }))
                  )}
                  {renderPillBtn(
                    'ifOp',
                    OP_LABELS[state.ifOperator],
                    state.ifOperator,
                    (Object.keys(OP_LABELS) as BotXmlWorkspaceState['ifOperator'][]).map((k) => ({
                      value: k,
                      label: OP_LABELS[k],
                    })),
                    (v) => onChange((prev) => ({ ...prev, ifOperator: v as any }))
                  )}
                  {renderValuePill(state.ifCompareValue, (nextVal) =>
                    onChange((prev) => ({ ...prev, ifCompareValue: nextVal }))
                  )}
                  <span>then</span>
                </div>

                {/* then Purchase slot */}
                <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                  <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[3px] px-2.5 py-1 flex items-center gap-1.5 w-fit">
                    <span>Purchase</span>
                    {renderPillBtn(
                      'thenPurchase',
                      getLegLabel(state.thenPurchase),
                      state.thenPurchase,
                      legChoices,
                      (v) => onChange((prev) => ({ ...prev, thenPurchase: v }))
                    )}
                  </div>
                </div>

                {state.elseEnabled ? (
                  <>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span>else</span>
                      <button
                        type="button"
                        title="Remove else"
                        onClick={() => onChange((prev) => ({ ...prev, elseEnabled: false }))}
                        className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                      <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[3px] px-2.5 py-1 flex items-center gap-1.5 w-fit">
                        <span>Purchase</span>
                        {renderPillBtn(
                          'elsePurchase',
                          getLegLabel(state.elsePurchase),
                          state.elsePurchase,
                          legChoices,
                          (v) => onChange((prev) => ({ ...prev, elsePurchase: v }))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    title="Add else branch"
                    onClick={() => onChange((prev) => ({ ...prev, elseEnabled: true }))}
                    className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-[#0A405C] h-5 w-[238px] rounded-b-[4px]" />
          </div>
        </div>

        {/* RIGHT STACK: BLOCK 4 (4. Restart trading conditions - matches Screenshot 210134) */}
        <div className="relative pt-3">
          <div className="bg-[#0A405C] text-white rounded-tl-[4px] rounded-tr-[4px] px-2.5 py-1.5 flex items-center gap-2 text-[11.5px] font-medium w-[238px] shadow-xs">
            <Flag className="w-3.5 h-3.5 text-white/90 shrink-0" />
            <span>4. Restart trading conditions</span>
          </div>

          <div className="border-l-[10px] border-[#0A405C] space-y-[2px]">
            {/* Update Stake And Side On Result with: resultIsWin (Result is [Win ▾]) */}
            <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit whitespace-nowrap">
              <span>Update Stake And Side On Result with: resultIsWin</span>
              <span className="px-2 py-[2px] rounded-full bg-[#EAECEF] dark:bg-[#171C26] border border-[#C6CBD2] dark:border-white/15 inline-flex items-center gap-1">
                <span>Result is</span>
                {renderPillBtn(
                  'restartResult',
                  state.restartResultCheck === 'win' ? 'Win' : 'Loss',
                  state.restartResultCheck,
                  [
                    { value: 'win', label: 'Win' },
                    { value: 'loss', label: 'Loss' },
                  ],
                  (v) => onChange((prev) => ({ ...prev, restartResultCheck: v as 'win' | 'loss' }))
                )}
              </span>
            </div>

            {/* if (Evaluate Profit And Loss Limits with: lastProfit Contract Details: [profit ▾]) then */}
            <div className="bg-[#E2E4E8] dark:bg-[#1E2532] border border-[#C6CBD2] dark:border-white/10 rounded-r-[3px] px-2.5 py-[5px] text-[11px] text-[#111319] dark:text-slate-200 w-fit space-y-1.5">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span>if</span>
                <span className="px-2.5 py-[2px] rounded-full bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C6CBD2] dark:border-white/15 inline-flex items-center gap-1">
                  <span>Evaluate Profit And Loss Limits with: lastProfit Contract Details:</span>
                  {renderPillBtn(
                    'restartDetail',
                    state.restartDetailField,
                    state.restartDetailField,
                    [
                      { value: 'profit', label: 'profit' },
                      { value: 'payout', label: 'payout' },
                      { value: 'buy_price', label: 'buy_price' },
                    ],
                    (v) => onChange((prev) => ({ ...prev, restartDetailField: v as any }))
                  )}
                </span>
                <span>then</span>
              </div>

              <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[3px] px-2.5 py-1 w-fit font-medium">
                  Trade again
                </div>
              </div>

              {state.restartElseEnabled ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span>else</span>
                    <button
                      type="button"
                      onClick={() => onChange((prev) => ({ ...prev, restartElseEnabled: false }))}
                      className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                    <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[3px] px-2.5 py-1 w-fit font-medium text-[#6B7280]">
                      Stop trading
                    </div>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  title="Toggle else"
                  onClick={() => onChange((prev) => ({ ...prev, restartElseEnabled: true }))}
                  className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          <div className="bg-[#0A405C] h-5 w-[238px] rounded-b-[4px]" />
        </div>
      </div>

      {/* BLOCKLY FLAT GREY #DCDCDC POPUP DROPDOWN MENU (Matches Screenshots 210512 & 210527) */}
      {popupMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: popupMenu.top,
            left: popupMenu.left,
            minWidth: popupMenu.width,
          }}
          className="z-[90] bg-[#DCDCDC] dark:bg-[#2A2F3D] border border-[#C2C6CC] dark:border-white/15 rounded-[2px] shadow-[0_6px_18px_rgba(0,0,0,0.22)] py-1 max-h-[340px] overflow-y-auto"
        >
          {popupMenu.choices.map((choice, idx) => {
            const active = choice.value === popupMenu.selectedValue;
            return (
              <button
                key={`${choice.value}-${idx}`}
                type="button"
                onClick={() => {
                  popupMenu.onSelect(choice.value);
                  setPopupMenu(null);
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-[13.5px] font-medium cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#CECECE] dark:bg-white/15 text-[#111319] dark:text-white'
                    : 'text-[#111319] dark:text-slate-100 hover:bg-[#D2D2D2] dark:hover:bg-white/10'
                }`}
              >
                <span className="w-4 flex items-center justify-center shrink-0">
                  {active && <Check className="w-3.5 h-3.5 text-[#111319] dark:text-white" strokeWidth={2.5} />}
                </span>
                <span className="truncate">{choice.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* CENTERED "Change value:" PROMPT MODAL (Matches Screenshot 210517) */}
      {valuePrompt && (
        <div
          onClick={() => setValuePrompt(null)}
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[330px] bg-[#2C2F36] text-white rounded-[22px] px-6 pt-5 pb-4 shadow-2xl border border-white/10"
          >
            <h4 className="text-[16px] font-medium text-white mb-3">Change value:</h4>
            <input
              type="text"
              autoFocus
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  valuePrompt.onConfirm(promptInput.trim() || valuePrompt.initialValue);
                  setValuePrompt(null);
                } else if (e.key === 'Escape') {
                  setValuePrompt(null);
                }
              }}
              className="w-full bg-transparent border-b border-white/70 focus:border-[#D4E157] py-1.5 text-[15px] text-white outline-none"
            />
            <div className="flex items-center justify-end gap-6 mt-6">
              <button
                type="button"
                onClick={() => setValuePrompt(null)}
                className="text-[13.5px] font-medium text-[#D8E27D] hover:text-white cursor-pointer px-2 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  valuePrompt.onConfirm(promptInput.trim() || valuePrompt.initialValue);
                  setValuePrompt(null);
                }}
                className="text-[13.5px] font-medium text-[#D8E27D] hover:text-white cursor-pointer px-2 py-1"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
