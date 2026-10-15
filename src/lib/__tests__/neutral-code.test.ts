import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { phrasesFor } from '../../i18n/categories';
import { genericProfile, JAIN_PROFILE, parseCategoryProfile, type CategoryProfile } from '../categories';
import { retargetWith } from '../wording';
import { bannedIn, ownWords } from './neutral-audit';
import { chamberPayload, communityPayload, faithDemoPayload, faithOtherPayload, gurdwaraPayload } from './neutral-fixtures';

/**
 * The words the app writes in code, outside the dictionary (src/i18n/en.ts): the action of a failure ("We couldn't load Pathshala
 * terms"), a message the data layer throws, a placeholder, a label. No screen translates them, so the words of the community the
 * app is showing are laid over them when they are said (src/lib/wording.ts `retargetActive`, set by the category provider).
 *
 * This reads every source file of the app, takes the sentences it says to a person (the second argument of report/must/maybe/check
 * and toAppError, the third of useLoad, the first of new AppError, the text and the labelling props of every screen), and fails when
 * one still has a Jain word after it is said for another kind of organization. A new "load the labh options" cannot be written
 * without a neutral word for it in src/i18n/categories/neutral.ts.
 */

const SRC = path.join(__dirname, '..', '..');

type Said = { where: string; text: string };

const ACTION_CALLS: Record<string, number> = { report: 1, must: 1, maybe: 1, check: 1, toAppError: 1, useLoad: 2 };
const SAID_PROPS = new Set(['title', 'label', 'message', 'placeholder', 'accessibilityLabel', 'accessibilityHint', 'alt', 'text', 'description', 'subtitle', 'eyebrow', 'body', 'hint', 'note']);

function files(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'i18n' || entry.name === 'node_modules') continue;
      files(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== 'database.types.ts') out.push(full);
  }
  return out;
}

function stringsIn(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    // t('some.key') is a dictionary key, audited with the dictionary (neutral-words.test.ts), not a sentence.
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't') return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** Every sentence the code says to a person. */
function sentences(): Said[] {
  const found: Said[] = [];
  for (const file of files(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const add = (node: ts.Node, s: string): void => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      if (s.trim()) found.push({ where: `${rel}:${line + 1}`, text: s });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text in ACTION_CALLS) {
        const arg = node.arguments[ACTION_CALLS[node.expression.text]];
        if (arg) for (const s of stringsIn(arg)) add(arg, s);
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'AppError' && node.arguments?.[0]) {
        for (const s of stringsIn(node.arguments[0])) add(node.arguments[0], s);
      } else if (ts.isJsxText(node)) {
        add(node, node.getText().trim());
      } else if (ts.isJsxAttribute(node) && SAID_PROPS.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) {
        add(node.initializer, node.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

function profileOf(payload: unknown): CategoryProfile {
  const p = parseCategoryProfile(payload);
  if (!p) throw new Error('the fixture is not a category profile');
  return p;
}

const OTHERS: [string, CategoryProfile][] = [
  ['Faith community', profileOf(faithOtherPayload())],
  ['Faith community in the demo', profileOf(faithDemoPayload())],
  ['Community organization', profileOf(communityPayload())],
  ['Chamber of commerce', profileOf(chamberPayload())],
  ['A gurdwara', profileOf(gurdwaraPayload())],
  ['A kind the app has never heard of', genericProfile('book_club', 'Book club')],
];

/** Sentences left on purpose, by "file:line text". None. */
const LEFT_ON_PURPOSE = new Set<string>();

describe('the words the app writes in code', () => {
  const all = sentences();

  it('reads the code (the audit looks at the places a person reads, and finds a few hundred)', () => {
    expect(all.length).toBeGreaterThan(300);
  });

  it('would find a Jain word if one were said: in Jain Center’s own words there are plenty', () => {
    const jain = all.filter((s) => bannedIn(s.text));
    expect(jain.length).toBeGreaterThan(25);
    expect(jain.map((s) => s.text)).toEqual(expect.arrayContaining(['load Pathshala terms', 'register for Pathshala', 'load Gyan Path goals']));
  });

  for (const [name, profile] of OTHERS) {
    it(`${name}: says none of them with a Jain word`, () => {
      const phrases = phrasesFor(profile);
      const own = ownWords(profile);
      const left = all
        .map((s) => ({ ...s, said: retargetWith(s.text, profile.terms, phrases) }))
        .filter((s) => bannedIn(s.said, own) && !LEFT_ON_PURPOSE.has(`${s.where} ${s.text}`))
        .map((s) => `${s.where} [${bannedIn(s.said, own)?.id}] ${s.text} => ${s.said}`);
      expect(left).toEqual([]);
    });
  }

  it('says them as they are written for a Jain Center', () => {
    for (const s of all) expect(retargetWith(s.text, JAIN_PROFILE.terms, phrasesFor(JAIN_PROFILE))).toBe(s.text);
  });

  it('leaves nothing on purpose', () => {
    expect([...LEFT_ON_PURPOSE]).toEqual([]);
  });
});
