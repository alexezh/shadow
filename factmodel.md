# Spec: Probabilistic Rule Trainer & Lookup Store

This spec defines the data structures and training procedure for learning **rule reliabilities** (c_i) (and related metadata) from labeled examples, where each example provides a set of probabilistic facts and a ground-truth label (Y). The resulting model enables fast lookup/inference using a **noisy-OR over rules**.

---

## Concepts & Notation

* **Facts**: Universe (\mathcal{F}={f_1,\dots,f_M}). Each example supplies per-fact probabilities (p(f_j)\in[0,1]).
* **Rule (Statement)** (R_i): Small conjunction of literals (A_i={\ell_{i1},\dots,\ell_{iK_i}}) implying label (y_i):
  [
  R_i:; \ell_{i1}\wedge\cdots\wedge \ell_{iK_i}\Rightarrow y_i
  ]
  Each literal (\ell = (f,\text{is_positive})) with (\Pr(\ell)=p(f)) if positive else (1-p(f)).
* **Rule firing prob. (under independence)**:
  [
  r_i(x)=\Pr(A_i\mid x) = \prod_{\ell\in A_i}\Pr(\ell\mid x)
  ]
* **Rule reliability** (c_i\in(0,1]): Learned parameter scaling the effect of the rule.
* **Label score (noisy-OR)** for label (y):
  [
  q_y(x)=1-\prod_{i: y_i=y}\bigl(1 - c_i \cdot r_i(x)\bigr)
  ]
* **Class prior** (\pi_y\in(0,1]) (optional).
* **Posterior (unnormalized)**: (s_y(x)=\pi_y\cdot q_y(x)). Normalize across labels for (P(Y=y\mid x)).

---

## Data Model

### 1) RuleSet (input)

```json
{
  "rules": [
    {
      "id": "R1",
      "label": "y1",
      "literals": [
        { "fact": "A", "positive": true },
        { "fact": "B", "positive": false }
      ],
      "init_c": 1.0,
      "enabled": true,
      "meta": { "source": "hand-authored", "notes": "A & ¬B ⇒ y1" }
    }
  ],
  "labels": ["y1", "y2"],
  "priors": { "y1": 0.5, "y2": 0.5 }  // optional; omit for uniform
}
```

### 2) TrainingExamples (input)

Each example provides a fact-probability map and a ground-truth label.

```json
{
  "examples": [
    {
      "id": "ex_001",
      "facts": { "A": 0.8, "B": 0.2, "C": 0.6 },
      "label": "y1",
      "weight": 1.0
    }
  ]
}
```

### 3) TrainedModel (output)

```json
{
  "version": "noisyor-1.0",
  "labels": ["y1", "y2"],
  "priors": { "y1": 0.5, "y2": 0.5 },     // resolved priors used in training
  "rules": [
    {
      "id": "R1",
      "label": "y1",
      "literals": [
        { "fact": "A", "positive": true },
        { "fact": "B", "positive": false }
      ],
      "c": 0.73,                          // learned reliability
      "stats": {
        "support": 312,                   // ∑ I[r_i(x)>0]
        "avg_fire_prob": 0.28,            // mean r_i(x)
        "grad_norm": 0.04,                // last-epoch gradient magnitude
        "regularization": 0.001
      }
    }
  ],
  "calibration": {
    "per_label_platt": {
      "y1": { "a": 1.12, "b": -0.37 },    // optional post-hoc calibration
      "y2": { "a": 0.95, "b": -0.12 }
    }
  },
  "train_meta": {
    "objective": "multiclass-log-loss",
    "epochs": 30,
    "optimizer": "Adam",
    "lr": 0.05,
    "l2_c": 1e-3,
    "seed": 42,
    "train_size": 12000,
    "val_size": 3000,
    "timestamp_utc": "2025-10-11T16:15:00Z"
  }
}
```

---

## Training Objective

We learn (c_i) by minimizing **multiclass negative log-likelihood** over examples.

For an example (x) with label (y^*):

1. Compute all rule fire probs (r_i(x)).
2. For each label (y), get (q_y(x)=1-\prod_{i:y_i=y}(1-c_i r_i(x))).
3. Combine with priors: (s_y(x)=\pi_y q_y(x)); normalize: (p_y(x)=s_y/\sum_{y'} s_{y'}).
4. Loss: (\mathcal{L}(x) = -\log p_{y^*}(x)).
5. Regularize (c_i) (e.g., L2 on logits; see parameterization below).

**Parameterization for stability:** optimize unconstrained (\theta_i\in\mathbb{R}) with
[
c_i=\sigma(\theta_i)=\frac{1}{1+e^{-\theta_i}}
]
Regularizer: (\lambda\sum_i \theta_i^2).

**Gradients (sketch):**

* For label (y), (\partial q_y/\partial c_i = \begin{cases}
  r_i \cdot \prod_{j\neq i, y_j=y}(1 - c_j r_j) & \text{if } y_i=y\
  0 & \text{otherwise}
  \end{cases})
* Chain through softmax over (s_y) and (c_i=\sigma(\theta_i)).

Practical implementation uses autodiff; no need to hand-code gradients unless optimizing for bare-metal speed.

---

## Trainer API

### Function: `train_rule_reliabilities`

**Purpose:** Fit (c_i) (and optional calibration) from labeled examples.

**Signature (pseudocode):**

```python
def train_rule_reliabilities(
    ruleset: RuleSet,
    train_data: TrainingExamples,
    val_data: Optional[TrainingExamples] = None,
    priors: Optional[Dict[str, float]] = None,
    config: Optional[TrainConfig] = None
) -> TrainedModel
```

**TrainConfig (defaults shown):**

```json
{
  "epochs": 30,
  "batch_size": 512,
  "optimizer": "adam",
  "lr": 0.05,
  "l2_on_theta": 1e-3,
  "early_stop_patience": 5,
  "calibrate": true,
  "calibration_method": "per_label_platt",  // or "none"
  "seed": 42,
  "clip_grad_norm": 5.0
}
```

**Steps:**

1. **Init** (\theta_i=\mathrm{logit}(\text{init_c}_i)) or 0 if absent.
2. **Mini-batch loop**:
   a. For each example, compute (r_i(x)) for rules that share its label set (sparse map).
   b. Compute (q_y(x)), (s_y(x)), normalize to (p_y(x)).
   c. Accumulate loss + L2.
   d. Backprop, update (\theta).
3. **Validation**: track multiclass log-loss, macro-F1, top-1 accuracy; early stop.
4. **Calibration** (optional): fit Platt per label: ( \hat p'_y = \sigma(a_y \cdot \mathrm{logit}(\hat p_y) + b_y)), renormalize.
5. **Emit** `TrainedModel` with learned (c=\sigma(\theta)), stats, calibration.

**Complexity:**
Per example, cost is (O(\sum_y m_y)), where (m_y) is #rules for label (y). With small (K), (r_i) is a few multiplies. Store per-label (\prod(1-c_ir_i)) incrementally for speed.

---

## Inference (Lookup) API

### Function: `predict_label`

**Purpose:** Compute the most probable label and calibrated posteriors.

```python
def predict_label(
    model: TrainedModel,
    facts: Dict[str, float]
) -> Tuple[str, Dict[str, float>]  # (argmax_label, posteriors)
```

**Steps:**

1. For each rule (R_i), compute (r_i) from `facts`. Missing facts default to 0.0 (or a configured default).
2. For each label (y), compute (q_y=1-\prod_{i:y_i=y}(1-c_ir_i)).
3. (s_y=\pi_y q_y); normalize across labels.
4. Apply optional calibration (p'_y) and re-normalize.
5. Return (\arg\max_y p'_y) and the distribution.

---

## Storage & Serialization

* **Canonical JSON** for `TrainedModel` (above).
* **Indexing:**

  * Map `label → [rule_ids]` for fast per-label aggregation.
  * Map `fact → [rule_ids that mention fact]` for sparse recomputation (optional).
* **Versioning:** `version` and `train_meta.timestamp_utc` must be present.
* **Determinism:** store `seed`.
* **Integrity:** include SHA-256 over the JSON payload in deployment manifests.

---

## Edge Cases & Policies

* **Negated facts:** Use (1-p(f)). Clamp inputs to ([ε, 1-ε]) (e.g., (ε=1e{-6})) to avoid degenerate products.
* **Zero-rule labels:** If a label has no rules, fallback to prior only (q_y=0\Rightarrow s_y=0). Consider injecting a **bias rule** per label with fixed (r\equiv1) and learnable (c) to act as an intercept.
* **Highly correlated rules:** The independence assumption can overcount. Learning (c_i) typically down-weights redundant rules; for heavy redundancy consider **group-wise dropout** during training or **per-group regularization**.
* **Imbalanced classes:** Set priors (\pi_y) from empirical frequencies or use class-weighted loss.
* **Calibration:** Recommended when you consume probabilities downstream.

---

## Validation Metrics

* **Multiclass log-loss** (primary).
* **Top-1 accuracy**, **macro-F1**.
* **Expected Calibration Error (ECE)** post calibration.
* **Per-label PR-AUC** (optional).
* **Ablations:** accuracy vs. removing each rule (R_i) (importance).

---

## Minimal Reference Pseudocode

```python
def literal_prob(facts, fact, positive):
    p = facts.get(fact, 0.0)
    p = min(max(p, 1e-6), 1 - 1e-6)
    return p if positive else (1.0 - p)

def rule_fire_prob(facts, literals):
    r = 1.0
    for lit in literals:
        r *= literal_prob(facts, lit["fact"], lit["positive"])
    return r

def forward_pass(facts, model):
    # compute q_y
    prod_not = {y: 1.0 for y in model["labels"]}
    for rule in model["rules"]:
        if not rule.get("enabled", True): continue
        r = rule_fire_prob(facts, rule["literals"])
        prod_not[rule["label"]] *= (1.0 - rule["c"] * r)
    q = {y: 1.0 - prod_not[y] for y in model["labels"]}

    # priors & normalize
    priors = model.get("priors", None)
    if priors is None:
        priors = {y: 1.0/len(model["labels"]) for y in model["labels"]}
    s = {y: priors[y] * q[y] for y in model["labels"]}
    Z = sum(s.values()) or 1.0
    p = {y: s[y] / Z for y in model["labels"]}

    # optional Platt per label
    calib = model.get("calibration", {}).get("per_label_platt", None)
    if calib:
        import math
        def sigmoid(z): return 1.0 / (1.0 + math.exp(-z))
        def logit(u): return math.log(u / (1.0 - u + 1e-12) + 1e-12)
        p = {y: sigmoid(calib[y]["a"] * logit(p[y]) + calib[y]["b"]) for y in p}
        Z2 = sum(p.values()) or 1.0
        p = {y: p[y] / Z2 for y in p}

    y_star = max(p.items(), key=lambda kv: kv[1])[0]
    return y_star, p
```

---

## Example

**Rules**

```json
{
  "rules": [
    { "id": "R1", "label": "Accept", "literals": [{"fact":"A","positive":true},{"fact":"B","positive":true}], "init_c": 1.0 },
    { "id": "R2", "label": "Reject", "literals": [{"fact":"A","positive":true},{"fact":"C","positive":true}], "init_c": 0.7 }
  ],
  "labels": ["Accept","Reject"],
  "priors": { "Accept": 0.5, "Reject": 0.5 }
}
```

**One prediction**

```json
{
  "facts": { "A": 0.8, "B": 0.6, "C": 0.3 }
}
```

* (r_{R1}=0.48), (r_{R2}=0.24).
* Suppose trained (c_{R1}=0.95), (c_{R2}=0.70).
* (q_{\text{Accept}}=1-(1-0.95·0.48)=0.456)
* (q_{\text{Reject}}=1-(1-0.70·0.24)=0.168)
* With uniform priors, (p \approx (0.731, 0.269)) → **Accept**.

---

## Optional Extensions

* **Per-rule bias (b_i)**: use (c_i=\sigma(\theta_i)), (r_i' = \sigma(b_i + \log r_i)) to smooth tiny products for long rules.
* **Group-wise (c)**: tie (c) across rules with the same source or template.
* **Alternate fusion**: learn a logit-space linear combiner on ({r_i}) in place of noisy-OR if you have enough data; keep the same storage schema, replacing (c_i) with weights.

---

## Acceptance Checklist

* [ ] JSON schemas validated for `RuleSet`, `TrainingExamples`, `TrainedModel`.
* [ ] Unit tests for: literal probs, rule fire prob, per-label noisy-OR, argmax, calibration.
* [ ] Reproducible training (fixed seed).
* [ ] Metrics reported (log-loss, accuracy, macro-F1).
* [ ] Model version stamped and hashed.

---

If you want, I can generate **ready-to-drop Python/TypeScript** scaffolding (types + trainer + predictor) following this spec.
