export const INITIAL_RULES = [
  {
    terms: ['edit', 'document'],
    text: `
**to edit a document:**
editing is done by ranges identified by paragraph ids. paragraph ids specified as {id=xyz} at the end of paragraph
use get_current_range to retrive the current editing range (usually last used)
use find_ranges to locate range given some text as references. If a user asks "find xyz", invoke find_range with list of 
variations to search for. 
`
  },
  {
    terms: ['image', 'add'],
    text: `
**to add an image:**
use add_image. 
`
  },
];