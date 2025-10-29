import { YBody } from './YBody.js';
import { YStyleStore } from './YStyleStore.js';
import { YPropSet } from './YPropSet.js';
export class YDocPart {
    constructor(doc, id, kind, title, body) {
        this.doc = doc;
        this.id = id;
        this.kind = kind;
        this.title = title;
        this.body = body;
    }
}
export class YDoc {
    get parts() {
        return this._parts;
    }
    constructor() {
        this._parts = new Map();
        this.body = new YBody('body', YPropSet.create({}));
        this._parts.set("main", new YDocPart(this, "main", "main", "Main content", this.body));
        this.styleStore = new YStyleStore();
        this.nodeMap = new Map();
        this.linkTree();
    }
    createPart(kind) {
        // Generate a unique part ID
        const partId = `${kind}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Create a new body for the part
        const partBody = new YBody(`body_${partId}`, YPropSet.create({}));
        this.linkNodeInternal(null, partBody);
        // Create the part
        const title = `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${this._parts.size}`;
        const part = new YDocPart(this, partId, kind, title, partBody);
        this._parts.set(partId, part);
        return part;
    }
    // Set doc reference on all nodes in the tree
    linkTree() {
        this.linkNodeInternal(null, this.body);
    }
    linkNodeInternal(parent, node) {
        const id = node.id;
        if (id) {
            this.nodeMap.set(id, node);
        }
        node.setParent(this, parent);
        const children = node.getChildren();
        if (children) {
            for (const child of children) {
                // TODO: remove getChildren from node
                this.linkNodeInternal(node, child);
            }
        }
    }
    // Public method for removing node from map (called by WBody/WTable/etc when removing children)
    unlinkNodeInternal(node) {
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
    getBody() {
        return this.body;
    }
    getStyleStore() {
        return this.styleStore;
    }
    getNodeById(id) {
        return this.nodeMap.get(id);
    }
    // Update a subtree by replacing a node with a new node
    updateTree(nodeId, newNode) {
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
    findParent(root, target) {
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
    getHash() {
        return this.body.getHash();
    }
}
//# sourceMappingURL=YDoc.js.map