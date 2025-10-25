import { YNode, YTextContainer } from './YNode.js';
import { YPropSet } from './YPropSet.js';

/**
 * WTable - Table element containing rows
 */
export class YTable extends YTextContainer {

  constructor(id: string, props: YPropSet, children?: YNode[]) {
    super(id, props, children);
  }
}
