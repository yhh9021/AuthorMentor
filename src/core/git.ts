import { execa } from "./process.js";

export async function commitPaths(paths: string[], message: string): Promise<void> {
  await execa("git", ["add", ...paths]);
  await execa("git", ["commit", "-m", message]);
}
