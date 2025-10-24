import { WNode } from './WNode.js';
import { WBody } from './WBody.js';
import { WPropStore } from './WPropStore.js';

export class WDoc {
  private body: WBody;
  private propStore: WPropStore;
  private nodeMap: Map<string, WNode>;

  constructor(propStore: WPropStore) {
    this.body = new WBody();
    this.propStore = propStore;
    this.nodeMap = new Map();
    this.rebuildNodeMap();
  }

  getBody(): WBody {
    return this.body;
  }

  getPropStore(): WPropStore {
    return this.propStore;
  }

  getNodeById(id: string): WNode | undefined {
    return this.nodeMap.get(id);
  }

  // Rebuild the entire node map by traversing the tree
  private rebuildNodeMap(): void {
    this.nodeMap.clear();
    this.addNodeToMap(this.body);
  }

  // Recursively add node and its descendants to map
  private addNodeToMap(node: WNode): void {
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
  private removeNodeFromMap(node: WNode): void {
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

  // Update a subtree by replacing a node with a new node
  updateTree(nodeId: string, newNode: WNode): boolean {
    const oldNode = this.nodeMap.get(nodeId);
    if (!oldNode) {
      return false;
    }

    // Find parent of old node
    const parent = this.findParent(this.body, oldNode);
    if (!parent) {
      // Node is the root body itself
      if (oldNode === this.body && newNode instanceof WBody) {
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
  private findParent(root: WNode, target: WNode): WNode | null {
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
