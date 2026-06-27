import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Workspace = {
  root: string;
  runsDir: string;
  globalMaterialsDir: string;
  globalDeconstructionsDir: string;
  projectsDir: string;
};

export function getWorkspace(root = process.cwd()): Workspace {
  return {
    root,
    runsDir: path.join(root, "runs"),
    globalMaterialsDir: path.join(root, "global", "materials"),
    globalDeconstructionsDir: path.join(root, "global", "deconstructions"),
    projectsDir: path.join(root, "projects")
  };
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, "utf8");
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
