Make set of classes

WStr mainstain string enging wiht \n and array of int IDs to propset
WPropStore - maintains map of int ID to set of CSS properties - WPropSet  { string -> any }
WNode - root type for tree
WPara, WTable, WCell, WRow, WBody. Each element has ID. All but WPara have children arrays. WPara points to WStr
WStr, WPropSet and all WNode have getHash() which returns int32 hash value

HtmlWriter - writer class accumulating HTML parts which can create string
set of standalong function

makeHtml(node) - makes HTML for node. Wrap each char into span with WPropSet as inline type. \n prop applied on paragraph 

