import { YNode, YTextContainer } from './YNode.js';
import { YPropSet } from './YPropSet.js';

/**
 * WCell - Table cell containing content nodes
 */
export class YCell extends YTextContainer {
  constructor(id: string, props: YPropSet, children?: YNode[]) {
    super(id, props, children);
  }
}
