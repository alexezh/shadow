export interface ISwmNode {

}

export class SwmSemantic {
  public getContainer(node: ISwmNode): ISwmSemanticContainer | null {
    return null;
  }
}

export interface ISwmSemanticContainer {
  startNode: ISwmNode;
  endNode: ISwmNode;
}
