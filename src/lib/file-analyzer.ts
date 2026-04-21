/**
 * File Analyzer — extract exports, types, and function signatures from TS/JS/Python files.
 * Uses regex-based parsing (no AST dependency).
 */

export interface FileAnalysis {
  path: string;
  language: 'typescript' | 'javascript' | 'python' | 'unknown';
  loc: number;
  exports: string[];
  types: string[];
  functions: string[];
  imports: string[];
}

/** Detect language from file extension */
function detectLanguage(filePath: string): FileAnalysis['language'] {
  if (/\.(ts|tsx)$/.test(filePath)) return 'typescript';
  if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) return 'javascript';
  if (/\.py$/.test(filePath)) return 'python';
  return 'unknown';
}

/** Extract exported symbols from TypeScript/JavaScript */
function extractTSExports(content: string): string[] {
  const exports: string[] = [];
  const patterns = [
    /export\s+(?:default\s+)?(?:function|const|let|var|class|enum)\s+(\w+)/g,
    /export\s+(?:default\s+)?(?:interface|type)\s+(\w+)/g,
    /export\s*\{([^}]+)\}/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern === patterns[2]) {
        // Named re-exports: export { Foo, Bar }
        match[1].split(',').forEach(s => {
          const name = s.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) exports.push(name);
        });
      } else {
        exports.push(match[1]);
      }
    }
  }
  return Array.from(new Set(exports));
}

/** Extract type/interface definitions from TypeScript */
function extractTSTypes(content: string): string[] {
  const types: string[] = [];
  const pattern = /(?:export\s+)?(?:interface|type)\s+(\w+)(?:<[^>]*>)?\s*[={]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    types.push(match[1]);
  }
  return Array.from(new Set(types));
}

/** Extract function signatures from TypeScript/JavaScript */
function extractTSFunctions(content: string): string[] {
  const functions: string[] = [];
  const patterns = [
    // export function foo(args): return
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))(?:\s*:\s*([^\n{]+))?/g,
    // export const foo = (args) =>
    /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^\n=]+))?\s*=>/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const args = pattern === patterns[0] ? match[2] : `(${match[2]})`;
      const ret = match[3]?.trim();
      functions.push(ret ? `${name}${args}: ${ret}` : `${name}${args}`);
    }
  }
  return Array.from(new Set(functions));
}

/** Extract imports from TypeScript/JavaScript */
function extractTSImports(content: string): string[] {
  const imports: string[] = [];
  const pattern = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return Array.from(new Set(imports));
}

/** Extract exports/functions from Python */
function extractPythonSymbols(content: string): { exports: string[]; functions: string[]; types: string[] } {
  const functions: string[] = [];
  const types: string[] = [];
  const exports: string[] = [];

  // Functions: def foo(args) -> return:
  const funcPattern = /^def\s+(\w+)\s*(\([^)]*\))(?:\s*->\s*([^\n:]+))?/gm;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    const name = match[1];
    if (!name.startsWith('_')) {
      functions.push(match[3] ? `${name}${match[2]} -> ${match[3].trim()}` : `${name}${match[2]}`);
      exports.push(name);
    }
  }

  // Classes
  const classPattern = /^class\s+(\w+)(?:\([^)]*\))?:/gm;
  while ((match = classPattern.exec(content)) !== null) {
    types.push(match[1]);
    exports.push(match[1]);
  }

  return { exports, functions, types };
}

/** Analyze a single file's content and extract structure */
export function analyzeFile(filePath: string, content: string): FileAnalysis {
  const language = detectLanguage(filePath);
  const loc = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;

  if (language === 'python') {
    const { exports, functions, types } = extractPythonSymbols(content);
    return { path: filePath, language, loc, exports, types, functions, imports: [] };
  }

  if (language === 'typescript' || language === 'javascript') {
    return {
      path: filePath,
      language,
      loc,
      exports: extractTSExports(content),
      types: extractTSTypes(content),
      functions: extractTSFunctions(content),
      imports: extractTSImports(content),
    };
  }

  return { path: filePath, language, loc: 0, exports: [], types: [], functions: [], imports: [] };
}

/** Format type definitions extracted from file content (full interface/type blocks) */
export function extractTypeDefinitionBlocks(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Match interface or type declarations
    if (/(?:export\s+)?(?:interface|type)\s+\w+/.test(line)) {
      let block = line;
      let braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      // For single-line type aliases (type Foo = ...)
      if (braceCount === 0 && !line.includes('{')) {
        blocks.push(block.trim());
        i++;
        continue;
      }
      // Multi-line: collect until braces balance
      while (braceCount > 0 && i + 1 < lines.length) {
        i++;
        block += '\n' + lines[i];
        braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
      }
      blocks.push(block.trim());
    }
    i++;
  }

  return blocks;
}
