import { YNode } from './YNode.js';
import { YBody } from './YBody.js';
import { YPropStore } from './YPropStore.js';
import { YStyleStore } from './YStyleStore.js';

export class YDoc {
  private body: YBody;
  private propStore: YPropStore;
  private styleStore: YStyleStore;
  private nodeMap: Map<string, YNode>;

  constructor() {
    this.body = new YBody();
    this.propStore = new YPropStore();
    this.styleStore = new YStyleStore();
    this.nodeMap = new Map();
    this.rebuildNodeMap();
    this.setDocOnAllNodes();
  }

  // Set doc reference on all nodes in the tree
  private setDocOnAllNodes(): void {
    this.setDocOnNode(this.body);
  }

  private setDocOnNode(node: YNode): void {
    node.setDoc(this);
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        this.setDocOnNode(child);
      }
    }
  }

  getBody(): YBody {
    return this.body;
  }

  getPropStore(): YPropStore {
    return this.propStore;
  }

  getStyleStore(): YStyleStore {
    return this.styleStore;
  }

  getNodeById(id: string): YNode | undefined {
    return this.nodeMap.get(id);
  }

  // Rebuild the entire node map by traversing the tree
  rebuildNodeMap(): void {
    this.nodeMap.clear();
    this.addNodeToMap(this.body);
  }

  // Recursively add node and its descendants to map
  private addNodeToMap(node: YNode): void {
    const id = node.getId();
    if (id) {
      this.nodeMap.set(id, node);
    }

    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        this.addNodeToMap(child);
      }
    }
  }

  // Remove node and its descendants from map
  private removeNodeFromMap(node: YNode): void {
    const id = node.getId();
    if (id) {
      this.nodeMap.delete(id);
    }

    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        this.removeNodeFromMap(child);
      }
    }
  }

  // Public method for adding node to map (called by WBody/WTable/etc when adding children)
  addNodeToMapPublic(node: YNode): void {
    node.setDoc(this);
    this.addNodeToMap(node);
  }

  // Public method for removing node from map (called by WBody/WTable/etc when removing children)
  removeNodeFromMapPublic(node: YNode): void {
    this.removeNodeFromMap(node);
  }

  // Update a subtree by replacing a node with a new node
  updateTree(nodeId: string, newNode: YNode): boolean {
    const oldNode = this.nodeMap.get(nodeId);
    if (!oldNode) {
      return false;
    }

    // Find parent of old node
    const parent = this.findParent(this.body, oldNode);
    if (!parent) {
      // Node is the root body itself
      if (oldNode === this.body && newNode instanceof YBody) {
        // Remove old body from map
        this.removeNodeFromMap(this.body);

        // Replace body
        this.body = newNode;

        // Add new body to map
        this.addNodeToMap(this.body);
        return true;
      }
      return false;
    }

    // Get parent's children
    const children = parent.getChildren();
    if (!children) {
      return false;
    }

    // Find index of old node in parent's children
    const index = children.indexOf(oldNode);
    if (index === -1) {
      return false;
    }

    // Remove old node and its descendants from map
    this.removeNodeFromMap(oldNode);

    // Replace in parent's children array
    children[index] = newNode;

    // Add new node and its descendants to map
    this.addNodeToMap(newNode);

    return true;
  }

  // Find the parent of a given node
  private findParent(root: YNode, target: YNode): YNode | null {
    const children = root.getChildren();
    if (!children) {
      return null;
    }

    // Check if target is a direct child
    if (children.includes(target)) {
      return root;
    }

    // Recursively search in children
    for (const child of children) {
      const parent = this.findParent(child, target);
      if (parent) {
        return parent;
      }
    }

    return null;
  }

  // Get hash of entire document
  getHash(): number {
    return this.body.getHash();
  }
}
