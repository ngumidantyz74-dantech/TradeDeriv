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
  'ONETOUCH',
  'NOTOUCH',
  'EXPIRYRANGE',
  'EXPIRYMISS',
  'ENDSIN',
  'ENDSOUT',
  'ASIANU',
  'ASIAND',
  'RESETCALL',
  'RESETPUT',
  'TICKHIGH',
  'TICKLOW',
  'RUNHIGH',
  'RUNLOW',
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

  // Normalize <workspace>...</workspace> wrapper to <xml>...</xml>
  if (/^<workspace\b/i.test(cleaned) && /<\/workspace>\s*$/i.test(cleaned)) {
    cleaned = cleaned.replace(/^<workspace\b([^>]*)>/i, '<xml$1>').replace(/<\/workspace>\s*$/i, '</xml>');
  }

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

  const hasAnyBotBlock =
    blockTypes.has('trade_definition') ||
    blockTypes.has('trade') ||
    blockTypes.has('trade_definition_market') ||
    blockTypes.has('trade_definition_tradetype') ||
    blockTypes.has('trade_definition_contracttype') ||
    blockTypes.has('trade_definition_tradeoptions') ||
    blockTypes.has('trade_definition_accumulator') ||
    blockTypes.has('tradeoptions') ||
    blockTypes.has('before_purchase') ||
    blockTypes.has('after_purchase') ||
    blockTypes.has('purchase') ||
    blockTypes.size > 0;

  if (!hasAnyBotBlock) {
    return {
      ok: false,
      error: 'Unsupported or incomplete Deriv Bot XML: no Blockly <block> definitions found.',
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
  stake: number,
  targetDigit?: number | null,
  analysisMode: 'auto' | 'digit' | 'directional' = 'auto'
): {
  contractType: string;
  predictedCondition: string;
  barrier: string;
  duration: number;
  durationUnit: string;
  probability: number;
  lossRiskScore: number;
  rationale: string;
  telemetry: {
    dataPoints: number;
    targetDigit: number;
    targetDigitPct: number;
    digitDistribution: Array<{ digit: number; count: number; pct: number }>;
    trend: string;
    momentum: string;
    volatility: string;
    pattern: string;
  };
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

  let minDigit = 0;
  let minFreq = Number.POSITIVE_INFINITY;
  for (let d = 0; d <= 9; d++) {
    if (counts[d] < minFreq) {
      minFreq = counts[d];
      minDigit = d;
    }
  }
  const n = Math.max(1, digits.length);
  const chosenDigit =
    typeof targetDigit === 'number' && Number.isInteger(targetDigit) && targetDigit >= 0 && targetDigit <= 9
      ? targetDigit
      : minDigit;
  const chosenFreq = counts[chosenDigit] || 0;
  const chosenDigitPct = Number(((chosenFreq / n) * 100).toFixed(1));
  const diffChosenWinPct = ((n - chosenFreq) / n) * 100;
  const diffObservedWinPct = ((n - minFreq) / n) * 100;

  const overBarrier = Math.min(8, Math.max(1, chosenDigit <= 2 ? chosenDigit : 1));
  const overPct = (digits.filter((d) => d > overBarrier).length / n) * 100;
  const underBarrier = Math.max(1, Math.min(8, chosenDigit >= 7 ? chosenDigit : 8));
  const underPct = (digits.filter((d) => d < underBarrier).length / n) * 100;
  const evenCount = digits.filter((d) => d % 2 === 0).length;
  const evenPct = (evenCount / n) * 100;
  const oddPct = 100 - evenPct;

  // Market regime stats from real tick prices
  const last10 = recent.slice(-10);
  const prev10 = recent.slice(-20, -10);
  const avg10 = last10.reduce((a, b) => a + b, 0) / Math.max(1, last10.length);
  const avgPrev10 = prev10.length
    ? prev10.reduce((a, b) => a + b, 0) / prev10.length
    : avg10;
  const lastSpot = recent[recent.length - 1] || avg10;
  const firstSpot = recent[0] || lastSpot;
  const priceDiffs = recent.slice(1).map((v, i) => Math.abs(v - recent[i]));
  const avgStep = priceDiffs.reduce((a, b) => a + b, 0) / Math.max(1, priceDiffs.length);
  const volRatio = lastSpot > 0 ? (avgStep / lastSpot) * 10000 : 0;

  const trend = avg10 > avgPrev10 * 1.0001 ? 'Uptrend' : avg10 < avgPrev10 * 0.9999 ? 'Downtrend' : 'Sideways';
  const momentumDiff = Math.abs(lastSpot - avg10);
  const momentum =
    momentumDiff > avgStep * 1.6 ? 'Strong' : momentumDiff > avgStep * 0.7 ? 'Moderate' : 'Steady';
  const volatility = volRatio > 8 ? 'High' : volRatio > 2.5 ? 'Moderate' : 'Low';
  const pattern =
    lastSpot >= firstSpot && evenPct >= 50
      ? 'Bullish'
      : lastSpot < firstSpot && oddPct > 50
        ? 'Bearish'
        : avg10 >= avgPrev10
          ? 'Accumulation'
          : 'Distribution';

  const digitDistribution = counts.map((c, d) => ({
    digit: d,
    count: c,
    pct: Number(((c / n) * 100).toFixed(1)),
  }));

  const telemetry = {
    dataPoints: n,
    targetDigit: chosenDigit,
    targetDigitPct: chosenDigitPct,
    digitDistribution,
    trend,
    momentum,
    volatility,
    pattern,
  };

  const isSyntheticDigit = /^(1HZ|R_|JD|BOOM|CRASH|STPIDX|RDBULL|RDBEAR)/i.test(symbol);

  if (isSyntheticDigit && analysisMode !== 'directional') {
    const hasExplicitDigit =
      typeof targetDigit === 'number' && Number.isInteger(targetDigit) && targetDigit >= 0 && targetDigit <= 9;

    const candidates = [
      {
        contractType: 'DIGITDIFF',
        predictedCondition: `Exit last digit DIFFERS from ${hasExplicitDigit ? chosenDigit : minDigit}`,
        barrier: String(hasExplicitDigit ? chosenDigit : minDigit),
        probability: Number(
          Math.min(
            94.8,
            Math.max(85.2, (hasExplicitDigit ? diffChosenWinPct : diffObservedWinPct) * 0.45 + 49)
          ).toFixed(2)
        ),
        lossRiskScore: Number(
          (
            100 -
            Math.min(
              94.8,
              Math.max(85.2, (hasExplicitDigit ? diffChosenWinPct : diffObservedWinPct) * 0.45 + 49)
            )
          ).toFixed(2)
        ),
        rationale: `Minimal-loss profile: digit ${hasExplicitDigit ? chosenDigit : minDigit} appeared ${hasExplicitDigit ? chosenFreq : minFreq}/${n} recent ticks on ${symbol}. Observed non-match rate ${(hasExplicitDigit ? diffChosenWinPct : diffObservedWinPct).toFixed(1)}%.`,
      },
      {
        contractType: 'DIGITOVER',
        predictedCondition: `Exit last digit OVER ${overBarrier}`,
        barrier: String(overBarrier),
        probability: Number(Math.min(86.5, Math.max(74.0, overPct * 0.5 + 40)).toFixed(2)),
        lossRiskScore: Number((100 - Math.min(86.5, Math.max(74.0, overPct * 0.5 + 40))).toFixed(2)),
        rationale: `Minimal-loss profile: digits over ${overBarrier} occurred ${overPct.toFixed(1)}% over ${n} ticks on ${symbol}. Designed for conservative small-gain consistency.`,
      },
      {
        contractType: 'DIGITUNDER',
        predictedCondition: `Exit last digit UNDER ${underBarrier}`,
        barrier: String(underBarrier),
        probability: Number(Math.min(86.5, Math.max(74.0, underPct * 0.5 + 40)).toFixed(2)),
        lossRiskScore: Number((100 - Math.min(86.5, Math.max(74.0, underPct * 0.5 + 40))).toFixed(2)),
        rationale: `Minimal-loss profile: digits under ${underBarrier} occurred ${underPct.toFixed(1)}% over ${n} ticks on ${symbol}. Lower loss variance compared to directional guesses.`,
      },
    ];

    candidates.sort((a, b) => a.lossRiskScore - b.lossRiskScore);
    const best = candidates[0];
    return {
      ...best,
      duration: 1,
      durationUnit: 't',
      telemetry,
    };
  }

  // Forex / Commodities / Crypto or directional mode -> directional Rise/Fall
  const isBull = lastSpot >= avg10;
  const dirProb = Number(Math.min(93.4, Math.max(58.0, Math.max(evenPct, oddPct, 62) + (momentum === 'Strong' ? 14 : 6))).toFixed(2));
  return {
    contractType: isBull ? 'CALL' : 'PUT',
    predictedCondition: isBull ? 'Spot closes HIGHER than entry (Rise)' : 'Spot closes LOWER than entry (Fall)',
    barrier: String(chosenDigit),
    duration: isSyntheticDigit ? 5 : 15,
    durationUnit: isSyntheticDigit ? 't' : 'm',
    probability: dirProb,
    lossRiskScore: Number((100 - dirProb).toFixed(2)),
    rationale: `Directional momentum scan on ${symbol}: spot ${lastSpot.toFixed(decimals)} vs 10-tick mean ${avg10.toFixed(decimals)} (${isBull ? 'bullish' : 'bearish'} tilt, digit ${chosenDigit} inspected). Stake $${stake.toFixed(2)}.`,
    telemetry,
  };
}

// 1. Run Quantum Analyser minimal-loss statistical scan & persist 120s HMAC-signed prediction
router.post('/quantum/scan', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const requestedSymbol = String(req.body?.symbol || '1HZ100V').trim();
  const stake = Number(Math.max(0.5, Math.min(5000, Number(req.body?.stake || 1))).toFixed(2));
  const rawDigit = req.body?.targetDigit;
  const targetDigit =
    rawDigit !== undefined && rawDigit !== null && rawDigit !== '' && Number.isInteger(Number(rawDigit))
      ? Math.max(0, Math.min(9, Number(rawDigit)))
      : null;
  const analysisMode =
    req.body?.analysisMode === 'directional' || req.body?.analysisMode === 'digit'
      ? req.body.analysisMode
      : 'auto';

  const validInstrument =
    CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === requestedSymbol)?.symbol || requestedSymbol;

  await expireStaleQuantumPredictions(userId);

  await derivWs.ensureSymbolSubscribed(validInstrument).catch(() => {});
  const prices = await derivWs.fetchTickHistory(validInstrument, 100);
  const latest = derivWs.getLatestTick(validInstrument);
  const spotPrice = latest?.quote ?? prices[prices.length - 1] ?? 1000;
  const pipSize = latest?.pipSize ?? 0.01;

  const setup = selectMinimalLossSetup(validInstrument, prices, pipSize, stake, targetDigit, analysisMode);
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
    telemetry: setup.telemetry,
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

  const symbol = parsed.fields.get('SYMBOL_LIST') || parsed.fields.get('SYMBOL') || '1HZ100V';
  const rawTypeList = (parsed.fields.get('TYPE_LIST') || '').toUpperCase();
  const rawPurchase = (parsed.fields.get('PURCHASE_LIST') || parsed.fields.get('THEN_PURCHASE') || '').toUpperCase();
  const varSide = (parsed.fields.get('VAR:tradeside') || '').toUpperCase();
  const rawTradeType = (parsed.fields.get('TRADETYPE_LIST') || parsed.fields.get('TRADETYPECAT_LIST') || '').toLowerCase();
  const tradeTypeDefaultContract = (() => {
    if (rawTradeType.includes('matches') || rawTradeType.includes('differs')) return 'DIGITMATCH';
    if (rawTradeType.includes('over') || rawTradeType.includes('under')) return 'DIGITOVER';
    if (rawTradeType.includes('even') || rawTradeType.includes('odd')) return 'DIGITEVEN';
    if (rawTradeType.includes('higher') || rawTradeType.includes('lower')) return 'HIGHER';
    if (rawTradeType.includes('touch')) return 'ONETOUCH';
    if (rawTradeType.includes('ends')) return 'ENDSIN';
    if (rawTradeType.includes('inout') || rawTradeType.includes('stays')) return 'EXPIRYRANGE';
    if (rawTradeType.includes('asian')) return 'ASIANU';
    if (rawTradeType.includes('reset')) return 'RESETCALL';
    if (rawTradeType.includes('tick')) return 'TICKHIGH';
    if (rawTradeType.includes('only')) return 'RUNHIGH';
    if (rawTradeType.includes('mult')) return 'MULTUP';
    if (rawTradeType.includes('accu')) return 'ACCU';
    return 'CALL';
  })();
  const resolvedContract =
    rawPurchase ||
    (rawTypeList && rawTypeList !== 'BOTH' ? rawTypeList : varSide) ||
    (parsed.blockTypes.has('trade_definition_accumulator') ? 'ACCU' : tradeTypeDefaultContract);
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

  // If XML contains Quantum Analyser metadata and it is still valid & untampered, attach it silently; otherwise allow normal DBOT XML execution
  if (parsed.quantumMeta) {
    const qm = parsed.quantumMeta;
    const predictionId = qm.prediction_id || '';
    const check = await verifyAndConsumeQuantumPrediction(userId, predictionId, false).catch(() => null);
    if (check?.valid && check.prediction && timingSafeHexEqual(qm.signature_hmac || '', check.prediction.signature_hmac)) {
      const row = check.prediction;
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
