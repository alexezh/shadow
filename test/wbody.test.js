const { WBody } = require('../dist/om/WBody.js');
const { WPara } = require('../dist/om/WPara.js');
const { WStr } = require('../dist/om/WStr.js');

// Create test document
const body = new WBody('body');
const p1 = new WPara('p1', new WStr('Paragraph 1'));
const p2 = new WPara('p2', new WStr('Paragraph 2'));
const p3 = new WPara('p3', new WStr('Paragraph 3'));

body.addChild(p1);
body.addChild(p2);
body.addChild(p3);

// Test 1: Get all children (array)
console.log('Test 1: Get all children');
const all = body.getChildren();
console.log('Type:', Array.isArray(all) ? 'Array' : 'Iterator');
console.log('Count:', all.length);
console.log('IDs:', all.map(n => n.getId()).join(', '));
console.log('✓ Expected: Array with 3 children (p1, p2, p3)');

// Test 2: Get children in range (iterator, shallow)
console.log('\nTest 2: Get children in range (p1 to p2, shallow)');
const range1 = {
  startElement: 'p1',
  startOffset: 0,
  endElement: 'p2',
  endOffset: 0
};
const iter1 = body.getChildren(range1, true);
console.log('Type:', typeof iter1[Symbol.iterator] === 'function' ? 'Iterator' : 'Other');
const rangeChildren = Array.from(iter1);
console.log('Count:', rangeChildren.length);
console.log('IDs:', rangeChildren.map(n => n.getId()).join(', '));
console.log('✓ Expected: Iterator with 2 children (p1, p2)');

// Test 3: Get children from middle to end
console.log('\nTest 3: Get children from p2 to p3');
const range2 = {
  startElement: 'p2',
  startOffset: 0,
  endElement: 'p3',
  endOffset: 0
};
const iter2 = body.getChildren(range2, true);
const rangeChildren2 = Array.from(iter2);
console.log('Count:', rangeChildren2.length);
console.log('IDs:', rangeChildren2.map(n => n.getId()).join(', '));
console.log('✓ Expected: Iterator with 2 children (p2, p3)');

// Test 4: Nested structure with deep enumeration
console.log('\nTest 4: Nested structure with deep enumeration');
const body2 = new WBody('body2');
const container = new WBody('container');
const nested1 = new WPara('nested1', new WStr('Nested 1'));
const nested2 = new WPara('nested2', new WStr('Nested 2'));
container.addChild(nested1);
container.addChild(nested2);
body2.addChild(container);
body2.addChild(new WPara('p4', new WStr('Paragraph 4')));

const range3 = {
  startElement: 'container',
  startOffset: 0,
  endElement: 'p4',
  endOffset: 0
};

console.log('Shallow enumeration:');
const shallowIter = body2.getChildren(range3, true);
const shallow = Array.from(shallowIter);
console.log('  Count:', shallow.length);
console.log('  IDs:', shallow.map(n => n.getId()).join(', '));
console.log('  ✓ Expected: 2 nodes (container, p4)');

console.log('Deep enumeration:');
const deepIter = body2.getChildren(range3, false);
const deep = Array.from(deepIter);
console.log('  Count:', deep.length);
console.log('  IDs:', deep.map(n => n.getId()).join(', '));
console.log('  ✓ Expected: 4 nodes (container, nested1, nested2, p4)');

// Test 5: Invalid range (start not found)
console.log('\nTest 5: Invalid range (start element not found)');
const invalidRange = {
  startElement: 'nonexistent',
  startOffset: 0,
  endElement: 'p2',
  endOffset: 0
};
const invalidIter = body.getChildren(invalidRange, true);
const invalidResult = Array.from(invalidIter);
console.log('Count:', invalidResult.length);
console.log('✓ Expected: 0 children (start element not found)');

// Summary
console.log('\n' + '='.repeat(50));
console.log('All tests completed!');
console.log('='.repeat(50));
