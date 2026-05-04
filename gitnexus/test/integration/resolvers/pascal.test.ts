/**
 * Delphi/Pascal: symbol detection, import resolution, call edges, and heritage.
 *
 * Covers:
 *   - Class and function/method symbol extraction
 *   - IMPORTS edges from uses clauses
 *   - CALLS edges for same-file and cross-file procedure calls
 *   - EXTENDS edges from class inheritance (TDog extends TAnimal)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  FIXTURES,
  getRelationships,
  getNodesByLabel,
  runPipelineFromRepo,
  type PipelineResult,
} from './helpers.js';
import {
  isLanguageAvailable,
  loadParser,
  loadLanguage,
} from '../../../src/core/tree-sitter/parser-loader.js';
import { SupportedLanguages } from '../../../src/config/supported-languages.js';

// Probe the parser to get a reliable skip guard (same pattern as Dart tests).
let pascalAvailable = isLanguageAvailable(SupportedLanguages.DelphiPascal);
if (pascalAvailable) {
  try {
    await loadParser();
    await loadLanguage(SupportedLanguages.DelphiPascal);
  } catch {
    pascalAvailable = false;
  }
}

// ── Basic symbol detection, imports, and calls ────────────────────────────────

describe.skipIf(!pascalAvailable)('Pascal basic symbol detection', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'pascal-basic-calls'),
      () => {},
    );
  }, 60000);

  it('detects TUser as a Class', () => {
    expect(getNodesByLabel(result, 'Class')).toContain('TUser');
  });

  it('detects top-level procedures as Functions', () => {
    const fns = getNodesByLabel(result, 'Function');
    expect(fns).toEqual(expect.arrayContaining(['Validate', 'Persist', 'Run']));
  });

  it('detects TUser.Save as a Method', () => {
    expect(getNodesByLabel(result, 'Method')).toContain('Save');
  });

  it('creates IMPORTS edge from app.pas to models.pas', () => {
    const imports = getRelationships(result, 'IMPORTS');
    const appToModels = imports.filter(
      (e) =>
        e.sourceFilePath.includes('app.pas') && e.targetFilePath.includes('models.pas'),
    );
    expect(appToModels.length).toBeGreaterThanOrEqual(1);
  });

  it('creates CALLS edge from Persist to Validate (same-file)', () => {
    const calls = getRelationships(result, 'CALLS');
    const persistCallsValidate = calls.filter(
      (c) => c.source === 'Persist' && c.target === 'Validate',
    );
    expect(persistCallsValidate.length).toBeGreaterThanOrEqual(1);
  });

  it('creates CALLS edge from Run to Persist (cross-file)', () => {
    const calls = getRelationships(result, 'CALLS');
    const runCallsPersist = calls.filter(
      (c) =>
        c.source === 'Run' &&
        c.target === 'Persist' &&
        c.sourceFilePath.includes('app.pas') &&
        c.targetFilePath.includes('models.pas'),
    );
    expect(runCallsPersist.length).toBeGreaterThanOrEqual(1);
  });

  it('attributes Run call source to Function, not File', () => {
    const calls = getRelationships(result, 'CALLS');
    const runCalls = calls.filter(
      (c) => c.source === 'Run' && c.sourceFilePath.includes('app.pas'),
    );
    expect(runCalls.length).toBeGreaterThan(0);
    for (const c of runCalls) {
      expect(c.sourceLabel).toBe('Function');
    }
  });
});

// ── Heritage (EXTENDS) ────────────────────────────────────────────────────────

describe.skipIf(!pascalAvailable)('Pascal heritage (EXTENDS)', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'pascal-heritage'),
      () => {},
    );
  }, 60000);

  it('detects TAnimal and TDog as Classes', () => {
    const classes = getNodesByLabel(result, 'Class');
    expect(classes).toContain('TAnimal');
    expect(classes).toContain('TDog');
  });

  it('detects Speak and Breathe as Methods', () => {
    const methods = getNodesByLabel(result, 'Method');
    expect(methods).toContain('Speak');
    expect(methods).toContain('Breathe');
  });

  it('emits EXTENDS edge from TDog to TAnimal', () => {
    const extends_ = getRelationships(result, 'EXTENDS');
    const dogExtendsAnimal = extends_.filter(
      (e) => e.source === 'TDog' && e.target === 'TAnimal',
    );
    expect(dogExtendsAnimal.length).toBeGreaterThanOrEqual(1);
  });

  it('creates IMPORTS edge from app.pas to animals.pas', () => {
    const imports = getRelationships(result, 'IMPORTS');
    const appToAnimals = imports.filter(
      (e) =>
        e.sourceFilePath.includes('app.pas') && e.targetFilePath.includes('animals.pas'),
    );
    expect(appToAnimals.length).toBeGreaterThanOrEqual(1);
  });
});
