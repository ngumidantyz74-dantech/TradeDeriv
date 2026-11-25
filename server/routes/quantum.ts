import crypto from 'node:crypto';
import { Router } from 'express';
import { query, queryOne, execute, requireDb } from '../db.ts';
import { config } from '../config.ts';
import { randomId } from '../crypto.ts';
import { derivWs } from '../deriv-client.ts';
import { CURATED_DERIV_INSTRUMENTS } from '../catalog.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

export const QUANTUM_VALIDITY_SECONDS = 120;

const ALLOWED_DIGITAL_OR_BOT_CONTRACTS = new Set([
  'DIGITOVER',
  'DIGITUNDER',
  'DIGITEVEN',
  'DIGITODD',
  'DIGITMATCH',
  'DIGITDIFF',
  'CALL',
  'PUT',
  'CALLE',
  'PUTE',
  'HIGHER',
  'LOWER',
  'ACCU',
  'MULTUP',
  'MULTDOWN',
]);

function getQuantumHmacSecret(): string {
  return `${config.jwtSecret}:quantum-analyser-v1`;
}

export function computeQuantumHmac(params: {
  predictionId: string;
  userId: number;
  instrument: string;
  contractType: string;
  barrier: string;
  duration: number;
  durationUnit: string;
  stake: number;
  generatedAtIso: string;
  expiresAtIso: string;
}): string {
  const payload = [
    params.predictionId,
    String(params.userId),
    params.instrument.trim(),
    params.contractType.trim().toUpperCase(),
    String(params.barrier ?? '').trim(),
    String(params.duration),
    params.durationUnit.trim().toLowerCase(),
    Number(params.stake).toFixed(2),
    params.generatedAtIso,
    params.expiresAtIso,
  ].join('|');
  return crypto.createHmac('sha256', getQuantumHmacSecret()).update(payload).digest('hex');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const cleanA = String(a || '').trim().toLowerCase();
  const cleanB = String(b || '').trim().toLowerCase();
  if (!cleanA || cleanA.length !== cleanB.length || !/^[0-9a-f]+$/.test(cleanA)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cleanA, 'hex'), Buffer.from(cleanB, 'hex'));
}

function inferDerivMarketMeta(symbol: string): {
  marketList: string;
  submarketList: string;
  tradeTypeCat: string;
  tradeTypeList: string;
} {
  const s = symbol.toUpperCase();
  let marketList = 'Derived';
  let submarketList = 'Continuous Indices';
  if (s.startsWith('FRX')) {
    if (s.includes('XAU') || s.includes('XAG')) {
      marketList = 'Commodities';
      submarketList = 'Metals';
    } else {
      marketList = 'Forex';
      submarketList = 'Major Pairs';
    }
  } else if (s.startsWith('CRY')) {
    marketList = 'Cryptocurrencies';
    submarketList = 'Cryptocurrencies';
  } else if (s.startsWith('OTC_')) {
    marketList = 'Stock Indices';
    submarketList = 'American Indices';
  } else if (s.startsWith('BOOM') || s.startsWith('CRASH')) {
    submarketList = 'Crash/Boom Indices';
  } else if (s.startsWith('JD')) {
    submarketList = 'Jump Indices';
  }
  return {
    marketList,
    submarketList,
    tradeTypeCat: 'Digits',
    tradeTypeList: 'Matches/Differs',
  };
}

function inferCategoryMeta(contractType: string): { category: string; subtype: string } {
  const ct = contractType.toUpperCase();
  if (ct === 'DIGITMATCH' || ct === 'DIGITDIFF') return { category: 'Digits', subtype: 'Matches/Differs' };
  if (ct === 'DIGITOVER' || ct === 'DIGITUNDER') return { category: 'Digits', subtype: 'Over/Under' };
  if (ct === 'DIGITEVEN' || ct === 'DIGITODD') return { category: 'Digits', subtype: 'Even/Odd' };
  if (ct === 'ACCU') return { category: 'Options', subtype: 'Accumulators' };
  if (ct === 'MULTUP' || ct === 'MULTDOWN') return { category: 'Multipliers', subtype: 'Up/Down' };
  if (ct === 'HIGHER' || ct === 'LOWER') return { category: 'Up/Down', subtype: 'Higher/Lower' };
  return { category: 'Up/Down', subtype: 'Rise/Fall' };
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getOppositeLeg(contractType: string): string {
  const ct = contractType.toUpperCase();
  const map: Record<string, string> = {
    DIGITDIFF: 'DIGITMATCH',
    DIGITMATCH: 'DIGITDIFF',
    DIGITOVER: 'DIGITUNDER',
    DIGITUNDER: 'DIGITOVER',
    DIGITEVEN: 'DIGITODD',
    DIGITODD: 'DIGITEVEN',
    CALL: 'PUT',
    PUT: 'CALL',
    HIGHER: 'LOWER',
    LOWER: 'HIGHER',
    MULTUP: 'MULTDOWN',
    MULTDOWN: 'MULTUP',
    ACCU: 'ACCU',
  };
  return map[ct] || ct;
}

export function buildSignedQuantumBotXml(pred: {
  prediction_id: string;
  instrument: string;
  contract_type: string;
  predicted_condition: string;
  barrier: string;
  duration: number;
  duration_unit: string;
  stake: number;
  probability: number;
  loss_risk_score: number;
  generated_at: string | Date;
  expires_at: string | Date;
  signature_hmac: string;
}): string {
  const symMeta = inferDerivMarketMeta(pred.instrument);
  const catMeta = inferCategoryMeta(pred.contract_type);
  const generatedIso = new Date(pred.generated_at).toISOString();
  const expiresIso = new Date(pred.expires_at).toISOString();
  const stakeStr = Number(pred.stake).toFixed(2);
  const takeProfitStr = Number(Math.max(1.5, pred.stake * 3.5)).toFixed(2);
  const stopLossStr = Number(Math.max(2.0, pred.stake * 2.5)).toFixed(2);
  const oppLeg = getOppositeLeg(pred.contract_type);

  return `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true">
  <quantum_meta>
    <prediction_id>${escapeXml(pred.prediction_id)}</prediction_id>
    <instrument>${escapeXml(pred.instrument)}</instrument>
    <contract_type>${escapeXml(pred.contract_type)}</contract_type>
    <predicted_condition>${escapeXml(pred.predicted_condition)}</predicted_condition>
    <barrier>${escapeXml(pred.barrier)}</barrier>
    <duration>${escapeXml(String(pred.duration))}</duration>
    <duration_unit>${escapeXml(pred.duration_unit)}</duration_unit>
    <stake>${escapeXml(stakeStr)}</stake>
    <probability>${escapeXml(String(pred.probability))}</probability>
    <loss_risk_score>${escapeXml(String(pred.loss_risk_score))}</loss_risk_score>
    <generated_at>${escapeXml(generatedIso)}</generated_at>
    <expires_at>${escapeXml(expiresIso)}</expires_at>
    <signature_hmac>${escapeXml(pred.signature_hmac)}</signature_hmac>
  </quantum_meta>
  <variables>
    <variable>initialStake</variable>
    <variable>profitThreshold</variable>
    <variable>lossThreshold</variable>
    <variable>tradeSide</variable>
    <variable>msgInfo</variable>
  </variables>
  <block type="trade_definition" id="trade_def_quantum" x="40" y="20">
    <field name="MARKET_LIST">${escapeXml(symMeta.marketList)}</field>
    <field name="SUBMARKET_LIST">${escapeXml(symMeta.submarketList)}</field>
    <field name="SYMBOL_LIST">${escapeXml(pred.instrument)}</field>
    <field name="TRADETYPECAT_LIST">${escapeXml(catMeta.category)}</field>
    <field name="TRADETYPE_LIST">${escapeXml(catMeta.subtype)}</field>
    <field name="TYPE_LIST">${escapeXml(pred.contract_type)}</field>
    <field name="CANDLEINTERVAL_LIST">1m</field>
    <field name="TIME_MACHINE_ENABLED">FALSE</field>
    <field name="RESTARTONERROR">TRUE</field>
    <field name="MARTINGALE">1.25</field>
    <field name="MAX_TRADES">10</field>
    <statement name="INITIALIZATION">
      <block type="variables_set">
        <field name="VAR">initialStake</field>
        <value name="VALUE"><shadow type="math_number"><field name="NUM">${escapeXml(stakeStr)}</field></shadow></value>
      </block>
      <block type="variables_set">
        <field name="VAR">profitThreshold</field>
        <value name="VALUE"><shadow type="math_number"><field name="NUM">${escapeXml(takeProfitStr)}</field></shadow></value>
      </block>
      <block type="variables_set">
        <field name="VAR">lossThreshold</field>
        <value name="VALUE"><shadow type="math_number"><field name="NUM">${escapeXml(stopLossStr)}</field></shadow></value>
      </block>
      <block type="variables_set">
        <field name="VAR">tradeSide</field>
        <value name="VALUE"><shadow type="text"><field name="TEXT">${escapeXml(pred.contract_type)}</field></shadow></value>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions">
        <field name="DURATIONTYPE_LIST">${escapeXml(pred.duration_unit)}</field>
        <field name="DURATION">${escapeXml(String(pred.duration))}</field>
        <field name="PREDICTION">${escapeXml(pred.barrier || '0')}</field>
        <field name="AMOUNT">${escapeXml(stakeStr)}</field>
        <field name="GROWTHRATE">0.02</field>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="before_purchase_quantum" x="40" y="420">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="notify">
        <field name="NOTIFICATION_TYPE">green</field>
        <field name="NOTIFICATION_SOUND">Silent</field>
        <field name="MSG_VAR">msgInfo</field>
      </block>
      <block type="controls_if">
        <field name="LEFT_VAR">tradeSide</field>
        <field name="OP">EQ</field>
        <field name="RIGHT_VAL">${escapeXml(pred.contract_type)}</field>
        <field name="THEN_PURCHASE">${escapeXml(pred.contract_type)}</field>
        <field name="ELSE_ENABLED">FALSE</field>
        <field name="ELSE_PURCHASE">${escapeXml(oppLeg)}</field>
        <statement name="DO0">
          <block type="purchase">
            <field name="PURCHASE_LIST">${escapeXml(pred.contract_type)}</field>
          </block>
        </statement>
      </block>
    </statement>
  </block>
  <block type="after_purchase" id="after_purchase_quantum" x="520" y="20">
    <statement name="AFTERPURCHASE_STACK">
      <block type="update_stake_and_side">
        <field name="CHECK_RESULT">win</field>
      </block>
      <block type="controls_if">
        <field name="CONTRACT_DETAIL">profit</field>
        <field name="ELSE_ENABLED">FALSE</field>
        <statement name="DO0">
          <block type="trade_again" />
        </statement>
      </block>
    </statement>
  </block>
</xml>`;
}

/**
 * Validates that raw XML text is well-formed (strict opening/closing tag stack,
 * rejects <!DOCTYPE / <!ENTITY XXE, and checks required Deriv Blockly tags).
 */
function parseAndValidateXmlStructure(rawXml: string): {
  ok: boolean;
  error?: string;
  blockTypes: Set<string>;
  fields: Map<string, string>;
  quantumMeta: Record<string, string> | null;
} {
  const xml = String(rawXml || '').trim();
  const emptyResult = (error: string) => ({
    ok: false,
    error,
    blockTypes: new Set<string>(),
    fields: new Map<string, string>(),
    quantumMeta: null,
  });

  if (!xml || xml.length > 250_000) {
    return emptyResult('XML file is empty or exceeds the 250KB upload limit.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return emptyResult('XML external entity declarations (DOCTYPE / ENTITY) are blocked for security.');
  }
  if (/<script\b/i.test(xml)) {
    return emptyResult('Unsupported <script> elements detected inside XML.');
  }

  // Strip XML declaration and comments before structural tag stack verification
  let cleaned = xml
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  // Support valid partial Deriv DBot workspace snippets (e.g. Digitiff.xml starting at <statement name="TRADE_OPTIONS">)
  if (!/^<xml\b/i.test(cleaned) && /^<(?:statement|block|variables)\b/i.test(cleaned)) {
    cleaned = `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true">${cleaned}</xml>`;
  }

  if (!/^<xml\b/i.test(cleaned) || !/<\/xml>\s*$/i.test(cleaned)) {
    return emptyResult('Malformed Deriv Bot XML: root <xml>...</xml> element is missing.');
  }

  // Verify well-formed tag nesting via stack
  const tagRe = /<\/?([A-Za-z_][\w:.-]*)([^>]*)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  let tagCount = 0;

  while ((match = tagRe.exec(cleaned)) !== null) {
    tagCount++;
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = fullTag.endsWith('/>');

    if (isClosing) {
      const top = stack.pop();
      if (top !== tagName) {
        return emptyResult(`Malformed XML structure: unexpected closing tag </${tagName}>.`);
      }
    } else if (!isSelfClosing) {
      stack.push(tagName);
    }
  }

  if (tagCount < 3 || stack.length !== 0) {
    return emptyResult(`Malformed XML structure: unclosed tag <${stack[stack.length - 1] || 'unknown'}>.`);
  }

  // Extract block types
  const blockTypes = new Set<string>();
  const blockTypeRe = /<(?:block|shadow)\b[^>]*\btype=["']([^"']+)["']/gi;
  while ((match = blockTypeRe.exec(cleaned)) !== null) {
    blockTypes.add(match[1].trim().toLowerCase());
  }

  // Extract direct field values
  const fields = new Map<string, string>();
  const fieldRe = /<field\b[^>]*\bname=["']([^"']+)["'][^>]*>([^<]*)<\/field>/gi;
  while ((match = fieldRe.exec(cleaned)) !== null) {
    const k = match[1].trim().toUpperCase();
    const v = match[2].trim();
    if (k && v !== '' && !fields.has(k)) {
      fields.set(k, v);
    }
  }

  // Extract <value name="DURATION|AMOUNT|PREDICTION|TAKE_PROFIT|STOP_LOSS"><shadow|block><field name="NUM|TEXT">
  const valueShadowRe =
    /<value\b[^>]*\bname=["']([^"']+)["'][^>]*>\s*<(?:shadow|block)\b[^>]*>\s*<field\b[^>]*\bname=["'](?:NUM|TEXT)["'][^>]*>([^<]+)<\/field>/gi;
  while ((match = valueShadowRe.exec(cleaned)) !== null) {
    const k = match[1].trim().toUpperCase();
    const v = match[2].trim();
    if (k && v !== '' && !fields.has(k)) {
      fields.set(k, v);
    }
  }

  // Extract variables_set initialStake / martingale:initialStake / profitThreshold / lossThreshold / tradeSide / maxStake / Tick Count
  const varSetRe =
    /<block\b[^>]*type=["']variables_set["'][^>]*>\s*<field\b[^>]*name=["']VAR["'][^>]*>([^<]+)<\/field>[\s\S]*?<field\b[^>]*name=["'](?:NUM|TEXT|BOOL)["'][^>]*>([^<]+)<\/field>/gi;
  while ((match = varSetRe.exec(cleaned)) !== null) {
    const varName = match[1].trim().toLowerCase();
    const varVal = match[2].trim();
    if (varName && varVal !== '') {
      fields.set(`VAR:${varName}`, varVal);
    }
  }

  // Extract optional <quantum_meta>...</quantum_meta>
  let quantumMeta: Record<string, string> | null = null;
  const qmMatch = cleaned.match(/<quantum_meta>([\s\S]*?)<\/quantum_meta>/i);
  if (qmMatch) {
    quantumMeta = {};
    const inner = qmMatch[1];
    const childRe = /<([a-z_]+)>([^<]*)<\/\1>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = childRe.exec(inner)) !== null) {
      quantumMeta[cm[1].toLowerCase()] = cm[2].trim();
    }
  }

  const hasTradeDef = blockTypes.has('trade_definition') || blockTypes.has('trade');
  const hasTradeOpts =
    blockTypes.has('trade_definition_tradeoptions') ||
    blockTypes.has('trade_definition_accumulator') ||
    blockTypes.has('tradeoptions');
  const hasTradeSnippetCore =
    blockTypes.has('trade_definition_market') && blockTypes.has('trade_definition_contracttype');
  const hasBefore = blockTypes.has('before_purchase');
  const hasAfter = blockTypes.has('after_purchase');

  if (!hasTradeOpts || (!hasTradeSnippetCore && (!hasTradeDef || !hasBefore || !hasAfter))) {
    const missing: string[] = [];
    if (!hasTradeDef && !hasTradeSnippetCore) missing.push('trade_definition');
    if (!hasTradeOpts) missing.push('trade_definition_tradeoptions');
    if (!hasBefore && !hasTradeSnippetCore) missing.push('before_purchase');
    if (!hasAfter && !hasTradeSnippetCore) missing.push('after_purchase');
    return {
      ok: false,
      error: `Unsupported or incomplete Deriv Bot XML: missing required block(s) [${missing.join(', ')}].`,
      blockTypes,
      fields,
      quantumMeta,
    };
  }

  return { ok: true, blockTypes, fields, quantumMeta };
}

export async function expireStaleQuantumPredictions(userId?: number): Promise<void> {
  if (userId) {
    await execute(
      `UPDATE quantum_predictions
       SET validity_status = 'INVALID'
       WHERE user_id = $1 AND validity_status = 'VALID' AND expires_at <= NOW()`,
      [userId]
    );
  } else {
    await execute(
      `UPDATE quantum_predictions
       SET validity_status = 'INVALID'
       WHERE validity_status = 'VALID' AND expires_at <= NOW()`
    );
  }
}

export async function verifyAndConsumeQuantumPrediction(
  userId: number,
  predictionId: string,
  incrementExecution = false
): Promise<{ valid: boolean; reason?: string; prediction?: any; remainingSeconds: number }> {
  const cleanId = String(predictionId || '').trim();
  if (!cleanId) {
    return { valid: false, reason: 'Quantum prediction ID is required.', remainingSeconds: 0 };
  }

  await expireStaleQuantumPredictions(userId);

  const row = await queryOne<any>(
    `SELECT prediction_id, user_id, instrument, contract_type, predicted_condition, barrier,
            duration, duration_unit, stake, probability, loss_risk_score, spot_price,
            generated_at, expires_at, validity_status, executed_count, signature_hmac, rationale
     FROM quantum_predictions
     WHERE prediction_id = $1 AND user_id = $2`,
    [cleanId, userId]
  );

  if (!row) {
    return {
      valid: false,
      reason: 'Quantum prediction record not found for your account.',
      remainingSeconds: 0,
    };
  }

  const remainingMs = new Date(row.expires_at).getTime() - Date.now();
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

  if (row.validity_status !== 'VALID' || remainingMs <= 0) {
    if (row.validity_status === 'VALID') {
      await execute(
        `UPDATE quantum_predictions SET validity_status = 'INVALID' WHERE prediction_id = $1 AND user_id = $2`,
        [cleanId, userId]
      );
    }
    return {
      valid: false,
      reason: 'Quantum prediction has expired after its 2-minute (120s) validity window and is now INVALID. Run a new Quantum scan.',
      prediction: { ...row, validity_status: 'INVALID' },
      remainingSeconds: 0,
    };
  }

  const expectedHmac = computeQuantumHmac({
    predictionId: row.prediction_id,
    userId: row.user_id,
    instrument: row.instrument,
    contractType: row.contract_type,
    barrier: String(row.barrier ?? ''),
    duration: Number(row.duration),
    durationUnit: row.duration_unit,
    stake: Number(row.stake),
    generatedAtIso: new Date(row.generated_at).toISOString(),
    expiresAtIso: new Date(row.expires_at).toISOString(),
  });

  if (!timingSafeHexEqual(row.signature_hmac, expectedHmac)) {
    return {
      valid: false,
      reason: 'Quantum prediction signature mismatch.',
      remainingSeconds: 0,
    };
  }

  if (incrementExecution) {
    await execute(
      `UPDATE quantum_predictions
       SET executed_count = executed_count + 1
       WHERE prediction_id = $1 AND user_id = $2`,
      [cleanId, userId]
    );
  }

  return {
    valid: true,
    prediction: row,
    remainingSeconds,
  };
}

function selectMinimalLossSetup(
  symbol: string,
  prices: number[],
  pipSize: number,
  stake: number
): {
  contractType: string;
  predictedCondition: string;
  barrier: string;
  duration: number;
  durationUnit: string;
  probability: number;
  lossRiskScore: number;
  rationale: string;
} {
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const recent = prices.slice(-100);
  const digits = recent.map((p) => {
    const s = p.toFixed(decimals);
    return Number(s[s.length - 1] || 0);
  });

  const counts = Array(10).fill(0);
  digits.forEach((d) => {
    counts[d] = (counts[d] || 0) + 1;
  });

  // Evaluate candidate minimal-loss statistical profiles across synthetic/real tick history
  let minDigit = 0;
  let minFreq = Number.POSITIVE_INFINITY;
  for (let d = 0; d <= 9; d++) {
    if (counts[d] < minFreq) {
      minFreq = counts[d];
      minDigit = d;
    }
  }
  const n = Math.max(1, digits.length);
  const diffObservedWinPct = ((n - minFreq) / n) * 100;

  const over1Pct = (digits.filter((d) => d > 1).length / n) * 100;
  const under8Pct = (digits.filter((d) => d < 8).length / n) * 100;
  const evenCount = digits.filter((d) => d % 2 === 0).length;
  const evenPct = (evenCount / n) * 100;
  const oddPct = 100 - evenPct;

  // Check if symbol supports digit contracts (Volatility/Synthetic indices support Digits best)
  const isSyntheticDigit = /^(1HZ|R_|JD|BOOM|CRASH|STPIDX|RDBULL|RDBEAR)/i.test(symbol);

  if (isSyntheticDigit) {
    const candidates = [
      {
        contractType: 'DIGITDIFF',
        predictedCondition: `Exit last digit DIFFERS from ${minDigit}`,
        barrier: String(minDigit),
        probability: Number(Math.min(91.5, Math.max(85.0, diffObservedWinPct * 0.5 + 45)).toFixed(1)),
        lossRiskScore: Number((100 - Math.min(91.5, Math.max(85.0, diffObservedWinPct * 0.5 + 45))).toFixed(1)),
        rationale: `Minimal-loss profile: digit ${minDigit} appeared only ${minFreq}/${n} recent ticks on ${symbol}. Theoretical baseline non-match probability ~90%, calibrated for lower drawdown.`,
      },
      {
        contractType: 'DIGITOVER',
        predictedCondition: 'Exit last digit OVER 1',
        barrier: '1',
        probability: Number(Math.min(82.5, Math.max(75.0, over1Pct * 0.5 + 40)).toFixed(1)),
        lossRiskScore: Number((100 - Math.min(82.5, Math.max(75.0, over1Pct * 0.5 + 40))).toFixed(1)),
        rationale: `Minimal-loss profile: digits 2–9 occurred ${over1Pct.toFixed(1)}% over ${n} ticks on ${symbol}. Designed for conservative small-gain consistency.`,
      },
      {
        contractType: 'DIGITUNDER',
        predictedCondition: 'Exit last digit UNDER 8',
        barrier: '8',
        probability: Number(Math.min(82.5, Math.max(75.0, under8Pct * 0.5 + 40)).toFixed(1)),
        lossRiskScore: Number((100 - Math.min(82.5, Math.max(75.0, under8Pct * 0.5 + 40))).toFixed(1)),
        rationale: `Minimal-loss profile: digits 0–7 occurred ${under8Pct.toFixed(1)}% over ${n} ticks on ${symbol}. Lower loss variance compared to directional guesses.`,
      },
    ];

    candidates.sort((a, b) => a.lossRiskScore - b.lossRiskScore);
    const best = candidates[0];
    return {
      ...best,
      duration: 1,
      durationUnit: 't',
    };
  }

  // Forex / Commodities / Crypto -> directional Rise/Fall based on short-vs-medium EMA slope
  const last10 = recent.slice(-10);
  const avg10 = last10.reduce((a, b) => a + b, 0) / Math.max(1, last10.length);
  const lastSpot = recent[recent.length - 1] || avg10;
  const isBull = lastSpot >= avg10;
  const dirProb = Number(Math.min(64.5, Math.max(54.0, Math.max(evenPct, oddPct, 56))).toFixed(1));
  return {
    contractType: isBull ? 'CALL' : 'PUT',
    predictedCondition: isBull ? 'Spot closes HIGHER than entry (Rise)' : 'Spot closes LOWER than entry (Fall)',
    barrier: '0',
    duration: 15,
    durationUnit: 'm',
    probability: dirProb,
    lossRiskScore: Number((100 - dirProb).toFixed(1)),
    rationale: `Directional momentum scan on ${symbol}: spot ${lastSpot.toFixed(decimals)} vs 10-tick mean ${avg10.toFixed(decimals)} (${isBull ? 'bullish' : 'bearish'} tilt, non-guaranteed). Stake $${stake.toFixed(2)}.`,
  };
}

// 1. Run Quantum Analyser minimal-loss statistical scan & persist 120s HMAC-signed prediction
router.post('/quantum/scan', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const requestedSymbol = String(req.body?.symbol || '1HZ100V').trim();
  const stake = Number(Math.max(0.5, Math.min(5000, Number(req.body?.stake || 1))).toFixed(2));
  const validInstrument =
    CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === requestedSymbol)?.symbol || requestedSymbol;

  await expireStaleQuantumPredictions(userId);

  await derivWs.ensureSymbolSubscribed(validInstrument).catch(() => {});
  const prices = await derivWs.fetchTickHistory(validInstrument, 100);
  const latest = derivWs.getLatestTick(validInstrument);
  const spotPrice = latest?.quote ?? prices[prices.length - 1] ?? 1000;
  const pipSize = latest?.pipSize ?? 0.01;

  const setup = selectMinimalLossSetup(validInstrument, prices, pipSize, stake);
  const predictionId = `QP-${randomId(6).toUpperCase()}`;
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + QUANTUM_VALIDITY_SECONDS * 1000);
  const generatedAtIso = generatedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  const signatureHmac = computeQuantumHmac({
    predictionId,
    userId,
    instrument: validInstrument,
    contractType: setup.contractType,
    barrier: setup.barrier,
    duration: setup.duration,
    durationUnit: setup.durationUnit,
    stake,
    generatedAtIso,
    expiresAtIso,
  });

  const row = await queryOne<any>(
    `INSERT INTO quantum_predictions (
      prediction_id, user_id, instrument, contract_type, predicted_condition, barrier,
      duration, duration_unit, stake, probability, loss_risk_score, spot_price,
      generated_at, expires_at, validity_status, signature_hmac, rationale
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'VALID', $15, $16)
    RETURNING prediction_id, user_id, instrument, contract_type, predicted_condition, barrier,
              duration, duration_unit, stake, probability, loss_risk_score, spot_price,
              generated_at, expires_at, validity_status, executed_count, signature_hmac, rationale`,
    [
      predictionId,
      userId,
      validInstrument,
      setup.contractType,
      setup.predictedCondition,
      setup.barrier,
      setup.duration,
      setup.durationUnit,
      stake,
      setup.probability,
      setup.lossRiskScore,
      spotPrice,
      generatedAtIso,
      expiresAtIso,
      signatureHmac,
      setup.rationale,
    ]
  );

  res.status(201).json({
    prediction: {
      ...row,
      remainingSeconds: QUANTUM_VALIDITY_SECONDS,
    },
    disclaimer:
      'Minimal-loss statistical probability analysis only — trading outcomes are never guaranteed.',
  });
});

// 2. List user's Quantum predictions with live server-side 120s validity expiry enforcement
router.get('/quantum/predictions', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  await expireStaleQuantumPredictions(userId);

  const rows = await query<any>(
    `SELECT prediction_id, user_id, instrument, contract_type, predicted_condition, barrier,
            duration, duration_unit, stake, probability, loss_risk_score, spot_price,
            generated_at, expires_at, validity_status, executed_count, signature_hmac, rationale
     FROM quantum_predictions
     WHERE user_id = $1
     ORDER BY generated_at DESC
     LIMIT 25`,
    [userId]
  );

  const nowMs = Date.now();
  res.json({
    predictions: rows.map((r) => ({
      ...r,
      remainingSeconds:
        r.validity_status === 'VALID' ? Math.max(0, Math.floor((new Date(r.expires_at).getTime() - nowMs) / 1000)) : 0,
    })),
  });
});

// 3. Export signed Deriv Bot Blockly XML for an active Quantum prediction
router.get('/quantum/predictions/:predictionId/xml', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const check = await verifyAndConsumeQuantumPrediction(userId, String(req.params.predictionId || ''), false);
  if (!check.valid || !check.prediction) {
    res.status(check.prediction ? 410 : 404).json({
      error: check.reason || 'Prediction unavailable or expired.',
      code: 'QUANTUM_EXPIRED',
    });
    return;
  }

  const xml = buildSignedQuantumBotXml(check.prediction);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="quantum_${check.prediction.prediction_id.replace(/[^a-zA-Z0-9_-]/g, '')}.xml"`
  );
  res.send(xml);
});

// 4. Server-side validation of uploaded Bot Builder XML (Deriv structure + HMAC + 120s expiry)
router.post('/quantum/validate-xml', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const rawXml = String(req.body?.xml || '');
  const parsed = parseAndValidateXmlStructure(rawXml);

  if (!parsed.ok) {
    res.status(400).json({
      valid: false,
      error: parsed.error || 'Uploaded file is not a valid Deriv Bot XML strategy.',
      code: 'INVALID_XML',
    });
    return;
  }

  const symbol = parsed.fields.get('SYMBOL_LIST') || '1HZ100V';
  const rawTypeList = (parsed.fields.get('TYPE_LIST') || '').toUpperCase();
  const rawPurchase = (parsed.fields.get('PURCHASE_LIST') || parsed.fields.get('THEN_PURCHASE') || '').toUpperCase();
  const varSide = (parsed.fields.get('VAR:tradeside') || '').toUpperCase();
  const resolvedContract =
    rawPurchase ||
    (rawTypeList && rawTypeList !== 'BOTH' ? rawTypeList : varSide) ||
    (parsed.blockTypes.has('trade_definition_accumulator') ? 'ACCU' : '');
  const stake = Number(
    parsed.fields.get('AMOUNT') ||
      parsed.fields.get('VAR:initialstake') ||
      parsed.fields.get('VAR:initial_stake') ||
      parsed.fields.get('VAR:martingale:initialstake') ||
      1
  );
  const duration = Number(parsed.fields.get('DURATION') || 1);
  const durationUnit = (parsed.fields.get('DURATIONTYPE_LIST') || parsed.fields.get('DURATION_TYPE') || 't').toLowerCase();
  const barrier = parsed.fields.get('PREDICTION') ?? parsed.fields.get('GROWTHRATE_LIST') ?? '0';

  if (!symbol || symbol.length > 32) {
    res.status(400).json({ valid: false, error: 'XML is missing a valid market symbol (SYMBOL_LIST).', code: 'INVALID_SYMBOL' });
    return;
  }
  if (!Number.isFinite(stake) || stake < 0.35 || stake > 50000) {
    res.status(400).json({ valid: false, error: 'XML contains an invalid stake amount (must be between $0.35 and $50,000).', code: 'INVALID_STAKE' });
    return;
  }
  if (!resolvedContract || !ALLOWED_DIGITAL_OR_BOT_CONTRACTS.has(resolvedContract)) {
    res.status(400).json({
      valid: false,
      error: `Unsupported contract type "${resolvedContract || 'UNKNOWN'}" in uploaded XML.`,
      code: 'UNSUPPORTED_CONTRACT',
    });
    return;
  }

  // If XML contains Quantum Analyser metadata, strictly verify DB record, HMAC integrity, untampered fields, and 120s window
  if (parsed.quantumMeta) {
    const qm = parsed.quantumMeta;
    const predictionId = qm.prediction_id || '';
    const check = await verifyAndConsumeQuantumPrediction(userId, predictionId, false);
    if (!check.valid || !check.prediction) {
      res.status(check.prediction ? 410 : 403).json({
        valid: false,
        error: check.reason || 'Quantum XML prediction expired or unauthorized.',
        code: 'QUANTUM_EXPIRED',
      });
      return;
    }

    const row = check.prediction;
    if (!timingSafeHexEqual(qm.signature_hmac || '', row.signature_hmac)) {
      res.status(400).json({
        valid: false,
        error: 'Quantum XML HMAC signature verification failed. File appears tampered.',
        code: 'TAMPERED_XML',
      });
      return;
    }

    // Verify block fields inside XML match signed DB prediction (prevent editing <block> values while keeping <quantum_meta>)
    const metaMismatch =
      String(qm.instrument || '').trim() !== row.instrument ||
      String(qm.contract_type || '').trim().toUpperCase() !== String(row.contract_type).toUpperCase() ||
      String(symbol).trim() !== row.instrument ||
      String(resolvedContract).trim().toUpperCase() !== String(row.contract_type).toUpperCase() ||
      Number(stake).toFixed(2) !== Number(row.stake).toFixed(2) ||
      Number(duration) !== Number(row.duration) ||
      String(durationUnit).toLowerCase() !== String(row.duration_unit).toLowerCase();

    if (metaMismatch) {
      res.status(400).json({
        valid: false,
        error: 'Quantum XML parameters do not match the signed prediction record.',
        code: 'TAMPERED_XML',
      });
      return;
    }

    res.json({
      valid: true,
      isQuantum: true,
      quantumPrediction: {
        prediction_id: row.prediction_id,
        instrument: row.instrument,
        contract_type: row.contract_type,
        predicted_condition: row.predicted_condition,
        barrier: row.barrier,
        stake: row.stake,
        probability: row.probability,
        loss_risk_score: row.loss_risk_score,
        generated_at: row.generated_at,
        expires_at: row.expires_at,
        validity_status: row.validity_status,
        remainingSeconds: check.remainingSeconds,
      },
      summary: {
        symbol,
        contractType: resolvedContract,
        stake,
        duration,
        durationUnit,
        barrier,
      },
    });
    return;
  }

  res.json({
    valid: true,
    isQuantum: false,
    quantumPrediction: null,
    summary: {
      symbol,
      contractType: resolvedContract,
      stake,
      duration,
      durationUnit,
      barrier,
    },
  });
});

export default router;
