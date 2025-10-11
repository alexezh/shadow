We have two options for figuring out basis:

---

### A) Any vectors allowed → PCA (fast, standard)

Goal: keep ≥95% of total variance.

1. Stack your embeddings into matrix (X\in\mathbb{R}^{N\times d}) (rows = vectors).
2. Mean-center: (\tilde X = X - \bar X).
3. SVD: (\tilde X = U\Sigma V^\top).
4. Choose smallest (K) s.t. (\sum_{i=1}^{K}\sigma_i^2 / \sum_{i}\sigma_i^2 \ge 0.95).
5. Basis = top-(K) right singular vectors (columns of (V)).
6. Project: (X_{\text{hat}} = (\tilde X V_{:,1:K}) V_{:,1:K}^\top + \bar X).

This yields the minimal Frobenius-error rank-(K) subspace.

---

### B) Basis must be chosen **from your set ({A_i})** → Column Subset Selection

Pick (K) originals that span the space well and reconstruct the rest via least squares.

**Rank-revealing (pivoted) QR (recommended):**

1. Arrange columns: (X\in\mathbb{R}^{d\times N}) with columns (A_i).
2. Compute pivoted QR: (XP = QR).
3. Select the first (K) **pivot columns** → indices (S = P_{1:K}).
4. Reconstruct all: (X_{\text{hat}} = X_{:,S},(X_{:,S})^{+},X).
5. Choose smallest (K) with relative error (|X-X_{\text{hat}}|_F/|X|_F \le 0.05).

This is a principled way to get a subset “basis.” (CUR and leverage-score sampling are close relatives.)

**Greedy alternatives** (no SciPy needed):

* **Farthest-point sampling** (normalized vectors, cosine distance): iteratively add the vector farthest from the span of selected ones; stop when residual ≤5%.
* **Simultaneous OMP**: greedily add the atom that most reduces aggregate reconstruction error across all vectors.

---

### Quick Python snippets

**PCA K for 95%**

```python
import numpy as np

def pca_k_for_95(X):  # X: (N, d)
    Xc = X - X.mean(axis=0, keepdims=True)
    s = np.linalg.svd(Xc, full_matrices=False, compute_uv=False)  # singular values
    ev = s**2
    cum = np.cumsum(ev) / ev.sum()
    K = int(np.searchsorted(cum, 0.95) + 1)
    return K, cum
```

**Column subset via pivoted QR (needs SciPy)**

```python
import numpy as np
from scipy.linalg import qr

def select_columns_qr(X, K):  # X: (d, N) columns are A_i
    Q, R, P = qr(X, pivoting=True, mode='economic')
    idx = P[:K]
    S = X[:, idx]
    C = np.linalg.lstsq(S, X, rcond=None)[0]  # coefficients
    Xhat = S @ C
    rel_err = np.linalg.norm(X - Xhat, 'fro') / np.linalg.norm(X, 'fro')
    return idx, rel_err, Xhat
```

---

### Which to use?

* **PCA** if you just need a compact subspace (best reconstruction for a given (K)).
* **Column subset** if you must pick actual embeddings as the basis (interpretable, usable as exemplars, nearest-neighbor friendly).

If you tell me whether “95% accuracy” means **variance explained** or **relative reconstruction error**, I’ll tailor the exact criterion and a ready-to-run script.
