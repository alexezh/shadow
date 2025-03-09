/**
 * The idea is to generate histogram of words, then quantize the count.
 * One challenge is low frequency entries especially with count 1; they might completely
 * disappear across documents. We are going to  
 */
export class HistogramTextSignature {
  private _histogram = new Map<string, number>();

  public addWord(w: string): void {
    let v = this._histogram.get(w);
    if (v === undefined) {
      v = 1;
    } else {
      v++;
    }
    this._histogram.set(w, v);
  }

  public computeKey(): string {
    let lowFreq = 0;
    for (let [_, c] of this._histogram) {
      //if (c < )
    }
    return "";
  }
}

