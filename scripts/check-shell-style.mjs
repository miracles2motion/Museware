#!/usr/bin/env node
/** Reject literal hex/rgb(a) in JSX style objects and class names in product code. */
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const allowed = [
  /^src\/export\//,
  /^src\/muse\/demo\//,
  /^src\/design\/(presets|starter|palettes)\.ts$/,
  /(?:^|\/)[^/]+\.(?:test|spec)\.[jt]sx?$/,
];
const color = /(?:#[0-9a-f]{3,8}\b|\brgba?\s*\()/i;
const shellTsx =
  /^src\/(?:shell|inspector|rail|layers|preview)\/.*\.tsx$|^src\/canvas\/Canvas\.tsx$/;
export function findStyleLiterals(source, name = 'sample.tsx') {
  const file = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors = [];
  // Follow locally declared style objects used by an attribute as well as inline objects.
  const declarations = new Map();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(file);
  function walk(node) {
    if (
      ts.isJsxAttribute(node) &&
      ['style', 'className'].includes(node.name.getText(file)) &&
      node.initializer
    ) {
      const seen = new Set();
      function scan(part) {
        if (ts.isIdentifier(part) && declarations.has(part.text) && !seen.has(part.text)) {
          seen.add(part.text);
          scan(declarations.get(part.text));
        }
        if (
          shellTsx.test(name) &&
          node.name.getText(file) === 'style' &&
          ts.isPropertyAssignment(part) &&
          ['fontSize', 'height', 'width'].includes(part.name.getText(file)) &&
          (ts.isNumericLiteral(part.initializer) ||
            (ts.isPrefixUnaryExpression(part.initializer) &&
              ts.isNumericLiteral(part.initializer.operand)))
        ) {
          const pos = file.getLineAndCharacterOfPosition(part.getStart(file));
          errors.push(
            `${name}:${pos.line + 1}: literal ${part.name.getText(file)} in style — use an mw token`,
          );
        }
        if (
          (ts.isStringLiteral(part) ||
            ts.isNoSubstitutionTemplateLiteral(part) ||
            ts.isTemplateHead(part) ||
            ts.isTemplateMiddle(part) ||
            ts.isTemplateTail(part)) &&
          color.test(part.text)
        ) {
          const pos = file.getLineAndCharacterOfPosition(part.getStart(file));
          errors.push(
            `${name}:${pos.line + 1}: literal color in ${node.name.getText(file)}`,
          );
        }
        ts.forEachChild(part, scan);
      }
      scan(node.initializer);
    }
    ts.forEachChild(node, walk);
  }
  walk(file);
  return errors;
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    return entry.isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
if (process.argv.includes('--self-test')) {
  const bad = findStyleLiterals(
    '<div style={{ color: "#123456", background: "rgba(1,2,3,.5)" }} />',
  );
  const indirect = findStyleLiterals(
    'const styles = {color: "#fff"}; <div style={styles} className="text-[#abc]" />',
  );
  const good = findStyleLiterals('<div style={{ color: "var(--mw-ink)" }} />');
  const sizes = findStyleLiterals(
    '<div style={{fontSize: 11, height: 24, width: 160}} />',
    'src/rail/Test.tsx',
  );
  const dynamic = findStyleLiterals(
    '<div style={{fontSize: size, height: `${n}px`, width: "var(--mw-control-h)"}} />',
    'src/rail/Test.tsx',
  );
  if (
    bad.length !== 2 ||
    indirect.length !== 2 ||
    good.length ||
    sizes.length !== 3 ||
    dynamic.length
  )
    throw new Error('shell style negative test failed');
  console.log('✓ shell style checker rejects raw colors and numeric shell sizes');
} else {
  const failures = [];
  for (const path of files('src')) {
    const name = relative('.', path).replaceAll('\\', '/');
    if (!allowed.some((pattern) => pattern.test(name)))
      failures.push(...findStyleLiterals(readFileSync(path, 'utf8'), name));
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log('✓ shell styles reject literal colors and numeric shell sizes');
}
