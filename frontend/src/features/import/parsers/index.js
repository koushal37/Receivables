// Parser registry. Each parser module exports:
//   parse(file, { onProgress }) -> Promise<Array<{ fields, method }>>
// `fields` are raw invoice fields (see extract/draft.js), `method` is 'text' | 'ocr' | 'structured'.
// To support a new format: add it to fileTypes.js and register a loader here.
export const PARSERS = {
  pdf: () => import('./pdf.js'),
  image: () => import('./image.js'),
  spreadsheet: () => import('./spreadsheet.js'),
  docx: () => import('./docx.js'),
  json: () => import('./json.js'),
  xml: () => import('./xml.js'),
};
