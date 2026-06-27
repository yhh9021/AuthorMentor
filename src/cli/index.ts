#!/usr/bin/env node
import { Command } from "commander";
import { applyDeconstructionRun } from "../capabilities/deconstruction/apply.js";
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

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
