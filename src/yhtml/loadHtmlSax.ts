import { Parser } from 'htmlparser2';
import { make31BitId } from '../om/make31bitid.js';
import { YNode, YTextContainer } from '../om/YNode.js';
import { YPara } from '../om/YPara.js';
import { YBody } from '../om/YBody.js';
import { YTable } from '../om/YTable.js';
import { YRow } from '../om/YRow.js';
import { YCell } from '../om/YCell.js';
import { YStr } from '../om/YStr.js';
import { YPropSet } from '../om/YPropSet.js';

/**
 * Context for tracking current YNode being built
 */
type NodeContext = {
  saxNode: SaxNode;
  yNode?: YNode;
  textBuffer?: string; // Accumulated text for paragraphs
};

/**
 * Streaming HTML parser using SAX-style events
 * Creates YNode objects (YTable, YRow, YCell, YPara) as HTML is parsed
 */
export class HtmlSaxLoader {
  public root?: SaxNode;
  public current?: SaxNode;
  public rootYNode?: YNode;
  public currentYNode?: YNode;

  private parser: Parser;
  private nodeStack: SaxNode[] = [];
  private contextStack: NodeContext[] = [];
  private currentContext?: NodeContext;

  constructor() {
    this.parser = new Parser({
      onopentag: (name, attribs) => {
        // Create SaxNode with attributes and generated/existing ID
        const id = attribs.id || make31BitId();
        const newSaxNode: SaxNode = {
          tag: name,
          id: id,
          atts: { ...attribs },
          children: []
        };

        // Extract properties from attributes
        const props = this.extractElementProps(attribs);
        const propSet = YPropSet.create(props);

        // Create corresponding YNode based on tag
        let newYNode: YNode | undefined;

        switch (name.toLowerCase()) {
          case 'table':
            newYNode = new YTable(id, propSet);
            break;
          case 'tr':
            newYNode = new YRow(id, propSet);
            break;
          case 'td':
          case 'th':
            newYNode = new YCell(id, propSet);
            break;
          case 'body':
            newYNode = new YBody(id, propSet);
            break;
          case 'p':
            // Paragraph will be created when we have text content
            // For now just track in context
            break;
          default:
            // Other tags don't create YNodes yet
            break;
        }

        // Create context for this node
        const newContext: NodeContext = {
          saxNode: newSaxNode,
          yNode: newYNode,
          textBuffer: ''
        };

        // Add to parent if exists
        if (this.current) {
          if (!this.current.children) {
            this.current.children = [];
          }
          this.current.children.push(newSaxNode);
          this.nodeStack.push(this.current);

          // Add YNode to parent YNode if both exist
          if (newYNode && this.currentYNode && this.currentYNode instanceof YTextContainer) {
            (this.currentYNode as any).addChild(newYNode);
          }

          // Push current context to stack
          if (this.currentContext) {
            this.contextStack.push(this.currentContext);
          }
        } else {
          // First node becomes root
          this.root = newSaxNode;
          this.rootYNode = newYNode;
        }

        // Move to new node
        this.current = newSaxNode;
        this.currentYNode = newYNode;
        this.currentContext = newContext;
      },

      ontext: (text) => {
        const trimmed = text.trim();
        if (this.currentContext && trimmed.length > 0) {
          // Accumulate text in current context
          if (this.currentContext.textBuffer !== undefined) {
            this.currentContext.textBuffer += text;
          }

          // Also add text to SaxNode tree
          const textNode: SaxNode = {
            tag: '#text',
            id: make31BitId(),
            atts: { text: text },
            children: undefined
          };

          if (this.current) {
            if (!this.current.children) {
              this.current.children = [];
            }
            this.current.children.push(textNode);
          }
        }
      },

      onclosetag: (name) => {
        // Handle text buffer for paragraph tags
        if (name.toLowerCase() === 'p' && this.currentContext?.textBuffer) {
          const text = this.currentContext.textBuffer.trim();
          if (text.length > 0 && this.current) {
            // Create YPara with accumulated text
            const props = this.extractElementProps(this.current.atts);
            const propSet = YPropSet.create(props);
            const str = new YStr();
            str.append(text, propSet);
            const para = new YPara(this.current.id, propSet, str);

            // Add to parent YNode
            if (this.contextStack.length > 0) {
              const parentContext = this.contextStack[this.contextStack.length - 1];
              if (parentContext.yNode && parentContext.yNode instanceof YTextContainer) {
                (parentContext.yNode as any).addChild(para);
              }
            }

            this.currentContext.yNode = para;
          }
        }

        // Pop back to parent node
        if (this.nodeStack.length > 0) {
          this.current = this.nodeStack.pop();
        }

        if (this.contextStack.length > 0) {
          this.currentContext = this.contextStack.pop();
          this.currentYNode = this.currentContext?.yNode;
        } else {
          this.currentContext = undefined;
          this.currentYNode = undefined;
        }
      }
    });
  }

  private extractElementProps(attribs: { [key: string]: string }): { [key: string]: any } {
    const props: { [key: string]: any } = {};

    // Parse style attribute
    const styleAttr = attribs['style'];
    if (styleAttr) {
      this.parseInlineStyle(styleAttr, props);
    }

    // Parse other common attributes
    if (attribs['align']) {
      props['text-align'] = attribs['align'];
    }
    if (attribs['width']) {
      props['width'] = attribs['width'];
    }
    if (attribs['height']) {
      props['height'] = attribs['height'];
    }
    if (attribs['bgcolor']) {
      props['background-color'] = attribs['bgcolor'];
    }
    if (attribs['border']) {
      // HTML border attribute specifies width, convert to full CSS border
      props['border'] = `${attribs['border']}px solid black`;
    }
    if (attribs['colspan']) {
      props['colspan'] = attribs['colspan'];
    }
    if (attribs['rowspan']) {
      props['rowspan'] = attribs['rowspan'];
    }

    return props;
  }

  private parseInlineStyle(styleAttr: string, props: { [key: string]: any }): void {
    const styles = styleAttr.split(';');
    for (const style of styles) {
      const [key, value] = style.split(':').map(s => s.trim());
      if (key && value) {
        props[key] = value;
      }
    }
  }

  public write(text: string, eos: boolean) {
    // Feed text to parser
    this.parser.write(text);

    // Signal end of stream if specified
    if (eos) {
      this.parser.end();
    }
  }
}

export type SaxNode = {
  tag: string;
  id: string;
  atts: { [key: string]: string }
  children?: SaxNode[];
}