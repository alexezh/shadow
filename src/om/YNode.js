export function getSelectionKind(range) {
    if (range.startOffset === range.endOffset && range.startElement === range.endElement) {
        return "point";
    }
    else {
        return "range";
    }
}
/**
 * WNode - Root type for document tree
 */
export class YNode {
    get id() {
        return this._id;
    }
    get doc() {
        return this._doc;
    }
    get parent() {
        return this._parent;
    }
    get props() {
        return this._props;
    }
    constructor(id, props) {
        this.cachedHash = null;
        this._doc = null; // Reference to parent WDoc
        this._parent = null;
        this._id = id;
        this._props = props;
    }
    /**
     * Set the parent document reference
     */
    setParent(doc, parent) {
        this._doc = doc;
        this._parent = parent;
    }
    setProps(props) {
        this._props = props;
        this.invalidateHash();
    }
    /**
     * Returns a 32-bit hash value for this node (cached)
     */
    getHash() {
        if (this.cachedHash === null) {
            this.cachedHash = this.computeHash();
        }
        return this.cachedHash;
    }
    /**
     * Invalidate cached hash (call when node changes)
     */
    invalidateHash() {
        this.cachedHash = null;
    }
}
export class YTextContainer extends YNode {
    constructor(id, props, children) {
        super(id, props);
        this.children = children || [];
    }
    hasChildren() {
        return true;
    }
    getChildren() {
        return this.children;
    }
    getChildrenRange(range, shallow = true) {
        if (!range) {
            return this.children;
        }
        // Return iterator
        return this.getChildrenIterator(range, shallow);
    }
    /**
     * Get iterator for children in range
     */
    *getChildrenIterator(range, shallow) {
        // Find start and end indices
        let startIndex = -1;
        if (range.startElement) {
            // Find start node index
            for (let i = 0; i < this.children.length; i++) {
                if (this.children[i].id === range.startElement) {
                    startIndex = i;
                    break;
                }
            }
        }
        else {
            startIndex = 0;
        }
        // If start element not found, yield nothing
        if (startIndex === -1) {
            return;
        }
        // Yield children in range
        for (let i = startIndex;; i++) {
            const child = this.children[i];
            yield child;
            if (range.endElement) {
                if (child.id === range.endElement) {
                    break;
                }
            }
            // If deep, yield all descendants
            if (!shallow) {
                yield* this.getDescendantsIterator(child);
            }
        }
    }
    /**
     * Get iterator for all descendants of a node
     */
    *getDescendantsIterator(node) {
        const children = node.getChildren();
        if (children) {
            for (const child of children) {
                yield child;
                yield* this.getDescendantsIterator(child);
            }
        }
    }
    spliceChildren(idx, deleteCount, ...added) {
        for (let i = 0; i < deleteCount; i++) {
            this.doc?.unlinkNodeInternal(this.children[idx + i]);
        }
        this.children.splice(idx, deleteCount, ...added);
        for (let node of added) {
            this.doc?.linkNodeInternal(this, node);
        }
    }
    indexOf(node) {
        return this.children.indexOf(node);
    }
    insertAfter(sibling, ...nodes) {
        let idx = 0;
        if (sibling) {
            idx = this.children.indexOf(sibling);
            if (idx < 0) {
                return false;
            }
        }
        this.children.splice(0, 0, ...nodes);
        for (let node of nodes) {
            this.doc?.linkNodeInternal(this, node);
        }
        return true;
    }
    addChild(node) {
        this.children.push(node);
        this.invalidateHash();
        // Update node map if doc is set
        const doc = this.doc;
        if (doc) {
            doc.linkNodeInternal(this, node);
        }
    }
    insertChild(index, node) {
        this.children.splice(index, 0, node);
        this.invalidateHash();
        // Update node map if doc is set
        const doc = this.doc;
        if (doc) {
            doc.linkNodeInternal(this, node);
        }
    }
    removeChild(index) {
        const result = this.children.splice(index, 1)[0];
        this.invalidateHash();
        // Update node map if doc is set
        const doc = this._doc;
        if (doc && result) {
            doc.unlinkNodeInternal(result);
        }
        return result;
    }
    /**
     * Compute a 32-bit hash value for this cell
     */
    computeHash() {
        let hash = 0;
        // Hash the ID
        for (let i = 0; i < this._id.length; i++) {
            const char = this._id.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & 0x7FFFFFFF;
        }
        // Hash all children
        for (const child of this.children) {
            hash = ((hash << 5) - hash) + child.getHash();
            hash = hash & 0x7FFFFFFF;
        }
        return hash;
    }
}
//# sourceMappingURL=YNode.js.map