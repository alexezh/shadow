import { YNode, WRange, YTextContainer } from './YNode.js';
import { YPropSet } from './YPropSet.js';

/**
 * WBody - Document body containing child nodes
 */
export class YBody extends YTextContainer {

  constructor(id: string = 'body', props: YPropSet, children?: YNode[]) {
    super(id, props, children);
  }

}

