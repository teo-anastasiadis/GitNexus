/**
 * DFM Processor
 *
 * Standalone regex state-machine processor for Delphi/Lazarus/FMX form files
 * (.dfm, .lfm, .xfm). Extracts form hierarchy, component declarations, and
 * event-handler bindings into the knowledge graph.
 *
 * Pipeline:
 *   1. Parse DFM file into object hierarchy (object/end nesting)
 *   2. Map root form object → Module node
 *   3. Map nested component objects → Property nodes (preserving hierarchy)
 *   4. Map OnXxx = Handler bindings → CALLS edges to companion .pas methods
 */

import path from 'node:path';
import { generateId } from '../../lib/utils.js';
import { SupportedLanguages } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../graph/types.js';

// ── File detection ─────────────────────────────────────────────────────────

const DFM_EXTENSIONS = new Set(['.dfm', '.lfm', '.xfm']);

export function isDfmFile(filePath: string): boolean {
  return DFM_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// ── Parse patterns ─────────────────────────────────────────────────────────

const OBJECT_RE = /^\s*object\s+(\w+)\s*:\s*(\w+)/i;
const END_RE = /^\s*end\s*(?:\/\/.*)?$/i;
// OnXxx = HandlerName — case-sensitive prefix "On" per Delphi convention
const EVENT_RE = /^\s*(On\w+)\s*=\s*(\w+)\s*(?:\/\/.*)?$/;

// ── Internal types ─────────────────────────────────────────────────────────

interface DfmEvent {
  eventName: string;
  handlerName: string;
  line: number;
}

interface DfmObject {
  name: string;
  className: string;
  startLine: number;
  endLine: number;
  depth: number;
  parentName: string | null;
  events: DfmEvent[];
}

// ── Parser ─────────────────────────────────────────────────────────────────

function parseDfm(content: string): DfmObject[] {
  const lines = content.split(/\r?\n/);
  const objects: DfmObject[] = [];
  const stack: DfmObject[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trimStart();

    if (trimmed.startsWith('//')) continue;

    const objectMatch = trimmed.match(OBJECT_RE);
    if (objectMatch) {
      const obj: DfmObject = {
        name: objectMatch[1],
        className: objectMatch[2],
        startLine: lineNo,
        endLine: lineNo,
        depth: stack.length,
        parentName: stack.length > 0 ? stack[stack.length - 1].name : null,
        events: [],
      };
      stack.push(obj);
      objects.push(obj);
      continue;
    }

    if (stack.length > 0 && END_RE.test(lines[i])) {
      const obj = stack.pop()!;
      obj.endLine = lineNo;
      continue;
    }

    if (stack.length > 0) {
      const eventMatch = trimmed.match(EVENT_RE);
      if (eventMatch) {
        stack[stack.length - 1].events.push({
          eventName: eventMatch[1],
          handlerName: eventMatch[2],
          line: lineNo,
        });
      }
    }
  }

  return objects;
}

// ── Result type ────────────────────────────────────────────────────────────

export interface DfmProcessResult {
  forms: number;
  components: number;
  eventBindings: number;
}

// ── Graph mapping ──────────────────────────────────────────────────────────

interface DfmFile {
  path: string;
  content: string;
}

export function processDfm(graph: KnowledgeGraph, files: DfmFile[]): DfmProcessResult {
  const result: DfmProcessResult = { forms: 0, components: 0, eventBindings: 0 };

  for (const file of files) {
    const fileNodeId = generateId('File', file.path);
    if (!graph.getNode(fileNodeId)) continue;

    const objects = parseDfm(file.content);
    if (objects.length === 0) continue;

    const rootObj = objects.find((o) => o.depth === 0);
    if (!rootObj) continue;

    // Companion .pas file for event-handler target ID computation.
    // The handler methods live in ClassName.pas alongside the DFM form.
    const companionPath = path.join(
      path.dirname(file.path),
      path.basename(file.path, path.extname(file.path)) + '.pas',
    );

    // Pre-compute node IDs so nested CONTAINS edges can reference parent IDs.
    const nodeIdByName = new Map<string, string>();
    for (const obj of objects) {
      nodeIdByName.set(
        obj.name,
        obj.depth === 0
          ? generateId('Module', `${file.path}:${obj.name}`)
          : generateId('Property', `${file.path}:${obj.name}`),
      );
    }

    const rootNodeId = nodeIdByName.get(rootObj.name)!;

    // Root form → Module node
    graph.addNode({
      id: rootNodeId,
      label: 'Module',
      properties: {
        name: rootObj.name,
        filePath: file.path,
        startLine: rootObj.startLine,
        endLine: rootObj.endLine,
        language: SupportedLanguages.DFM,
        isExported: true,
        description: `dfm-form:${rootObj.className}`,
      },
    });
    graph.addRelationship({
      id: generateId('CONTAINS', `${fileNodeId}->${rootNodeId}`),
      type: 'CONTAINS',
      sourceId: fileNodeId,
      targetId: rootNodeId,
      confidence: 1.0,
      reason: 'dfm-form',
    });
    result.forms++;

    // Nested component objects → Property nodes, preserving the nesting hierarchy
    for (const obj of objects) {
      if (obj.depth === 0) continue;

      const objId = nodeIdByName.get(obj.name)!;
      const parentNodeId = obj.parentName
        ? (nodeIdByName.get(obj.parentName) ?? rootNodeId)
        : rootNodeId;

      graph.addNode({
        id: objId,
        label: 'Property',
        properties: {
          name: obj.name,
          filePath: file.path,
          startLine: obj.startLine,
          endLine: obj.endLine,
          language: SupportedLanguages.DFM,
          description: `dfm-component:${obj.className}`,
        },
      });
      graph.addRelationship({
        id: generateId('CONTAINS', `${parentNodeId}->${objId}`),
        type: 'CONTAINS',
        sourceId: parentNodeId,
        targetId: objId,
        confidence: 1.0,
        reason: 'dfm-component',
      });
      result.components++;
    }

    // OnXxx = HandlerName → CALLS edges from form Module to companion .pas methods.
    // Uses generateId('Method', ...) to match the ID the method extractor will assign.
    for (const obj of objects) {
      for (const evt of obj.events) {
        const targetId = generateId('Method', `${companionPath}:${evt.handlerName}`);
        graph.addRelationship({
          id: generateId('CALLS', `${rootNodeId}->${evt.handlerName}:L${evt.line}`),
          type: 'CALLS',
          sourceId: rootNodeId,
          targetId,
          confidence: 0.95,
          reason: 'dfm-event-handler',
        });
        result.eventBindings++;
      }
    }
  }

  return result;
}
