#!/usr/bin/env node
import { Command } from "commander";
import { applyDeconstructionRun } from "../capabilities/deconstruction/apply.js";
import { auditDeconstructionTarget } from "../capabilities/deconstruction/audit.js";
import { runDeepDeconstruction } from "../capabilities/deconstruction/deep-run.js";
import { runFullDeconstruction } from "../capabilities/deconstruction/full-run.js";
import { prepareDeconstructionRun } from "../capabilities/deconstruction/prepare.js";

const program = new Command();

program
  .name("author-mentor")
  .description("长篇网文生产系统本地 CLI")
  .version("0.1.0");

const deconstruct = program.command("deconstruct").description("拆书能力");

deconstruct
  .command("prepare")
  .description("生成拆书任务包")
  .argument("<source>", "原始小说文本或二手拆书来源文件")
  .option("--source-kind <kind>", "来源类型：原始小说文本 / 二手拆书来源", "原始小说文本")
  .option("--target-library <library>", "目标素材库：全局素材库 / 单书专属素材库", "全局素材库")
  .option("--mode <mode>", "拆书模式：总览拆书 / 长程分段拆书", "长程分段拆书")
  .option("--segment-size <number>", "长程分段拆书的默认章节数", "20")
  .option("--project <name>", "单书项目名")
  .option("--title <title>", "本次拆书标题")
  .action(async (source, options) => {
    const runDir = await prepareDeconstructionRun({
      sourcePath: source,
      sourceKind: options.sourceKind,
      targetLibrary: options.targetLibrary,
      mode: options.mode,
      segmentSize: options.segmentSize,
      project: options.project,
      title: options.title
    });
    console.log(`已生成拆书任务包：${runDir}`);
  });

deconstruct
  .command("apply")
  .description("校验并应用拆书任务包输出")
  .argument("<runDir>", "runs 下的拆书任务包目录")
  .action(async (runDir) => {
    await applyDeconstructionRun(runDir);
    console.log("拆书产物已应用并提交 Git。");
  });

deconstruct
  .command("full-run")
  .description("完整运行长程分段拆书，并应用产物")
  .argument("<source>", "原始小说文本或二手拆书来源文件")
  .option("--source-kind <kind>", "来源类型：原始小说文本 / 二手拆书来源", "原始小说文本")
  .option("--target-library <library>", "目标素材库：全局素材库 / 单书专属素材库", "全局素材库")
  .option("--segment-size <number>", "长程分段拆书的默认章节数", "20")
  .option("--project <name>", "单书项目名")
  .option("--title <title>", "本次拆书标题")
  .action(async (source, options) => {
    const runDir = await runFullDeconstruction({
      sourcePath: source,
      sourceKind: options.sourceKind,
      targetLibrary: options.targetLibrary,
      mode: "长程分段拆书",
      segmentSize: options.segmentSize,
      project: options.project,
      title: options.title
    });
    console.log(`全量长程拆书已完成并提交 Git：${runDir}`);
  });

deconstruct
  .command("deep-run")
  .description("完整运行全本结构化深拆，并应用产物")
  .argument("<source>", "原始小说文本或二手拆书来源文件")
  .option("--source-kind <kind>", "来源类型：原始小说文本 / 二手拆书来源", "原始小说文本")
  .option("--target-library <library>", "目标素材库：全局素材库 / 单书专属素材库", "全局素材库")
  .option("--segment-size <number>", "深拆 chunk 的默认章节数", "20")
  .option("--agent-command <command>", "可选：执行子 Agent 精读的 shell 命令")
  .option("--agent-mode <mode>", "子 Agent 模式：fallback / required", "fallback")
  .option("--project <name>", "单书项目名")
  .option("--title <title>", "本次拆书标题")
  .action(async (source, options) => {
    const runDir = await runDeepDeconstruction({
      sourcePath: source,
      sourceKind: options.sourceKind,
      targetLibrary: options.targetLibrary,
      mode: "长程分段拆书",
      segmentSize: options.segmentSize,
      project: options.project,
      title: options.title,
      agentCommand: options.agentCommand,
      agentMode: options.agentMode
    });
    console.log(`全本结构化深拆已完成并提交 Git：${runDir}`);
  });

deconstruct
  .command("audit")
  .description("审计拆书产物是否足够深入、可参考、可复用")
  .argument("<target>", "单本拆书目录或 global/deconstructions 目录")
  .option("--no-write", "只输出摘要，不写入审计报告")
  .option("--fail-on-issues", "发现需返工问题时返回非 0")
  .action(async (target, options) => {
    const result = await auditDeconstructionTarget(target, { writeReport: options.write });
    const results = Array.isArray(result) ? result : [result];
    const failed = results.filter((item) => item.status === "需返工");
    for (const item of results) {
      console.log(`${item.title}：${item.status}，问题 ${item.issues.length} 个${item.reportPath ? `，报告：${item.reportPath}` : ""}`);
    }
    if (options.failOnIssues && failed.length > 0) {
      throw new Error(`拆书产物审计未通过：${failed.length}/${results.length} 本需返工。`);
    }
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
