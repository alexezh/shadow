// 31-bit modulus and mask
const MOD31N = 1n << 31n;            // 2^31
const MASK31N = MOD31N - 1n;         // 0x7fffffff
const MASK31 = 0x7fffffff >>> 0;    // for bitwise ops

// Pick any odd 'a' (invertible mod 2^31) and any 'b'
const A = 0x27d4eb2d >>> 0;   // example odd multiplier
const B = 0x9e3779b9 >>> 0;   // example offset

// Modular inverse of an odd number modulo 2^31 (via extended Euclid) using BigInt
function modInvOdd31(a: number): number {
  let aa = BigInt(a >>> 0) & MASK31N;
  let m = MOD31N;
  let t = 0n, newT = 1n;
  let r = m, newR = aa;
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r !== 1n) throw new Error("a not invertible (must be odd)");
  if (t < 0n) t += m;
  return Number(t & MASK31N) >>> 0;
}

const A_INV = modInvOdd31(A);

// Multiply modulo 2^31 using 32-bit wrap, then mask to 31 bits.
function mulMod31(u: number, v: number): number {
  // Math.imul gives 32-bit wrapped product; '& MASK31' keeps low 31 bits
  return (Math.imul(u >>> 0, v >>> 0) & MASK31) >>> 0;
}

function addMod31(u: number, v: number): number {
  return ((u >>> 0) + (v >>> 0)) & MASK31;
}

// LLM prefers IDs which look random. DB IDs are 1-N so we are going to scramble them
// Forward: id (1..N) -> 31-bit y
export function idToY(id: number): string {
  const x = (id - 1) >>> 0;                    // 0..N-1
  const y = addMod31(mulMod31(A, x), B);          // y in 0..2^31-1
  return y.toString(36);
}

// Inverse: y -> id (valid only if y came from idToY)
export function yToId(ys: string): number {
  const y = parseInt(ys, 36);
  const t = addMod31((y >>> 0), (-(B >>> 0)) & MASK31);
  const x = mulMod31(A_INV, t);
  return (x + 1) >>> 0;                        // back to 1..N
}
