import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import type { FlowEngine } from './engine.js';
import type { FlowDef } from './types.js';

/**
 * Load all *.flow.ts files from the flows/ directory and register them with the engine.
 * Skips flows that already exist (by name) to avoid duplicates on restart.
 */
export async function loadFlowsFromDisk(engine: FlowEngine, flowsDir: string): Promise<number> {
  const absDir = resolve(flowsDir);
  let files: string[];
  try {
    files = await readdir(absDir);
  } catch {
    console.log(`Flows directory not found: ${absDir}`);
    return 0;
  }

  const flowFiles = files.filter(f => f.endsWith('.flow.ts') || f.endsWith('.flow.js'));
  const existing = new Set(engine.listFlows().map(f => f.name));
  let loaded = 0;

  for (const file of flowFiles) {
    try {
      const filePath = resolve(absDir, file);
      const mod = await import(pathToFileURL(filePath).href);
      const flowDef: FlowDef = mod.default;

      if (!flowDef?.name || !flowDef?.steps) {
        console.warn(`Skipping ${file}: no valid default export`);
        continue;
      }

      if (existing.has(flowDef.name)) {
        continue;
      }

      engine.createFlow(flowDef);
      loaded++;
      console.log(`Loaded flow: ${flowDef.name} (from ${file})`);
    } catch (err) {
      console.error(`Failed to load flow from ${file}:`, err);
    }
  }

  return loaded;
}
