import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  Plus,
  Minus,
  X,
  RotateCcw,
  ChevronDown,
  ChevronRight,
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
  type AddedVisualBlock,
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
  previewOnly?: boolean;
}

const OP_LABELS: Record<BotXmlWorkspaceState['ifOperator'], string> = {
  EQ: '=',
  NEQ: '≠',
  GT: '>',
  LT: '<',
  GTE: '≥',
  LTE: '≤',
};

const ALL_TRADE_CATEGORIES: TradeCategoryName[] = [
  'Digits',
  'Up/Down',
  'Touch/No Touch',
  'In/Out',
  'Asians',
  'Reset Call/Reset Put',
  'High/Low Ticks',
  'Only Ups/Only Downs',
  'Multipliers',
  'Accumulators',
];

const BlockHeaderBadge: React.FC = () => (
  <span
    aria-hidden="true"
    className="w-[18px] h-[20px] rounded-[2px] border-[1.5px] border-[#8fc1d2] flex flex-col justify-center gap-[2px] px-[2.5px] shrink-0"
  >
    <span className="block h-[1.5px] w-full bg-[#d4e8ef]" />
    <span className="block h-[1.5px] w-full bg-[#d4e8ef]" />
    <span className="block h-[1.5px] w-full bg-[#d4e8ef]" />
  </span>
);

export const BotBlocklyCanvas: React.FC<BotBlocklyCanvasProps> = ({
  state,
  onChange,
  instruments,
  canvasZoom,
  onOpenQuickStrategy,
  previewOnly = false,
}) => {
  const [popupMenu, setPopupMenu] = useState<ActivePopupMenu | null>(null);
  const [valuePrompt, setValuePrompt] = useState<ActiveValuePrompt | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string>('market');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupCollapse = (groupId: string) => {
    if (previewOnly) return;
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Drag offset state for repositioning block groups smoothly
  const dragRef = useRef<{
    groupId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (!popupMenu) return;
    const handleOutside = () => setPopupMenu(null);
    window.addEventListener('scroll', handleOutside, true);
    return () => window.removeEventListener('scroll', handleOutside, true);
  }, [popupMenu]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const { groupId, startX, startY, origX, origY } = dragRef.current;
      const scale = Math.max(0.5, canvasZoom / 100);
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      onChange((prev) => ({
        ...prev,
        blockPositions: {
          ...(prev.blockPositions || {}),
          [groupId]: { x: Math.round(origX + dx), y: Math.round(origY + dy) },
        },
      }));
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [canvasZoom, onChange]);

  const startGroupDrag = (e: React.PointerEvent<HTMLDivElement>, groupId: string) => {
    if (previewOnly) return;
    if ((e.target as HTMLElement).closest('button,input,select')) return;
    e.stopPropagation();
    const pos = state.blockPositions?.[groupId] || { x: 0, y: 0 };
    dragRef.current = {
      groupId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
    setSelectedBlockId(groupId);
  };

  const getGroupTransform = (groupId: string): React.CSSProperties | undefined => {
    const pos = state.blockPositions?.[groupId];
    if (!pos || (pos.x === 0 && pos.y === 0)) return undefined;
    return { transform: `translate(${pos.x}px, ${pos.y}px)` };
  };

  const hasCustomPositions = Boolean(
    state.blockPositions && Object.values(state.blockPositions).some((p) => p.x !== 0 || p.y !== 0)
  );

  const openDropdown = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
    selectedValue: string,
    choices: DropdownChoice[],
    onSelect: (v: string) => void
  ) => {
    if (previewOnly) return;
    e.stopPropagation();
    setSelectedBlockId(id);
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
    const menuWidth = Math.max(175, Math.min(265, rect.width + 80));
    const clampedLeft = Math.max(10, Math.min(rect.left, vw - menuWidth - 10));
    const estHeight = Math.min(340, choices.length * 38 + 16);
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
    if (previewOnly) return;
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

  const availableVariables = useMemo(() => {
    const merged = new Set<string>(BOT_VARIABLES);
    for (const v of state.discoveredVariables || []) {
      if (v && v.trim()) merged.add(v.trim());
    }
    for (const a of state.assignments) {
      if (a.variable && a.variable.trim()) merged.add(a.variable.trim());
    }
    if (state.notifyVar && state.notifyVar.trim()) merged.add(state.notifyVar.trim());
    if (state.ifLeftVar && state.ifLeftVar.trim()) merged.add(state.ifLeftVar.trim());
    return Array.from(merged);
  }, [state.discoveredVariables, state.assignments, state.notifyVar, state.ifLeftVar]);

  const getLegLabel = (val: string) => {
    const found = legChoices.find((l) => l.value === val);
    if (found) return found.label;
    for (const st of TRADE_SUBTYPES) {
      const m = st.legs.find((l) => l.value === val);
      if (m) return m.label;
    }
    return val;
  };

  const removeCustomBlock = (id: string) => {
    if (previewOnly) return;
    onChange((prev) => ({
      ...prev,
      customBlocks: (prev.customBlocks || []).filter((b) => b.id !== id),
    }));
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
      className="px-2.5 py-[3px] rounded-full bg-white hover:bg-[#FAFAFA] dark:bg-[#151820] border border-[#c8cacc] dark:border-white/20 text-[12px] font-medium text-[#374151] dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer leading-tight shrink-0 shadow-[0_1px_1px_rgba(0,0,0,0.04)]"
    >
      <span className="truncate max-w-[180px]">{displayLabel}</span>
      <span className="text-[9.5px] text-[#111319] dark:text-slate-400">▾</span>
    </button>
  );

  const renderValuePill = (value: string, onConfirm: (nextVal: string) => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openValuePrompt(value, onConfirm);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        openValuePrompt(value, onConfirm);
      }}
      title="Tap to edit value"
      className="min-w-[28px] px-2.5 py-[3px] rounded-full bg-white hover:bg-[#FAFAFA] dark:bg-[#151820] border border-[#c8cacc] dark:border-white/20 text-[12px] font-medium text-[#374151] dark:text-slate-100 text-center cursor-pointer leading-tight shrink-0 shadow-[0_1px_1px_rgba(0,0,0,0.04)]"
    >
      {value}
    </button>
  );

  const selOutline = (blockId: string) =>
    !previewOnly && selectedBlockId === blockId
      ? 'ring-[3px] ring-[#f3c54e] shadow-[0_0_0_1px_#f8e5a7] relative z-20'
      : 'border border-[#c8cacc] dark:border-white/10';

  const renderCustomBlocksForSection = (section: AddedVisualBlock['section']) => {
    const items = (state.customBlocks || []).filter((b) => b.section === section);
    if (items.length === 0) return null;
    return items.map((blk) => (
      <div
        key={blk.id}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBlockId(blk.id);
        }}
        className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-[5px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit whitespace-nowrap cursor-pointer ${selOutline(blk.id)}`}
      >
        {blk.kind === 'if' && (
          <>
            <span>If</span>
            {renderPillBtn(
              `cb-left-${blk.id}`,
              blk.left || 'lossStreak',
              blk.left || 'lossStreak',
              availableVariables.map((v) => ({ value: v, label: v })),
              (v) =>
                onChange((prev) => ({
                  ...prev,
                  customBlocks: (prev.customBlocks || []).map((item) =>
                    item.id === blk.id ? { ...item, left: v } : item
                  ),
                }))
            )}
            {renderPillBtn(
              `cb-op-${blk.id}`,
              OP_LABELS[blk.op || 'LT'],
              blk.op || 'LT',
              (Object.keys(OP_LABELS) as BotXmlWorkspaceState['ifOperator'][]).map((k) => ({
                value: k,
                label: OP_LABELS[k],
              })),
              (v) =>
                onChange((prev) => ({
                  ...prev,
                  customBlocks: (prev.customBlocks || []).map((item) =>
                    item.id === blk.id ? { ...item, op: v as any } : item
                  ),
                }))
            )}
            {renderValuePill(blk.right || 'lossThreshold', (v) =>
              onChange((prev) => ({
                ...prev,
                customBlocks: (prev.customBlocks || []).map((item) =>
                  item.id === blk.id ? { ...item, right: v } : item
                ),
              }))
            )}
          </>
        )}
        {blk.kind === 'set' && (
          <>
            <span>set</span>
            {renderPillBtn(
              `cb-set-${blk.id}`,
              blk.left || 'tradeSide',
              blk.left || 'tradeSide',
              availableVariables.map((v) => ({ value: v, label: v })),
              (v) =>
                onChange((prev) => ({
                  ...prev,
                  customBlocks: (prev.customBlocks || []).map((item) =>
                    item.id === blk.id ? { ...item, left: v } : item
                  ),
                }))
            )}
            <span>to</span>
            {renderValuePill(blk.value || '0', (v) =>
              onChange((prev) => ({
                ...prev,
                customBlocks: (prev.customBlocks || []).map((item) =>
                  item.id === blk.id ? { ...item, value: v } : item
                ),
              }))
            )}
          </>
        )}
        {blk.kind === 'purchase' && (
          <>
            <span className="font-medium">Purchase</span>
            {renderPillBtn(
              `cb-pur-${blk.id}`,
              getLegLabel(blk.contract || state.thenPurchase),
              blk.contract || state.thenPurchase,
              legChoices,
              (v) =>
                onChange((prev) => ({
                  ...prev,
                  customBlocks: (prev.customBlocks || []).map((item) =>
                    item.id === blk.id ? { ...item, contract: v } : item
                  ),
                }))
            )}
          </>
        )}
        {blk.kind === 'notify' && (
          <>
            <span>Notify</span>
            {renderValuePill(blk.value || 'Signal active', (v) =>
              onChange((prev) => ({
                ...prev,
                customBlocks: (prev.customBlocks || []).map((item) =>
                  item.id === blk.id ? { ...item, value: v } : item
                ),
              }))
            )}
          </>
        )}
        {blk.kind === 'stop' && <span className="font-semibold text-[#b91c1c] dark:text-[#FF444F]">Stop bot</span>}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeCustomBlock(blk.id);
          }}
          title="Remove block"
          className="ml-1 w-4 h-4 rounded-full bg-black/15 hover:bg-black/25 dark:bg-white/15 flex items-center justify-center cursor-pointer"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    ));
  };

  const candleLabel =
    CANDLE_INTERVALS.find((c) => c.value === state.candleInterval)?.label || '1 minute';
  const durationUnitLabel =
    DURATION_UNITS.find((u) => u.value === state.durationUnit)?.label || 'Ticks';

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-[#0B0E14]">
      {/* Scrollable Dotted Blockly Workspace */}
      <div
        onClick={() => setPopupMenu(null)}
        className={`relative flex-1 overflow-auto bg-[radial-gradient(#e4e7e9_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2634_1px,transparent_1px)] [background-size:22px_22px] ${
          previewOnly ? 'px-2.5 py-2.5' : 'px-4 py-4'
        }`}
      >
        {/* Top-Left Quick Strategy Red Button + Optional Reset Layout */}
        {!previewOnly && (
          <div className="mb-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onOpenQuickStrategy}
              className="px-4 py-[9px] rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold shadow-xs cursor-pointer"
            >
              Quick strategy
            </button>

            {hasCustomPositions && (
              <button
                type="button"
                onClick={() => onChange((prev) => ({ ...prev, blockPositions: {} }))}
                className="px-2.5 py-1.5 rounded-[4px] bg-white/90 dark:bg-[#151820] border border-slate-200 dark:border-white/15 text-[11px] font-semibold text-[#525866] dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Align blocks
              </button>
            )}
          </div>
        )}

        {/* Horizontal Blockly Workspace Canvas */}
        <div
          className="flex flex-row items-start gap-9 pb-16 min-w-max origin-top-left transition-transform"
          style={{ transform: `scale(${canvasZoom / 100})` }}
        >
          {/* LEFT STACK: BLOCK 1 (Trade parameters) + BLOCK 2 (Purchase conditions) + BLOCK 3 (Sell conditions) */}
          <div className="flex flex-col gap-8 items-start pl-2">
            {/* BLOCK 1: 1. Trade parameters */}
            <div className="relative" style={getGroupTransform('group-trade-def')}>
              <div
                onPointerDown={(e) => startGroupDrag(e, 'group-trade-def')}
                className={`relative bg-[#07516b] text-white rounded-t-[5px] px-3 py-2 flex items-center justify-between gap-2 text-[13px] font-normal w-[258px] shadow-xs ${
                  previewOnly ? '' : 'cursor-grab active:cursor-grabbing'
                } select-none ${
                  !previewOnly && selectedBlockId === 'group-trade-def' ? 'ring-[3px] ring-[#f3c54e]' : ''
                } ${collapsedGroups['group-trade-def'] ? 'rounded-b-[5px]' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BlockHeaderBadge />
                  <span className="truncate">1. Trade parameters</span>
                </div>
                {!previewOnly && (
                  <button
                    type="button"
                    aria-label="Collapse or expand Trade parameters"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupCollapse('group-trade-def');
                    }}
                    className="p-0.5 rounded hover:bg-white/15 text-white/85 cursor-pointer shrink-0"
                  >
                    {collapsedGroups['group-trade-def'] ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                {!collapsedGroups['group-trade-def'] && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[28px] -bottom-[8px] w-[38px] h-[10px] bg-[#07516b] rounded-b-[14px] z-10"
                  />
                )}
              </div>

              {/* C-Block Body */}
              {!collapsedGroups['group-trade-def'] && (
                <div className="border-l-[10px] border-[#07516b] bg-transparent pt-[2px]">
                <div className="space-y-[3px]">
                  {/* Market: Market > Submarket > Symbol */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('market');
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 whitespace-nowrap cursor-pointer ${selOutline('market')}`}
                  >
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
                    <span className="text-[#4B5563] text-[13px]">&gt;</span>
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
                    <span className="text-[#4B5563] text-[13px]">&gt;</span>
                    {renderPillBtn(
                      'symbol',
                      activeSymbolLabel,
                      state.symbol,
                      symbolsForSubmarket.map((s) => ({ value: s.symbol, label: s.label })),
                      (nextSym) => onChange((prev) => ({ ...prev, symbol: nextSym }))
                    )}
                  </div>

                  {/* Trade Type: Category (ALL 10 categories) > Subtype */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('tradeType');
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit whitespace-nowrap cursor-pointer ${selOutline('tradeType')}`}
                  >
                    <span>Trade Type:</span>
                    {renderPillBtn(
                      'tradeCat',
                      state.tradeCategory,
                      state.tradeCategory,
                      ALL_TRADE_CATEGORIES.map((c) => ({ value: c, label: c })),
                      (nextCat) => {
                        const cat = nextCat as TradeCategoryName;
                        const subDef = resolveSubtypeDef(cat, '');
                        onChange((prev) => ({
                          ...prev,
                          tradeCategory: cat,
                          tradeSubtype: subDef.subtype,
                          contractTypeSelection: subDef.isAccu ? 'ACCU' : 'Both',
                          thenPurchase: subDef.legs[0].value,
                          elsePurchase: subDef.legs[1]?.value || subDef.legs[0].value,
                        }));
                      }
                    )}
                    <span className="text-[#4B5563] text-[13px]">&gt;</span>
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
                          contractTypeSelection: subDef.isAccu ? 'ACCU' : 'Both',
                          thenPurchase: subDef.legs[0].value,
                          elsePurchase: subDef.legs[1]?.value || subDef.legs[0].value,
                        }));
                      }
                    )}
                  </div>

                  {/* Contract Type: [Both ▾] */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('contractType');
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline('contractType')}`}
                  >
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
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('candleInterval');
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline('candleInterval')}`}
                  >
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('errBuySell');
                      onChange((prev) => ({ ...prev, restartBuySellOnError: !prev.restartBuySellOnError }));
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-2 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline('errBuySell')}`}
                  >
                    <span>Restart buy/sell on error (disable for better performance):</span>
                    <span className="w-[16px] h-[16px] rounded-[2px] bg-white border border-[#B9C0CA] flex items-center justify-center text-[11px] font-bold text-[#111319] shrink-0">
                      {state.restartBuySellOnError ? '✓' : ''}
                    </span>
                  </div>

                  {/* Restart last trade on error */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('errLastTrade');
                      onChange((prev) => ({
                        ...prev,
                        restartLastTradeOnError: !prev.restartLastTradeOnError,
                      }));
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-2 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline('errLastTrade')}`}
                  >
                    <span>Restart last trade on error (bot ignores the unsuccessful trade):</span>
                    <span className="w-[16px] h-[16px] rounded-[2px] bg-white border border-[#B9C0CA] flex items-center justify-center text-[11px] font-bold text-[#111319] shrink-0">
                      {state.restartLastTradeOnError ? '✓' : ''}
                    </span>
                  </div>
                </div>

                {/* Run once at start: Middle C-divider */}
                <div className="mt-1.5">
                  <div className="relative bg-[#07516b] text-white px-3 py-2 text-[12.5px] font-normal w-[248px]">
                    <span>Run once at start:</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[24px] -bottom-[7px] w-[34px] h-[9px] bg-[#07516b] rounded-b-[12px] z-10"
                    />
                  </div>
                  <div className="border-l-[10px] border-[#07516b] space-y-[3px] pb-1 pt-[2px]">
                    {state.assignments.map((row) => (
                      <div
                        key={row.id}
                        onClick={(e) => {
                          if (previewOnly) return;
                          e.stopPropagation();
                          setSelectedBlockId(`assign-row-${row.id}`);
                        }}
                        className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[5px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline(`assign-row-${row.id}`)}`}
                      >
                        <span>set</span>
                        {renderPillBtn(
                          `assign-${row.id}`,
                          row.variable,
                          row.variable,
                          availableVariables.map((v) => ({ value: v, label: v })),
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
                  <div className="relative bg-[#07516b] text-white px-3 py-2 text-[12.5px] font-normal w-[248px]">
                    <span>Trade options:</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[24px] -bottom-[7px] w-[34px] h-[9px] bg-[#07516b] rounded-b-[12px] z-10"
                    />
                  </div>
                  <div className="border-l-[10px] border-[#07516b] pb-1 pt-[2px]">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBlockId('tradeOptions');
                      }}
                      className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit whitespace-nowrap cursor-pointer ${selOutline('tradeOptions')}`}
                    >
                      {!activeSubtypeDef.isAccu && (
                        <>
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
                        </>
                      )}
                      <span>Stake: USD</span>
                      {renderValuePill(
                        state.assignments.find((a) => a.variable === 'initialStake')?.value || '1',
                        (nextStake) =>
                          onChange((prev) => ({
                            ...prev,
                            assignments: setAssignmentVal(prev.assignments, 'initialStake', nextStake),
                          }))
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
                          <span>Take Profit:</span>
                          {renderValuePill(
                            state.accumulatorTakeProfit ||
                              state.assignments.find((a) => a.variable === 'profitThreshold')?.value ||
                              '5',
                            (nextTp) =>
                              onChange((prev) => ({
                                ...prev,
                                accumulatorTakeProfit: nextTp,
                              }))
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              )}

              {/* Bottom C-Block Footer Cap */}
              {!collapsedGroups['group-trade-def'] && (
                <div className="bg-[#07516b] h-5 w-[258px] rounded-b-[6px]" />
              )}
            </div>

            {/* BLOCK 2: 2. Purchase conditions (with exact #D99B26 gold top highlight) */}
            <div className="relative" style={getGroupTransform('group-before-purchase')}>
              <div
                onPointerDown={(e) => startGroupDrag(e, 'group-before-purchase')}
                className={`relative bg-[#07516b] border-t-[3px] border-t-[#D99B26] text-white rounded-t-[5px] px-3 py-2 flex items-center justify-between gap-2 text-[13px] font-normal w-[258px] shadow-xs ${
                  previewOnly ? '' : 'cursor-grab active:cursor-grabbing'
                } select-none ${
                  !previewOnly && selectedBlockId === 'group-before-purchase' ? 'ring-[3px] ring-[#f3c54e]' : ''
                } ${collapsedGroups['group-before-purchase'] ? 'rounded-b-[5px]' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BlockHeaderBadge />
                  <span className="truncate">2. Purchase conditions</span>
                </div>
                {!previewOnly && (
                  <button
                    type="button"
                    aria-label="Collapse or expand Purchase conditions"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupCollapse('group-before-purchase');
                    }}
                    className="p-0.5 rounded hover:bg-white/15 text-white/85 cursor-pointer shrink-0"
                  >
                    {collapsedGroups['group-before-purchase'] ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                {!collapsedGroups['group-before-purchase'] && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[28px] -bottom-[8px] w-[38px] h-[10px] bg-[#07516b] rounded-b-[14px] z-10"
                  />
                )}
              </div>

              {!collapsedGroups['group-before-purchase'] && (
                <>
                  <div className="border-l-[10px] border-[#07516b] space-y-[3px] pt-[2px]">
                {/* set [msgInfo ▾] to create text with (+) */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId('textJoin');
                  }}
                  className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] pl-3 pr-2.5 py-2 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline('textJoin')}`}
                >
                  <div className="flex items-center gap-1.5 pb-1.5">
                    <span>set</span>
                    {renderPillBtn(
                      'notifyVarTop',
                      state.notifyVar,
                      state.notifyVar,
                      availableVariables.map((v) => ({ value: v, label: v })),
                      (v) => onChange((prev) => ({ ...prev, notifyVar: v }))
                    )}
                    <span>to</span>
                    <span className="font-medium">create text with</span>
                    <button
                      type="button"
                      title="Add item"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange((prev) => ({
                          ...prev,
                          notifyParts: [
                            ...prev.notifyParts,
                            { id: `p-${Date.now()}`, kind: 'text', value: 'text' },
                          ],
                        }));
                      }}
                      className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Nested create text slots with (-) buttons */}
                  <div className="ml-4 border-l-4 border-[#C8CCD4] dark:border-white/15 pl-2.5 space-y-1.5 py-1.5 bg-[#EAECEF] dark:bg-[#171C26] rounded-[4px] pr-2.5">
                    {state.notifyParts.map((part) => (
                      <div key={part.id} className="flex items-center gap-1.5">
                        {part.kind === 'var'
                          ? renderPillBtn(
                              `npart-${part.id}`,
                              part.value,
                              part.value,
                              availableVariables.map((v) => ({ value: v, label: v })),
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
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange((prev) => ({
                              ...prev,
                              notifyParts: prev.notifyParts.filter((p) => p.id !== part.id),
                            }));
                          }}
                          className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notify [blue ▾] with sound: [Silent ▾] [msgInfo ▾] */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId('notify');
                  }}
                  className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit whitespace-nowrap cursor-pointer ${selOutline('notify')}`}
                >
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
                    availableVariables.map((v) => ({ value: v, label: v })),
                    (v) => onChange((prev) => ({ ...prev, notifyVar: v }))
                  )}
                </div>

                {state.beforeHasIf === false ? (
                  <div
                    onClick={(e) => {
                      if (previewOnly) return;
                      e.stopPropagation();
                      setSelectedBlockId('directPurchase');
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-2 text-[12px] text-[#374151] dark:text-slate-200 w-fit cursor-pointer ${selOutline('directPurchase')}`}
                  >
                    <span className="font-medium">Purchase</span>
                    {renderPillBtn(
                      'thenPurchase',
                      getLegLabel(state.thenPurchase),
                      state.thenPurchase,
                      legChoices,
                      (v) => onChange((prev) => ({ ...prev, thenPurchase: v }))
                    )}
                  </div>
                ) : (
                  /* if [tradeSide ▾] [= ▾] (CALL) then Purchase [Rise ▾] else Purchase [Fall ▾] */
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId('ifPurchase');
                    }}
                    className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] text-[12px] text-[#374151] dark:text-slate-200 w-fit space-y-2 cursor-pointer ${selOutline('ifPurchase')}`}
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>if</span>
                      {renderPillBtn(
                        'ifLeftVar',
                        state.ifLeftVar,
                        state.ifLeftVar,
                        availableVariables.map((v) => ({ value: v, label: v })),
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
                      <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#e5b735] rounded-[4px] px-2.5 py-1.5 flex items-center gap-1.5 w-fit">
                        <span className="font-medium">Purchase</span>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onChange((prev) => ({ ...prev, elseEnabled: false }));
                            }}
                            className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                          <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[4px] px-2.5 py-1.5 flex items-center gap-1.5 w-fit">
                            <span className="font-medium">Purchase</span>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange((prev) => ({ ...prev, elseEnabled: true }));
                        }}
                        className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                )}

                {renderCustomBlocksForSection('purchase')}
                  </div>

                  <div className="bg-[#07516b] h-5 w-[258px] rounded-b-[6px]" />
                </>
              )}
            </div>

            {/* BLOCK 3: 3. Sell conditions (during_purchase) */}
            {(state.hasSellConditions || activeSubtypeDef.isAccu) && (
              <div className="relative" style={getGroupTransform('group-during-purchase')}>
                <div
                  onPointerDown={(e) => startGroupDrag(e, 'group-during-purchase')}
                  className={`relative bg-[#07516b] border-t-[3px] border-t-[#D99B26] text-white rounded-t-[5px] px-3 py-2 flex items-center justify-between gap-2 text-[13px] font-normal w-[258px] shadow-xs ${
                    previewOnly ? '' : 'cursor-grab active:cursor-grabbing'
                  } select-none ${
                    !previewOnly && selectedBlockId === 'group-during-purchase' ? 'ring-[3px] ring-[#f3c54e]' : ''
                  } ${collapsedGroups['group-during-purchase'] ? 'rounded-b-[5px]' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BlockHeaderBadge />
                    <span className="truncate">3. Sell conditions</span>
                  </div>
                  {!previewOnly && (
                    <button
                      type="button"
                      aria-label="Collapse or expand Sell conditions"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupCollapse('group-during-purchase');
                      }}
                      className="p-0.5 rounded hover:bg-white/15 text-white/85 cursor-pointer shrink-0"
                    >
                      {collapsedGroups['group-during-purchase'] ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {!collapsedGroups['group-during-purchase'] && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[28px] -bottom-[8px] w-[38px] h-[10px] bg-[#07516b] rounded-b-[14px] z-10"
                    />
                  )}
                </div>
                {!collapsedGroups['group-during-purchase'] && (
                  <>
                    <div className="border-l-[10px] border-[#07516b] space-y-[3px] pt-[2px]">
                      <div
                        onClick={(e) => {
                          if (previewOnly) return;
                          e.stopPropagation();
                          setSelectedBlockId('sellCond');
                        }}
                        className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] text-[12px] text-[#374151] dark:text-slate-200 w-fit space-y-2 cursor-pointer ${selOutline('sellCond')}`}
                      >
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span>if</span>
                          <span className="px-2.5 py-[3px] rounded-full bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C6CBD2] dark:border-white/15">
                            Sell is available
                          </span>
                          <span>&amp;</span>
                          {renderPillBtn(
                            'sellMode',
                            state.sellByCountdown ? 'Count Down' : 'Take Profit',
                            state.sellByCountdown ? 'countdown' : 'tp',
                            [
                              { value: 'tp', label: 'Take Profit' },
                              { value: 'countdown', label: 'Count Down' },
                            ],
                            (v) => onChange((prev) => ({ ...prev, sellByCountdown: v === 'countdown' }))
                          )}
                          {state.sellByCountdown && (
                            <>
                              <span>Tick Count &gt;</span>
                              {renderValuePill(state.sellTickCount || '0', (nextTicks) =>
                                onChange((prev) => ({ ...prev, sellTickCount: nextTicks }))
                              )}
                            </>
                          )}
                          <span>then</span>
                        </div>
                        <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                          <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[4px] px-2.5 py-1.5 w-fit font-medium">
                            Sell at market
                          </div>
                        </div>
                      </div>
                      {renderCustomBlocksForSection('sell')}
                    </div>
                    <div className="bg-[#07516b] h-5 w-[258px] rounded-b-[6px]" />
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT STACK: BLOCK 4 (4. Restart trading conditions) + Any Parsed XML Procedure Cards */}
          <div className="flex flex-col gap-7 items-start pt-3">
            <div className="relative" style={getGroupTransform('group-after-purchase')}>
              <div
                onPointerDown={(e) => startGroupDrag(e, 'group-after-purchase')}
                className={`relative bg-[#07516b] text-white rounded-t-[5px] px-3 py-2 flex items-center justify-between gap-2 text-[13px] font-normal w-[258px] shadow-xs ${
                  previewOnly ? '' : 'cursor-grab active:cursor-grabbing'
                } select-none ${
                  !previewOnly && selectedBlockId === 'group-after-purchase' ? 'ring-[3px] ring-[#f3c54e]' : ''
                } ${collapsedGroups['group-after-purchase'] ? 'rounded-b-[5px]' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BlockHeaderBadge />
                  <span className="truncate">4. Restart trading conditions</span>
                </div>
                {!previewOnly && (
                  <button
                    type="button"
                    aria-label="Collapse or expand Restart trading conditions"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupCollapse('group-after-purchase');
                    }}
                    className="p-0.5 rounded hover:bg-white/15 text-white/85 cursor-pointer shrink-0"
                  >
                    {collapsedGroups['group-after-purchase'] ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                {!collapsedGroups['group-after-purchase'] && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[28px] -bottom-[8px] w-[38px] h-[10px] bg-[#07516b] rounded-b-[14px] z-10"
                  />
                )}
              </div>

              {!collapsedGroups['group-after-purchase'] && (
                <>
                  <div className="border-l-[10px] border-[#07516b] space-y-[3px] pt-[2px]">
                {/* Update Stake And Side On Result with: resultIsWin (Result is [Win ▾]) */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId('restartUpdate');
                  }}
                  className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-slate-200 w-fit whitespace-nowrap cursor-pointer ${selOutline('restartUpdate')}`}
                >
                  <span>{state.updateProcedureName || 'Update Stake And Side On Result with: resultIsWin'}</span>
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
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId('restartIf');
                  }}
                  className={`bg-[#e2e3e5] dark:bg-[#1E2532] rounded-r-[4px] px-3 py-[6px] text-[12px] text-[#374151] dark:text-slate-200 w-fit space-y-2 cursor-pointer ${selOutline('restartIf')}`}
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span>if</span>
                    <span className="px-2.5 py-[3px] rounded-full bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C6CBD2] dark:border-white/15 inline-flex items-center gap-1">
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
                    <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[4px] px-2.5 py-1.5 w-fit font-medium">
                      Trade again
                    </div>
                  </div>

                  {state.restartElseEnabled ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span>else</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange((prev) => ({ ...prev, restartElseEnabled: false }));
                          }}
                          className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <div className="pl-3 border-l-4 border-[#C5CAD2] dark:border-white/15">
                        <div className="bg-[#ECEEF1] dark:bg-[#171C26] border border-[#C5CAD2] dark:border-white/10 rounded-[4px] px-2.5 py-1.5 w-fit font-medium text-[#6B7280]">
                          Stop trading
                        </div>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      title="Toggle else"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange((prev) => ({ ...prev, restartElseEnabled: true }));
                      }}
                      className="w-4 h-4 rounded-full bg-[#111319] text-white flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {renderCustomBlocksForSection('restart')}
                  </div>

                  <div className="bg-[#07516b] h-5 w-[258px] rounded-b-[6px]" />
                </>
              )}
            </div>

            {/* Render Imported Procedure / Function Groups from uploaded DBot XMLs */}
            {(state.importedGroups || []).map((grp) => {
              const procKey = `proc-${grp.id}`;
              const isCollapsed = Boolean(collapsedGroups[procKey]);
              return (
                <div
                  key={grp.id}
                  style={getGroupTransform(procKey)}
                  className="relative"
                >
                  <div
                    onPointerDown={(e) => startGroupDrag(e, procKey)}
                    className={`relative bg-[#07516b] text-white rounded-t-[5px] px-3 py-2 flex items-center justify-between gap-2 text-[12.5px] font-normal min-w-[258px] max-w-[360px] shadow-xs ${
                      previewOnly ? '' : 'cursor-grab active:cursor-grabbing'
                    } select-none ${
                      !previewOnly && selectedBlockId === procKey ? 'ring-[3px] ring-[#f3c54e]' : ''
                    } ${isCollapsed ? 'rounded-b-[5px]' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BlockHeaderBadge />
                      <span className="truncate">{grp.title}</span>
                    </div>
                    {!previewOnly && (
                      <button
                        type="button"
                        aria-label={`Collapse or expand ${grp.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupCollapse(procKey);
                        }}
                        className="p-0.5 rounded hover:bg-white/15 text-white/85 cursor-pointer shrink-0"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    {!isCollapsed && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-[28px] -bottom-[8px] w-[38px] h-[10px] bg-[#07516b] rounded-b-[14px] z-10"
                      />
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <div className="border-l-[10px] border-[#07516b] space-y-[3px] pt-[2px]">
                        {grp.lines.map((line, i) => (
                          <div
                            key={`${grp.id}-${i}`}
                            className="bg-[#e2e3e5] dark:bg-[#1E2532] border border-[#c8cacc] dark:border-white/10 rounded-r-[4px] px-3 py-[5px] text-[11.5px] text-[#374151] dark:text-slate-200 max-w-[340px] truncate"
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                      <div className="bg-[#07516b] h-4 w-[258px] rounded-b-[6px]" />
                    </>
                  )}
                </div>
              );
            })}
            {(state.customBlocks || []).some((b) => b.section === 'canvas') && (
              <div className="space-y-2">{renderCustomBlocksForSection('canvas')}</div>
            )}
          </div>
        </div>
      </div>

      {/* BLOCKLY FLAT #e6e6e6 POPUP DROPDOWN MENU (Matches Screenshot 210512 (1)) */}
      {popupMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: popupMenu.top,
            left: popupMenu.left,
            minWidth: popupMenu.width,
          }}
          className="z-[90] bg-[#e6e6e6] dark:bg-[#2A2F3D] border border-[#c2c6cc] dark:border-white/15 rounded-[2px] shadow-[0_6px_18px_rgba(0,0,0,0.22)] py-1 max-h-[340px] overflow-y-auto"
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
                className={`w-full px-3 py-2 flex items-center gap-2.5 text-left text-[13.5px] font-bold cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#d0d0d0] dark:bg-white/15 text-[#111111] dark:text-white'
                    : 'text-[#111111] dark:text-slate-100 hover:bg-[#dadada] dark:hover:bg-white/10'
                }`}
              >
                <span className="w-4 flex items-center justify-center shrink-0">
                  {active && <Check className="w-4 h-4 text-[#111111] dark:text-white" strokeWidth={2.5} />}
                </span>
                <span className="truncate">{choice.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* CENTERED "Change value:" PROMPT MODAL */}
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
