import path from "node:path";
import { stat } from "node:fs/promises";
import { commitPaths } from "../../core/git.js";
import { ensureDir, getWorkspace, readText, writeText } from "../../core/workspace.js";
import { materialUpdateSchema } from "./schema.js";

export async function applyDeconstructionRun(runDir: string): Promise<void> {
  const workspace = getWorkspace();
  const reportPath = path.join(runDir, "output", "deconstruction-report.md");
  const updatesPath = path.join(runDir, "output", "material-updates.json");
  const changeRecordPath = path.join(runDir, "output", "change-record.md");
  const metaPath = path.join(runDir, "meta.json");

  await Promise.all([stat(reportPath), stat(updatesPath), stat(changeRecordPath), stat(metaPath)]);

  const meta = JSON.parse(await readText(metaPath)) as { bookDir?: string };
  const updates = materialUpdateSchema.parse(JSON.parse(await readText(updatesPath)));
  const targetDir =
    updates.targetLibrary === "全局素材库"
      ? workspace.globalMaterialsDir
      : path.join(workspace.projectsDir, requireProject(updates.project), "materials");

  await ensureDir(targetDir);
  const materialFile = path.join(targetDir, "拆书模式.md");
  const existing = await readOptionalText(materialFile);
  const nextContent = appendMaterialItems(existing, updates.items, path.relative(workspace.root, reportPath));
  await writeText(materialFile, nextContent);
  await writeText(
    path.join(runDir, "APPLIED.md"),
    `# 已应用\n\n- 目标文件：${path.relative(workspace.root, materialFile)}\n- 持久拆书目录：${meta.bookDir ? path.relative(workspace.root, meta.bookDir) : "无"}\n`
  );

  await commitPaths([runDir, materialFile, ...(meta.bookDir ? [meta.bookDir] : [])], `应用拆书能力产物`);
}

function requireProject(project: string | undefined): string {
  if (!project) {
    throw new Error("写入单书专属素材库时必须提供 project。");
  }
  return project;
}

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await readText(filePath);
  } catch {
    return "# 拆书模式\n";
  }
}

function appendMaterialItems(
  existing: string,
  items: Array<{ title: string; summary: string; tags: string[]; source?: string; reuseBoundary?: string }>,
  reportPath: string
): string {
  const sections = items.map((item) => {
    return `
## ${item.title}

- 标签：${item.tags.length > 0 ? item.tags.join("、") : "无"}
- 来源：${item.source ?? reportPath}
- 复用边界：${item.reuseBoundary ?? "只复用结构、节奏和功能，不复用独特表达或可识别组合。"}

${item.summary}
`;
  });
  return `${existing.trim()}\n${sections.join("\n")}\n`;
}
