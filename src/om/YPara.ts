import { make31BitId } from '../make31bitid.js';
import { YNode } from './YNode.js';
import { YPropCache, YPropSet } from './YPropSet.js';
import { YStr } from './YStr.js';

const paraProp = "--data-para";

/**
 * WPara - Paragraph node that points to WStr
 */
export class YPara extends YNode {
  private _str: YStr;

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

  hasChildren(): boolean {
    return false;
  }

  getChildren(): YNode[] | null {
    return null;
  }

  public splitParagraph(pos: number): YPara {
    const newStr = this._str.split(pos);

    this._str.append("\n", newStr.getPropsAt(-1));

    // Create new paragraph for second part
    const newId = make31BitId();
    const newPara = new YPara(newId, this.props, newStr);

    return newPara;
  }

  public deleteRange(startAt: number, deleteCount: number): void {
    this._str.delete(startAt, deleteCount);
    this.invalidateHash();
  }

  private updateEopProps(paraProps: YPropSet): void {
    const eopProps = this._str.getPropsAt(-1);
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
