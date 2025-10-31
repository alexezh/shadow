import { make31BitId } from './make31bitid.js';
import type { YCommentThread } from './YCommentThread.js';
import { YNode } from './YNode.js';
import { YPropCache, YPropSet } from './YPropSet.js';
import { YStr } from './YStr.js';

/**
 * copy of EOP props, ! props excluded from html
 */
export const paraProp = "!data-para";

/**
 * source id in form partid!objid
 */
export const sourceIdProp = "data-sourceid";

/**
 * IDs of threads
 */
export const threadsProp = "data-threads";
export const markerTypeProp = "data-y-markertype";

/**
 * WPara - Paragraph node that points to WStr
 */
export class YPara extends YNode {
  private _str: YStr;
  private _threads: YCommentThread[] | undefined;

  public get length(): number {
    return this._str.length;
  }

  constructor(id: string, props: YPropSet, str?: YStr) {
    super(id, props);
    this._str = str || new YStr("\n");
    if (this._str.getCharAt(-1) !== "\n") {
      this._str.append("\n", YPropSet.create({}))
    }
    this.updateEopProps(props);
  }

  override setProps(props: YPropSet): void {
    super.setProps(props);
    this.updateEopProps(props)
  }

  getText(): string {
    return this._str.text;
  }

  getTextAttrs(): ReadonlyArray<YPropSet> {
    return this._str.getAttr();
  }

  getAttrAt(pos: number): YPropSet {
    return this._str.getAttrAt(pos);
  }

  hasChildren(): boolean {
    return false;
  }

  getChildren(): YNode[] | null {
    return null;
  }

  attachThread(thread: YCommentThread) {
    if (!this._threads) {
      this._threads = [];
    }
    this._threads.push(thread);
  }

  public applyFormat(startAt: number, count: number, func: (props: { [key: string]: any }) => void) {
    const end = (count > 0) ? startAt + count : this._str.length + count;

    // small optimization to avoid allocs
    let prevProp = undefined;
    let prevUpdProp = undefined
    for (let idx = startAt; idx < end; idx++) {
      const prop = this._str.getAttrAt(idx);
      if (prop === prevProp) {
        this._str.setPropAt(idx, prevUpdProp!);
      } else {
        const updProp = YPropCache.instance.update(prop, func);
        this._str.setPropAt(idx, updProp);
        prevProp = prop;
        prevUpdProp = updProp;
      }
    }
  }

  public splitParagraph(pos: number): YPara {
    const newStr = this._str.split(pos);

    this._str.append("\n", newStr.getAttrAt(-1));

    // Create new paragraph for second part
    const newId = make31BitId();
    const newPara = new YPara(newId, this.props, newStr);

    return newPara;
  }

  public deleteRange(startAt: number, deleteCount: number = -1): void {
    deleteCount = (deleteCount > 0) ? deleteCount : this._str.length - startAt;
    // keep EOP
    if (startAt + deleteCount >= this._str.length - 1) {
      deleteCount = this._str.length - 1 - startAt;
    }

    this._str.delete(startAt, deleteCount);
    this.invalidateHash();
  }

  public mergeParagraph(right: YPara): void {
    // delete EOP
    this._str.delete(this._str.length - 1, 1);
    this._str.appendY(right._str);
    this.updateEopProps(right.props);
    this.invalidateHash();
  }

  public insertTextAt(pos: number, text: string, props: YPropSet): void {
    this._str.insertAt(pos, text, props);
  }

  private updateEopProps(paraProps: YPropSet): void {
    const eopProps = this._str.getAttrAt(-1);
    this._str.setPropAt(-1, YPropCache.instance.update(eopProps, (props: { [key: string]: any }) => {
      props[paraProp] = paraProps;
    }));
  }

  /**
   * Compute a 32-bit hash value for this paragraph
   */
  protected computeHash(): number {
    let hash = 0;

    // Hash the ID
    for (let i = 0; i < this._id.length; i++) {
      const char = this._id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF;
    }

    // Hash the string content
    hash = ((hash << 5) - hash) + this._str.getHash();
    hash = hash & 0x7FFFFFFF;

    return hash;
  }
}
