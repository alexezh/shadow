import { YNode, YTextContainer } from './YNode.js';
import { YPropSet } from './YPropSet.js';

/**
 * WRow - Table row containing cells
 */
export class YRow extends YTextContainer {

  constructor(id: string, props: YPropSet, children?: YNode[]) {
    super(id, props, children);
  }
}
