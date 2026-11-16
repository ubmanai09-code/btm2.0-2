import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { parseCsvRows } from './participantCsv';

test('App translation calls have Mongolian dictionary entries', () => {
  const rows = parseCsvRows(readFileSync(new URL('../../public/i18n-en-mn.csv', import.meta.url), 'utf8'));
  const translatedKeys = new Set(rows.filter((row) => row[2]?.trim()).map((row) => row[0]));
  const translatedText = new Set(rows.filter((row) => row[2]?.trim()).map((row) => row[1]));
  const source = ts.createSourceFile(
    'App.tsx',
    readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const missing = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const [first, second] = node.arguments;
      if (first && ts.isStringLiteral(first)) {
        if (['tx', 'translate', 'translateUiText'].includes(node.expression.text) && !translatedText.has(first.text)) {
          missing.add(first.text);
        }
        if (['t', 'tPublic'].includes(node.expression.text) && second && ts.isStringLiteral(second) && !translatedKeys.has(first.text)) {
          missing.add(first.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  assert.deepEqual([...missing], []);
});
