import { YNode, YTextContainer } from './YNode.js';
import { YBody } from './YBody.js';
import { YStyleStore } from './YStyleStore.js';
import { YPropSet } from './YPropSet.js';

export type YDocPartKind = "main" | "draft" | "summary" | "chat";

export class YDocPart {
  public readonly body?: YBody;
  public readonly doc: YDoc;
  public readonly id: string;
  public readonly kind: YDocPartKind;
  public readonly title: string;

  public constructor(doc: YDoc, id: string, kind: YDocPartKind, title: string, body?: YBody) {
    this.doc = doc;
    this.id = id;
    this.kind = kind;
    this.title = title;
    this.body = body;
  }
}

export class YDoc {
  private body: YBody;
  private styleStore: YStyleStore;
  private nodeMap: Map<string, YNode>;
  private readonly _parts = new Map<string, YDocPart>();

  public get parts(): ReadonlyMap<string, YDocPart> {
    return this._parts;
  }

  constructor() {
    this.body = new YBody('body', YPropSet.create({}));
    this._parts.set("main", new YDocPart(this, "main", "main", "Main content", this.body))
    this.styleStore = new YStyleStore();
    this.nodeMap = new Map();
    this.linkTree();
  }

  public createPart(kind: YDocPartKind): string {
    // Generate a unique part ID
    const partId = `${kind}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create a new body for the part
    const partBody = new YBody(`body_${partId}`, YPropSet.create({}));
    this.linkNodeInternal(null, partBody);

    // Create the part
    const title = `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${this._parts.size}`;
    const part = new YDocPart(this, partId, kind, title, partBody);
    this._parts.set(partId, part);

    return partId;
  }

  // Set doc reference on all nodes in the tree
  private linkTree(): void {
    this.linkNodeInternal(null, this.body);
  }

  public linkNodeInternal(parent: YTextContainer | null, node: YNode): void {
    const id = node.id;
    if (id) {
      this.nodeMap.set(id, node);
    }
    node.setParent(this, parent);
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        // TODO: remove getChildren from node
        this.linkNodeInternal(node as YTextContainer, child);
      }
    }
  }

  // Public method for removing node from map (called by WBody/WTable/etc when removing children)
  unlinkNodeInternal(node: YNode): void {
    const id = node.id;
    if (id) {
      this.nodeMap.delete(id);
    }

    node.setParent(null, null);

    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        this.unlinkNodeInternal(child);
      }
    }

  }

  getBody(): YBody {
    return this.body;
  }

  getStyleStore(): YStyleStore {
    return this.styleStore;
  }

  getNodeById(id: string): YNode | undefined {
    return this.nodeMap.get(id);
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
        this.unlinkNodeInternal(this.body);

        // Replace body
        this.body = newNode;

        // Add new body to map
        this.linkNodeInternal(null, this.body);
        return true;
      }
      return false;
    }

    // Find index of old node in parent's children
    const index = parent.indexOf(oldNode);
    if (index === -1) {
      return false;
    }

    // Replace in parent's children array
    parent.spliceChildren(index, 1, newNode);

    return true;
  }

  // Find the parent of a given node
  private findParent(root: YNode, target: YNode): YTextContainer | null {
    const children = root.getChildren();
    if (!children) {
      return null;
    }

    // Check if target is a direct child
    if (children.includes(target)) {
      return root as YTextContainer;
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
