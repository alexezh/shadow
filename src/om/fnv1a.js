// Small, allocation-light string & value hashing (FNV-1a 32-bit)
export function fnv1aStep(h, code) {
    h ^= code;
    // h *= 16777619 (but with shifts to stay in 32-bit)
    return (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
}
export function fnv1aSeed() {
    return 0x811c9dc5; // FNV-1a 32-bit offset basis
}
export function hashString(h, s) {
    for (let i = 0; i < s.length; i++)
        h = fnv1aStep(h, s.charCodeAt(i));
    return h;
}
// Hash numbers by their IEEE754 bits (no toString / JSON stringify)
const _numBuf = new ArrayBuffer(8);
const _numView = new DataView(_numBuf);
function hashNumber(h, n) {
    // Normalize -0 to 0 to avoid distinct hashes
    if (Object.is(n, -0))
        n = 0;
    _numView.setFloat64(0, n, true);
    for (let i = 0; i < 8; i++)
        h = fnv1aStep(h, _numView.getUint8(i));
    return h;
}
export function hashValue(h, v) {
    switch (typeof v) {
        case 'string':
            h = fnv1aStep(h, 0x01);
            return hashString(h, v);
        case 'number':
            h = fnv1aStep(h, 0x02);
            return hashNumber(h, v);
        case 'boolean':
            h = fnv1aStep(h, 0x03);
            return fnv1aStep(h, v ? 1 : 0);
        case 'undefined':
            h = fnv1aStep(h, 0x04);
            return h;
        case 'object':
            if (v === null) {
                h = fnv1aStep(h, 0x05);
                return h;
            }
            if (Array.isArray(v)) {
                h = fnv1aStep(h, 0x06);
                for (let i = 0; i < v.length; i++) {
                    h = fnv1aStep(h, 0x2C); // comma sep
                    h = hashValue(h, v[i]);
                }
                return h;
            }
            // For plain objects (rare in CSS-like props), do a cheap stable hash
            // without JSON.stringify: sort keys with default lexicographic compare.
            h = fnv1aStep(h, 0x07);
            const k = Object.keys(v).sort(); // fast; avoids localeCompare
            for (let i = 0; i < k.length; i++) {
                h = fnv1aStep(h, 0x3A); // ':'
                h = hashString(h, k[i]);
                h = fnv1aStep(h, 0x3D); // '='
                h = hashValue(h, v[k[i]]);
            }
            return h;
        case 'symbol':
            h = fnv1aStep(h, 0x08);
            return hashString(h, String(v.description ?? ''));
        case 'function':
            // Treat functions by their name only to stay cheap & stable
            h = fnv1aStep(h, 0x09);
            return hashString(h, v.name || '');
        default:
            return h;
    }
}
//# sourceMappingURL=fnv1a.js.map