/**
 * Phase: dfm
 *
 * Processes Delphi/Lazarus/FMX form files (.dfm, .lfm, .xfm) via regex extraction
 * (no tree-sitter).
 *
 * @deps    structure
 * @reads   scannedFiles (from structure phase)
 * @writes  graph (DFM form Module nodes, component Property nodes, event-handler CALLS edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import { processDfm, isDfmFile } from '../dfm-processor.js';
import { readFileContents } from '../filesystem-walker.js';
import type { StructureOutput } from './structure.js';
import { isDev } from '../utils/env.js';

export interface DfmOutput {
  forms: number;
  components: number;
  eventBindings: number;
}

export const dfmPhase: PipelinePhase<DfmOutput> = {
  name: 'dfm',
  deps: ['structure'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<DfmOutput> {
    const { scannedFiles } = getPhaseOutput<StructureOutput>(deps, 'structure');

    const dfmScanned = scannedFiles.filter((f) => isDfmFile(f.path));

    if (dfmScanned.length === 0) {
      return { forms: 0, components: 0, eventBindings: 0 };
    }

    const dfmContents = await readFileContents(
      ctx.repoPath,
      dfmScanned.map((f) => f.path),
    );
    const dfmFiles = dfmScanned
      .filter((f) => dfmContents.has(f.path))
      .map((f) => ({ path: f.path, content: dfmContents.get(f.path)! }));

    const dfmResult = processDfm(ctx.graph, dfmFiles);

    if (isDev) {
      console.log(
        `  DFM: ${dfmResult.forms} forms, ${dfmResult.components} components, ${dfmResult.eventBindings} event bindings from ${dfmFiles.length} files`,
      );
    }

    return dfmResult;
  },
};
