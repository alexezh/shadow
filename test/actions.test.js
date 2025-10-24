const { WDoc } = require('../dist/om/WDoc.js');
const { WPara } = require('../dist/om/WPara.js');
const { WStr } = require('../dist/om/WStr.js');
const { handleRunAction } = require('../dist/clippy/handleRunAction.js');

// Create a session with a document
const doc = new WDoc();
const body = doc.getBody();

// Add some paragraphs
const p1 = new WPara('p1', new WStr('Hello World'));
const p2 = new WPara('p2', new WStr('Second paragraph'));
body.addChild(p1);
body.addChild(p2);

// Rebuild node map after adding children
const session = {
  id: 'test',
  doc: doc,
  pendingChanges: [],
  changeResolvers: []
};

console.log('=== Test 1: Type action ===');
let result = handleRunAction(session, {
  sessionId: 'test',
  action: 'type',
  range: { startElement: 'p1', startOffset: 5, endElement: 'p1', endOffset: 5 },
  text: ' Beautiful'
});
console.log('Changes:', result.changes.length);
console.log('New position:', result.newPosition);
console.log('Text after type:', p1.getStr().getText());
console.log('Expected: "Hello Beautiful World"');

console.log('\n=== Test 2: Backspace action ===');
result = handleRunAction(session, {
  sessionId: 'test',
  action: 'backspace',
  range: { startElement: 'p1', startOffset: 16, endElement: 'p1', endOffset: 16 }
});
console.log('Changes:', result.changes.length);
console.log('New position:', result.newPosition);
console.log('Text after backspace:', p1.getStr().getText());
console.log('Expected: "Hello Beautiful Word"');

console.log('\n=== Test 3: Delete action ===');
result = handleRunAction(session, {
  sessionId: 'test',
  action: 'delete',
  range: { startElement: 'p1', startOffset: 15, endElement: 'p1', endOffset: 15 }
});
console.log('Changes:', result.changes.length);
console.log('New position:', result.newPosition);
console.log('Text after delete:', p1.getStr().getText());
console.log('Expected: "Hello Beautiful Word"');

console.log('\n=== Test 4: Split action ===');
result = handleRunAction(session, {
  sessionId: 'test',
  action: 'split',
  range: { startElement: 'p1', startOffset: 5, endElement: 'p1', endOffset: 5 }
});
console.log('Changes:', result.changes.length);
console.log('New position:', result.newPosition);
console.log('Children count:', body.getChildren().length);
console.log('First para text:', body.getChildren()[0].getStr().getText());
console.log('Second para text:', body.getChildren()[1].getStr().getText());
console.log('Expected: 3 children, "Hello" and " Beautiful Word"');

console.log('\n=== Test 5: Backspace at paragraph start (merge) ===');
result = handleRunAction(session, {
  sessionId: 'test',
  action: 'backspace',
  range: { startElement: body.getChildren()[1].getId(), startOffset: 0, endElement: body.getChildren()[1].getId(), endOffset: 0 }
});
console.log('Changes:', result.changes.length);
console.log('New position:', result.newPosition);
console.log('Children count:', body.getChildren().length);
console.log('Merged text:', body.getChildren()[0].getStr().getText());
console.log('Expected: 2 children, "Hello Beautiful Word"');

console.log('\n=== Test 6: Delete at paragraph end (merge) ===');
result = handleRunAction(session, {
  sessionId: 'test',
  action: 'delete',
  range: { startElement: 'p1', startOffset: p1.getStr().getLength(), endElement: 'p1', endOffset: p1.getStr().getLength() }
});
console.log('Changes:', result.changes.length);
console.log('New position:', result.newPosition);
console.log('Children count:', body.getChildren().length);
console.log('Merged text:', body.getChildren()[0].getStr().getText());
console.log('Expected: 1 child, "Hello Beautiful WordSecond paragraph"');

console.log('\n' + '='.repeat(50));
console.log('All action tests completed!');
console.log('='.repeat(50));
