export const INITIAL_RULES = [
  {
    terms: ['import', 'document'],
    text: `
**to import a document into a library:**
-use find_file tool to lookup a file
-read document text using get_contentrange method. Use 'text' as format. Assume that user specified file name in a prompt.
-split document into sections and subsections if any. 
-Use markdown headers as well as semantic of the document; add sections when needed even if there is no section in markdown. 
-For each section generate short summary and 3-7 keywords and invoke store_asset passing:
  title: summary of section
  level: level of section 1,2
  start_para: id pf first paragraph
  end_para: id of the last paragraph
  summary: summary of section

  paragraph ids specified as {id=xyz} at the end of paragraph
`
  },

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
];