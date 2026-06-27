import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { getWorkspace, ensureDir, writeText } from "../../core/workspace.js";
import { prepareOptionsSchema, type PrepareOptions } from "./schema.js";

export async function prepareDeconstructionRun(rawOptions: PrepareOptions): Promise<string> {
  const options = prepareOptionsSchema.parse(rawOptions);
  const workspace = getWorkspace();
  await stat(options.sourcePath);

  const title = options.title ?? path.basename(options.sourcePath);
  const bookSlug = createSlug(title);
  const bookDir = path.join(workspace.globalDeconstructionsDir, bookSlug);
  const bookSourceDir = path.join(bookDir, "source");
  const bookSourceFile = path.join(bookSourceDir, path.basename(options.sourcePath));
  await ensureBookDeconstructionDir(bookDir, options, bookSourceFile);
  await copyFile(options.sourcePath, bookSourceFile);

  const runId = createRunId(title);
  const runDir = path.join(workspace.runsDir, runId);
  const inputDir = path.join(runDir, "input");
  const outputDir = path.join(runDir, "output");
  await ensureDir(inputDir);
  await ensureDir(outputDir);

  const inputFile = path.join(inputDir, path.basename(options.sourcePath));
  await copyFile(options.sourcePath, inputFile);

  await writeText(path.join(runDir, "TASK.md"), renderTask(runId, options, inputFile, bookDir, bookSourceFile));
  await writeText(path.join(runDir, "INPUTS.md"), renderInputs(options, inputFile, bookDir, bookSourceFile));
  await writeText(path.join(runDir, "CONTEXT.md"), renderContext(options, bookDir));
  await writeText(path.join(runDir, "OUTPUT_CONTRACT.md"), renderOutputContract());
  await writeText(
    path.join(runDir, "meta.json"),
    JSON.stringify({ runId, capability: "拆书能力", bookSlug, bookDir, ...options, inputFile, bookSourceFile }, null, 2)
  );
  await writeText(path.join(outputDir, "deconstruction-report.md"), renderReportTemplate(options));
  await writeText(path.join(outputDir, "material-updates.json"), renderMaterialUpdatesTemplate(options));
  await writeText(path.join(outputDir, "change-record.md"), renderChangeRecordTemplate(runId));

  return runDir;
}

function createRunId(title: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const slug = createSlug(title).slice(0, 48);
  return `${timestamp}-deconstruction-${slug || "untitled"}`;
}

function createSlug(title: string): string {
  return title
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureBookDeconstructionDir(bookDir: string, options: PrepareOptions, bookSourceFile: string): Promise<void> {
  await ensureDir(bookDir);
  await ensureDir(path.join(bookDir, "source"));
  await ensureDir(path.join(bookDir, "book-map"));
  await ensureDir(path.join(bookDir, "segments"));
  await ensureDir(path.join(bookDir, "material-cards"));
  await ensureDir(path.join(bookDir, "synthesis"));

  await writeText(
    path.join(bookDir, "README.md"),
    `# ${options.title ?? path.basename(options.sourcePath)}

这是一本小说的持久拆书目录，用于沉淀全书结构、分段拆书、细粒度素材卡和最终汇总。

## 目录

- \`source/\`：本地原始输入副本，不进入 Git。
- \`book-map/\`：全书地图、章节索引、剧情阶段划分。
- \`segments/\`：按剧情阶段或章节区间形成的分段拆书。
- \`material-cards/\`：细粒度素材卡，例如桥段、梗、爽点、钩子、人物关系变化。
- \`synthesis/\`：全书结构学习、去重归类和最终沉淀。
`
  );

  await writeText(
    path.join(bookDir, "SOURCE.md"),
    `# 来源记录

- 来源类型：${options.sourceKind}
- 原始路径：${options.sourcePath}
- 本地副本：${bookSourceFile}
- 目标素材库：${options.targetLibrary}
- 拆书模式：${options.mode}
- 默认分段规模：${options.segmentSize} 章

原始正文副本只保存在本地 \`source/\` 目录，该目录被 Git 忽略，不提交到远程仓库。
`
  );

  await writeText(
    path.join(bookDir, "manifest.json"),
    JSON.stringify(
      {
        title: options.title ?? path.basename(options.sourcePath),
        sourceKind: options.sourceKind,
        targetLibrary: options.targetLibrary,
        mode: options.mode,
        segmentSize: options.segmentSize,
        sourceCopy: bookSourceFile,
        stages: ["全书地图", "分段精拆", "素材卡提取", "全书汇总", "素材库更新"]
      },
      null,
      2
    )
  );

  await writeText(path.join(bookDir, "book-map", ".gitkeep"), "");
  await writeText(path.join(bookDir, "segments", ".gitkeep"), "");
  await writeText(path.join(bookDir, "material-cards", ".gitkeep"), "");
  await writeText(path.join(bookDir, "synthesis", ".gitkeep"), "");
}

function renderTask(runId: string, options: PrepareOptions, inputFile: string, bookDir: string, bookSourceFile: string): string {
  return `# 拆书任务

运行编号：${runId}

请按 \`capabilities/deconstruction/SKILL.md\` 执行生产型拆书。

## 输入

- 来源类型：${options.sourceKind}
- 输入文件：${inputFile}
- 持久拆书目录：${bookDir}
- 原始正文本地副本：${bookSourceFile}
- 目标素材库：${options.targetLibrary}
- 单书项目：${options.project ?? "无"}
- 拆书模式：${options.mode}
- 默认分段规模：${options.segmentSize} 章

## 必须产出

- \`output/deconstruction-report.md\`
- \`output/material-updates.json\`
- \`output/change-record.md\`

如果是长程分段拆书，请先在持久拆书目录中沉淀：

- \`book-map/\`：章节索引和剧情阶段划分
- \`segments/\`：分段拆书报告
- \`material-cards/\`：细粒度素材卡
- \`synthesis/\`：全书汇总

完成后不要直接提交 Git。由 CLI 的 \`deconstruct apply\` 命令校验、落库并提交。
`;
}

function renderInputs(options: PrepareOptions, inputFile: string, bookDir: string, bookSourceFile: string): string {
  return `# 输入说明

- 输入文件：${inputFile}
- 持久拆书目录：${bookDir}
- 原始正文本地副本：${bookSourceFile}
- 来源类型：${options.sourceKind}
- 目标素材库：${options.targetLibrary}
- 单书项目：${options.project ?? "无"}
- 拆书模式：${options.mode}
- 默认分段规模：${options.segmentSize} 章

如果输入是二手拆书来源，需要在拆书报告中说明可信度依据。
`;
}

function renderContext(options: PrepareOptions, bookDir: string): string {
  return `# 上下文

本次拆书服务于网文生产系统，重点不是文学评论，而是提取可复用的男频网文生产知识。

## 复用边界

可以复用结构、节奏和功能；不能复用独特表达、专有名称、独特事件链或来源作品的可识别组合。

## 目标

目标素材库：${options.targetLibrary}
单书项目：${options.project ?? "无"}
持久拆书目录：${bookDir}
`;
}

function renderOutputContract(): string {
  return `# 输出契约

## deconstruction-report.md

面向人类审阅的拆书报告，必须包含：

- 基本信息
- 开局设计
- 核心卖点
- 主角成长线
- 金手指或能力系统
- 冲突升级
- 地图或势力展开
- 章节钩子
- 爽点兑现
- 读者期待管理
- 可复用模式
- 复用风险

## material-updates.json

必须符合以下结构：

\`\`\`json
{
  "targetLibrary": "全局素材库",
  "items": [
    {
      "title": "模式名称",
      "summary": "可复用模式说明",
      "tags": ["开局", "爽点"],
      "source": "来源说明",
      "reuseBoundary": "复用边界"
    }
  ]
}
\`\`\`

## change-record.md

记录本次能力调用改动了什么、为什么改、依据是什么。
`;
}

function renderReportTemplate(options: PrepareOptions): string {
  return `# 拆书报告

## 基本信息

- 来源类型：${options.sourceKind}
- 目标素材库：${options.targetLibrary}
- 单书项目：${options.project ?? "无"}

## 开局设计

## 核心卖点

## 主角成长线

## 金手指或能力系统

## 冲突升级

## 地图或势力展开

## 章节钩子

## 爽点兑现

## 读者期待管理

## 可复用模式

## 复用风险
`;
}

function renderMaterialUpdatesTemplate(options: PrepareOptions): string {
  return JSON.stringify(
    {
      targetLibrary: options.targetLibrary,
      project: options.project,
      items: []
    },
    null,
    2
  );
}

function renderChangeRecordTemplate(runId: string): string {
  return `# 能力改动记录

- 运行编号：${runId}
- 能力：拆书能力
- 改动摘要：
- 输入来源：
- 修改原因：
`;
}
