import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { folderScenarios } from './folderScenarios.mjs';
const source = await readFile(new URL('../src/lib/folderSync.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { createFolderSync } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const accounts = new Map();
const cache = {
  getAllFolders: async () => [],
  async changeFolderRecords(account, change) {
    const next = change(structuredClone(accounts.get(account) ?? []));
    accounts.set(account, structuredClone(next));
    return structuredClone(next);
  },
};
for (const [name, run] of folderScenarios(createFolderSync, cache)) test(name, run);
