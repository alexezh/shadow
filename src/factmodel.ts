/* ============================================================================
 * Probabilistic Rule Trainer & Lookup (TypeScript, no deps)
 * - Noisy-OR over rules
 * - Learn per-rule reliability c_i = sigmoid(theta_i) with Adam
 * - Optional per-label Platt calibration
 * ========================================================================== */

/////////////////////////////
// Types
/////////////////////////////

export type Label = string;
export type FactName = string;

export interface Literal {
  fact: FactName;
  positive: boolean; // true => P(fact); false => 1 - P(fact)
}

export interface Rule {
  id: string;
  label: Label;
  literals: Literal[];
  enabled?: boolean;    // default true
  init_c?: number;      // (0,1], default 1.0
  meta?: Record<string, unknown>;
}

export interface RuleSet {
  rules: Rule[];
  labels: Label[];
  priors?: Record<Label, number>; // if omitted => uniform
}

export interface Example {
  id?: string;
  facts: Record<FactName, number>; // each in [0,1]
  label: Label;
  weight?: number; // default 1
}

export interface TrainingExamples {
  examples: Example[];
}

export interface TrainConfig {
  epochs?: number;             // default 30
  batchSize?: number;          // default 512
  lr?: number;                 // Adam learning rate; default 5e-2
  l2OnTheta?: number;          // L2 on logits theta; default 1e-3
  clipGradNorm?: number;       // gradient clipping; default 5.0
  earlyStopPatience?: number;  // default 5 (by val logloss)
  seed?: number;               // default 42
  calibrate?: boolean;         // default true
  calibrationMaxIters?: number;// default 200
  calibrationLR?: number;      // default 0.05
}

export interface TrainedRule extends Rule {
  c: number; // learned
  stats?: {
    support: number;         // #examples with r_i > 0
    avg_fire_prob: number;   // mean r_i over data
    grad_norm?: number;      // last-epoch grad magnitude
    regularization?: number; // lambda used
  };
}

export interface PlattParams { a: number; b: number; } // sigmoid(a*logit(p)+b)

export interface TrainedModel {
  version: "noisyor-1.0";
  labels: Label[];
  priors: Record<Label, number>;
  rules: TrainedRule[];
  calibration?: { per_label_platt: Record<Label, PlattParams> };
  train_meta: {
    objective: "multiclass-log-loss";
    epochs: number;
    optimizer: "adam";
    lr: number;
    l2_c: number;
    seed: number;
    train_size: number;
    val_size: number;
    timestamp_utc: string;
    best_val_logloss: number;
  };
}

/////////////////////////////
// Math utils
/////////////////////////////

const EPS = 1e-9;

function clamp01(x: number): number {
  return x < EPS ? EPS : x > 1 - EPS ? 1 - EPS : x;
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  } else {
    const ez = Math.exp(z);
    return ez / (1 + ez);
  }
}
function logit(p: number): number {
  p = clamp01(p);
  return Math.log(p / (1 - p));
}

function randUniform(seedState: { s: number }): number {
  // LCG for reproducible shuffles
  seedState.s = (seedState.s * 1664525 + 1013904223) % 0xffffffff;
  return seedState.s / 0xffffffff;
}

/////////////////////////////
// Core probability engine
/////////////////////////////

export function literalProb(facts: Record<FactName, number>, lit: Literal): number {
  const p = clamp01(facts[lit.fact] ?? 0);
  return lit.positive ? p : (1 - p);
}

export function ruleFireProb(facts: Record<FactName, number>, literals: Literal[]): number {
  let r = 1.0;
  for (const lit of literals) {
    r *= literalProb(facts, lit);
    if (r <= EPS) return 0; // early exit
  }
  return r;
}

export interface ForwardResult {
  qPerLabel: Record<Label, number>; // 1 - ∏(1 - c_i r_i)
  sPerLabel: Record<Label, number>; // π_y * q_y
  posteriors: Record<Label, number>;
}

export function forwardPass(
  facts: Record<FactName, number>,
  rules: { label: Label; literals: Literal[]; c: number; enabled?: boolean }[],
  labels: Label[],
  priors?: Record<Label, number>,
  calibration?: Record<Label, PlattParams>
): ForwardResult {
  const prodNot: Record<Label, number> = Object.fromEntries(labels.map(y => [y, 1.0]));
  for (const r of rules) {
    if (r.enabled === false) continue;
    const rr = ruleFireProb(facts, r.literals);
    const oneMinus = 1 - clamp01(r.c) * rr;
    prodNot[r.label] *= oneMinus;
  }
  const q: Record<Label, number> = Object.fromEntries(labels.map(y => [y, 1 - prodNot[y]]));

  const pi = priors ?? Object.fromEntries(labels.map(y => [y, 1 / labels.length]));
  const s: Record<Label, number> = Object.fromEntries(labels.map(y => [y, pi[y] * q[y]]));

  let Z = 0;
  for (const y of labels) Z += s[y];
  if (Z <= 0) Z = 1.0;

  let p: Record<Label, number> = Object.fromEntries(labels.map(y => [y, s[y] / Z]));

  // Optional per-label Platt calibration
  if (calibration) {
    const pc: Record<Label, number> = {} as any;
    let Z2 = 0;
    for (const y of labels) {
      const par = calibration[y];
      if (!par) { pc[y] = p[y]; Z2 += pc[y]; continue; }
      const z = logit(p[y]);
      pc[y] = sigmoid(par.a * z + par.b);
      Z2 += pc[y];
    }
    if (Z2 <= 0) Z2 = 1.0;
    for (const y of labels) p[y] = pc[y] / Z2;
  }

  return { qPerLabel: q, sPerLabel: s, posteriors: p };
}

export function predictLabel(
  model: TrainedModel,
  facts: Record<FactName, number>
): { label: Label; posteriors: Record<Label, number> } {
  const fr = forwardPass(
    facts,
    model.rules,
    model.labels,
    model.priors,
    model.calibration?.per_label_platt
  );
  let best: Label = model.labels[0];
  let bestP = -1;
  for (const y of model.labels) {
    const v = fr.posteriors[y];
    if (v > bestP) { bestP = v; best = y; }
  }
  return { label: best, posteriors: fr.posteriors };
}

/////////////////////////////
// Training
/////////////////////////////

interface AdamState {
  m: number[];
  v: number[];
  t: number;
}

function initPriors(labels: Label[], priors?: Record<Label, number>): Record<Label, number> {
  if (!priors) return Object.fromEntries(labels.map(y => [y, 1 / labels.length]));
  const out = { ...priors };
  let S = 0; for (const y of labels) S += out[y] ?? 0;
  if (S <= 0) return Object.fromEntries(labels.map(y => [y, 1 / labels.length]));
  for (const y of labels) out[y] = (out[y] ?? 0) / S;
  return out;
}

function softmaxFromScores(scores: Record<Label, number>, labels: Label[]): Record<Label, number> {
  let Z = 0; for (const y of labels) Z += scores[y];
  if (Z <= 0) Z = 1;
  const p: Record<Label, number> = {} as any;
  for (const y of labels) p[y] = scores[y] / Z;
  return p;
}

export async function trainRuleReliabilities(
  ruleset: RuleSet,
  trainData: TrainingExamples,
  valData?: TrainingExamples,
  config?: TrainConfig
): Promise<TrainedModel> {
  const cfg: Required<TrainConfig> = {
    epochs: config?.epochs ?? 30,
    batchSize: config?.batchSize ?? 512,
    lr: config?.lr ?? 5e-2,
    l2OnTheta: config?.l2OnTheta ?? 1e-3,
    clipGradNorm: config?.clipGradNorm ?? 5.0,
    earlyStopPatience: config?.earlyStopPatience ?? 5,
    seed: config?.seed ?? 42,
    calibrate: config?.calibrate ?? true,
    calibrationMaxIters: config?.calibrationMaxIters ?? 200,
    calibrationLR: config?.calibrationLR ?? 0.05
  };

  const labels = [...ruleset.labels];
  const priors = initPriors(labels, ruleset.priors);

  // Prepare rules and parameterization c_i = sigmoid(theta_i)
  const R = ruleset.rules.filter(r => r.enabled !== false);
  const n = R.length;
  const theta = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const init_c = R[i].init_c ?? 1.0;
    theta[i] = logit(clamp01(init_c));
  }

  // Indexing helpers
  const labelToRuleIdx: Record<Label, number[]> = Object.fromEntries(labels.map(y => [y, []]));
  for (let i = 0; i < n; i++) labelToRuleIdx[R[i].label].push(i);

  // Adam init
  const adam: AdamState = { m: new Array(n).fill(0), v: new Array(n).fill(0), t: 0 };
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;

  // Data prep
  const tr = trainData.examples.slice();
  const va = valData?.examples.slice() ?? [];
  const rng = { s: cfg.seed >>> 0 };

  function shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(randUniform(rng) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function computeBatchGrad(batch: Example[]): { loss: number; grad: Float64Array } {
    const grad = new Float64Array(n); // dL/dtheta
    let loss = 0;

    for (const ex of batch) {
      const weight = ex.weight ?? 1.0;

      // Precompute r_i and (1 - c_i r_i) and per-label product
      const c = new Array(n);
      for (let i = 0; i < n; i++) c[i] = sigmoid(theta[i]);
      const r = new Array(n);
      const oneMinus_c_r = new Array(n);

      for (let i = 0; i < n; i++) {
        r[i] = ruleFireProb(ex.facts, R[i].literals);
        oneMinus_c_r[i] = 1 - c[i] * r[i];
      }

      const prodNot: Record<Label, number> = Object.fromEntries(labels.map(y => [y, 1.0]));
      for (let i = 0; i < n; i++) {
        const y = R[i].label;
        prodNot[y] *= oneMinus_c_r[i];
      }
      const q: Record<Label, number> = Object.fromEntries(labels.map(y => [y, 1 - prodNot[y]]));
      const s: Record<Label, number> = Object.fromEntries(labels.map(y => [y, priors[y] * q[y]]));

      let Z = 0; for (const y of labels) Z += s[y];
      if (Z <= 0) Z = 1;
      const p: Record<Label, number> = Object.fromEntries(labels.map(y => [y, s[y] / Z]));

      // Loss
      const pyStar = clamp01(p[ex.label] ?? EPS);
      loss += weight * (-Math.log(pyStar));

      // dL/ds_y = p_y - 1[y=y*]
      const dL_ds: Record<Label, number> = Object.fromEntries(labels.map(y => [y, (p[y] - (y === ex.label ? 1 : 0)) * weight]));

      // For each rule i affecting its label yi, propagate:
      for (let i = 0; i < n; i++) {
        const yi = R[i].label;

        // ∂q_y/∂c_i = r_i * Π_{j≠i}(1 - c_j r_j) = r_i * (1 - q_y) / (1 - c_i r_i)
        const denom = Math.max(oneMinus_c_r[i], EPS);
        const dq_dc_i = r[i] * (1 - q[yi]) / denom;

        // s_y = π_y q_y  => ∂s/∂c_i = π_y * dq/dc_i
        const ds_dc_i = priors[yi] * dq_dc_i;

        // Chain to c_i: dL/dc_i = dL/ds_y * ds/dc_i
        const dL_dc_i = dL_ds[yi] * ds_dc_i;

        // Chain to theta_i: c_i = sigmoid(theta_i), dc/dtheta = c(1-c)
        const dtheta = dL_dc_i * c[i] * (1 - c[i]);

        grad[i] += dtheta;
      }
    }

    // L2 on theta
    const lambda = cfg.l2OnTheta;
    if (lambda > 0) {
      for (let i = 0; i < n; i++) {
        loss += 0.5 * lambda * theta[i] * theta[i];
        grad[i] += lambda * theta[i];
      }
    }

    return { loss, grad };
  }

  // Training loop
  let bestVal = Number.POSITIVE_INFINITY;
  let bestTheta = new Float64Array(theta);
  let patienceLeft = cfg.earlyStopPatience;

  for (let epoch = 1; epoch <= cfg.epochs; epoch++) {
    shuffle(tr);

    // Mini-batches
    for (let start = 0; start < tr.length; start += cfg.batchSize) {
      const batch = tr.slice(start, start + cfg.batchSize);
      const { loss, grad } = computeBatchGrad(batch);

      // Clip grad
      let gnorm = 0; for (let i = 0; i < n; i++) gnorm += grad[i] * grad[i];
      gnorm = Math.sqrt(gnorm);
      const clip = cfg.clipGradNorm;
      const scale = gnorm > clip ? clip / (gnorm + 1e-12) : 1.0;

      // Adam update
      adam.t += 1;
      for (let i = 0; i < n; i++) {
        const gi = grad[i] * scale;
        adam.m[i] = beta1 * adam.m[i] + (1 - beta1) * gi;
        adam.v[i] = beta2 * adam.v[i] + (1 - beta2) * gi * gi;
        const mhat = adam.m[i] / (1 - Math.pow(beta1, adam.t));
        const vhat = adam.v[i] / (1 - Math.pow(beta2, adam.t));
        theta[i] -= cfg.lr * (mhat / (Math.sqrt(vhat) + eps));
      }
    }

    // Validation
    const valLogLoss = evaluateLogLoss(
      { rules: R, theta, labels, priors },
      va.length ? va : tr.slice(0, Math.min(1024, tr.length))
    );

    // Early stopping tracking
    if (valLogLoss < bestVal - 1e-6) {
      bestVal = valLogLoss;
      bestTheta = new Float64Array(theta);
      patienceLeft = cfg.earlyStopPatience;
    } else {
      patienceLeft -= 1;
      if (patienceLeft <= 0) break;
    }
  }

  // Use best weights
  theta.set(bestTheta);

  // Materialize trained rules and simple stats over train set
  const trainedRules: TrainedRule[] = [];
  const cFinal = Array.from(theta).map(sigmoid);

  // Stats: support & avg fire prob
  const support = new Array(n).fill(0);
  const sumR = new Array(n).fill(0);
  for (const ex of tr) {
    for (let i = 0; i < n; i++) {
      const rr = ruleFireProb(ex.facts, R[i].literals);
      if (rr > 0) support[i] += 1;
      sumR[i] += rr;
    }
  }

  for (let i = 0; i < n; i++) {
    trainedRules.push({
      ...R[i],
      c: cFinal[i],
      stats: {
        support: support[i],
        avg_fire_prob: tr.length ? sumR[i] / tr.length : 0,
        grad_norm: undefined,
        regularization: cfg.l2OnTheta
      }
    });
  }

  // Optional Platt calibration (one-vs-rest) on validation (or held-out from train)
  let calibration: Record<Label, PlattParams> | undefined;
  if (cfg.calibrate) {
    const calBase = va.length ? va : tr.slice(0, Math.min(3000, tr.length));
    calibration = fitPlattPerLabel(
      { rules: trainedRules, labels, priors },
      calBase,
      cfg.calibrationLR,
      cfg.calibrationMaxIters
    );
  }

  const model: TrainedModel = {
    version: "noisyor-1.0",
    labels,
    priors,
    rules: trainedRules,
    calibration: calibration ? { per_label_platt: calibration } : undefined,
    train_meta: {
      objective: "multiclass-log-loss",
      epochs: cfg.epochs,
      optimizer: "adam",
      lr: cfg.lr,
      l2_c: cfg.l2OnTheta,
      seed: cfg.seed,
      train_size: tr.length,
      val_size: va.length,
      timestamp_utc: new Date().toISOString(),
      best_val_logloss: bestVal
    }
  };

  return model;
}

function evaluateLogLoss(
  params: { rules: Rule[]; theta: Float64Array; labels: Label[]; priors: Record<Label, number> },
  examples: Example[]
): number {
  const { rules: R, theta, labels, priors } = params;
  const c = Array.from(theta).map(sigmoid);
  let total = 0, denom = 0;

  for (const ex of examples) {
    const weight = ex.weight ?? 1.0;
    const prodNot: Record<Label, number> = Object.fromEntries(labels.map(y => [y, 1.0]));
    for (let i = 0; i < R.length; i++) {
      const rr = ruleFireProb(ex.facts, R[i].literals);
      prodNot[R[i].label] *= (1 - c[i] * rr);
    }
    const q = Object.fromEntries(labels.map(y => [y, 1 - prodNot[y]]));
    const s = Object.fromEntries(labels.map(y => [y, priors[y] * (q as any)[y]]));

    let Z = 0; for (const y of labels) Z += (s as any)[y];
    if (Z <= 0) Z = 1.0;
    const pStar = clamp01((s as any)[ex.label] / Z);
    total += -Math.log(pStar) * weight;
    denom += weight;
  }

  return denom > 0 ? total / denom : 0;
}

/////////////////////////////
// Platt calibration (one-vs-rest)
/////////////////////////////

function fitPlattPerLabel(
  modelLite: { rules: { label: Label; literals: Literal[]; c: number }[]; labels: Label[]; priors: Record<Label, number> },
  examples: Example[],
  lr = 0.05,
  maxIters = 200
): Record<Label, PlattParams> {
  const { rules, labels, priors } = modelLite;

  // Collect raw predictions
  const raw: { p: Record<Label, number>; yStar: Label }[] = examples.map(ex => {
    const fr = forwardPass(ex.facts, rules, labels, priors);
    return { p: fr.posteriors, yStar: ex.label };
  });

  const out: Record<Label, PlattParams> = {} as any;

  for (const y of labels) {
    // One-vs-rest targets: t=1 for y, 0 otherwise. Feature z = logit(p_y)
    let a = 1.0, b = 0.0; // init
    for (let iter = 0; iter < maxIters; iter++) {
      let gA = 0, gB = 0, loss = 0;
      for (const { p, yStar } of raw) {
        const py = clamp01(p[y]);
        const z = logit(py);
        const yz = a * z + b;
        const phat = sigmoid(yz);
        const t = (yStar === y) ? 1 : 0;
        loss += -(t * Math.log(clamp01(phat)) + (1 - t) * Math.log(clamp01(1 - phat)));
        const err = phat - t; // dL/dyz
        gA += err * z;
        gB += err;
      }
      const N = raw.length || 1;
      a -= lr * (gA / N);
      b -= lr * (gB / N);

      // simple convergence check (optional)
      if (Math.sqrt((gA * gA + gB * gB) / (N * N)) < 1e-6) break;
    }
    out[y] = { a, b };
  }

  return out;
}

/////////////////////////////
// Example usage (remove or keep as doc)
/////////////////////////////

/*
(async () => {
  const ruleset: RuleSet = {
    labels: ["Accept", "Reject"],
    priors: { Accept: 0.5, Reject: 0.5 },
    rules: [
      { id: "R1", label: "Accept", literals: [{ fact: "A", positive: true }, { fact: "B", positive: true }], init_c: 1.0 },
      { id: "R2", label: "Reject", literals: [{ fact: "A", positive: true }, { fact: "C", positive: true }], init_c: 0.8 }
    ]
  };

  const data: TrainingExamples = {
    examples: [
      { facts: { A: 0.9, B: 0.7, C: 0.1 }, label: "Accept" },
      { facts: { A: 0.8, B: 0.2, C: 0.7 }, label: "Reject" },
      // ... more
    ]
  };

  const model = await trainRuleReliabilities(ruleset, data, data, { epochs: 20, calibrate: true });
  const pred = predictLabel(model, { A: 0.8, B: 0.6, C: 0.3 });
  console.log(pred.label, pred.posteriors, model);
})();
*/

