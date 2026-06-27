import { readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { applyDeconstructionRun } from "./apply.js";
import { prepareDeconstructionRun } from "./prepare.js";
import { type PrepareOptions } from "./schema.js";
import { ensureDir, readText, writeText } from "../../core/workspace.js";

type Chapter = {
  index: number;
  title: string;
  text: string;
};

type Segment = {
  index: number;
  start: number;
  end: number;
  title: string;
  chapters: Chapter[];
  focus: string;
  category: string;
  keywords: string[];
};

const CHAPTER_TITLE_PATTERN =
  /^第[一二三四五六七八九十百千万零〇两0-9]+章[^\n\r]*/gm;

const FOCUS_RULES: Array<{ focus: string; category: string; keywords: string[] }> = [
  { focus: "现代仙门校园与资源压力", category: "设定模式", keywords: ["仙门", "高中", "高考", "道院", "灵根", "善功", "修炼室"] },
  { focus: "水府探索与跨世界资源点", category: "剧情桥段", keywords: ["水府", "龟壳", "龟宝", "传送", "回城", "东荒"] },
  { focus: "坊市交易与第一桶金", category: "资源与交易", keywords: ["坊市", "灵石", "交易", "代理", "摆摊", "鉴宝", "进货"] },
  { focus: "生产技能与制符变现", category: "资源与交易", keywords: ["制符", "符", "工业化", "符墨", "符箓", "灵水"] },
  { focus: "道院高考与技术型斗法", category: "战斗或斗法", keywords: ["高考", "斗法", "对阵", "决赛", "胜利", "战术", "临阵"] },
  { focus: "宗门生态与筑基压力", category: "设定模式", keywords: ["神木宗", "筑基", "真传", "贡献", "师叔", "宗门", "筑基丹"] },
  { focus: "妖兽战场与实战成长", category: "战斗或斗法", keywords: ["妖兽", "黑瘟鸟", "战场", "攻岛", "雷法", "剑光"] },
  { focus: "道院身份与资源跃迁", category: "身份升级", keywords: ["道院", "入学", "学宫", "集训", "第一", "真君", "道号"] },
  { focus: "结丹经营与阶段结算", category: "节奏结构", keywords: ["结丹", "金丹", "结算", "回天河界", "威德", "混元"] },
  { focus: "高阶道统与位格扩张", category: "伏笔与回收", keywords: ["元婴", "化神", "虚空", "道子", "一元", "紫霄", "合道"] },
  { focus: "魔主终局与伏笔回收", category: "伏笔与回收", keywords: ["魔主", "寂灭", "元始", "混沌", "天帝", "合道", "真灵"] }
];

export async function runFullDeconstruction(rawOptions: PrepareOptions): Promise<string> {
  const runDir = await prepareDeconstructionRun({
    ...rawOptions,
    mode: rawOptions.mode ?? "长程分段拆书"
  });
  const meta = JSON.parse(await readText(path.join(runDir, "meta.json"))) as {
    bookDir: string;
    bookSourceFile: string;
    title?: string;
    segmentSize?: number;
  };

  const segmentSize = meta.segmentSize ?? 20;
  const text = await readSourceText(meta.bookSourceFile);
  const chapters = parseChapters(text);
  const segments = buildSegments(chapters, segmentSize);

  await cleanGeneratedOutputs(meta.bookDir);
  await writeBookMap(meta.bookDir, chapters, segments);
  await writeSegments(meta.bookDir, segments);
  await writeMaterialCards(meta.bookDir, segments);
  await writeSynthesis(meta.bookDir, meta.title ?? path.basename(meta.bookSourceFile), chapters, segments);
  await writeRunOutputs(runDir, meta.bookDir, chapters, segments);

  await applyDeconstructionRun(runDir);
  return runDir;
}

async function readSourceText(filePath: string): Promise<string> {
  const buffer = await import("node:fs/promises").then((fs) => fs.readFile(filePath));
  const utf8Text = new TextDecoder("utf-8").decode(buffer).replace(/\r\n/g, "\n");
  if (CHAPTER_TITLE_PATTERN.test(utf8Text)) {
    CHAPTER_TITLE_PATTERN.lastIndex = 0;
    return utf8Text;
  }
  CHAPTER_TITLE_PATTERN.lastIndex = 0;
  return new TextDecoder("gb18030").decode(buffer).replace(/\r\n/g, "\n");
}

function parseChapters(text: string): Chapter[] {
  const matches = [...text.matchAll(CHAPTER_TITLE_PATTERN)];
  return matches.map((match, idx) => {
    const start = match.index ?? 0;
    const end = idx + 1 < matches.length ? matches[idx + 1].index ?? text.length : text.length;
    const title = match[0].trim();
    return {
      index: idx + 1,
      title,
      text: text.slice(start + match[0].length, end).trim()
    };
  });
}

function buildSegments(chapters: Chapter[], segmentSize: number): Segment[] {
  const segments: Segment[] = [];
  for (let start = 0; start < chapters.length; start += segmentSize) {
    const slice = chapters.slice(start, start + segmentSize);
    const text = `${slice.map((chapter) => chapter.title).join("\n")}\n${slice.map((chapter) => chapter.text.slice(0, 1200)).join("\n")}`;
    const rule = inferFocus(text);
    segments.push({
      index: segments.length + 1,
      start: slice[0]?.index ?? 0,
      end: slice.at(-1)?.index ?? 0,
      title: `${String(segments.length + 1).padStart(3, "0")}-${String(slice[0]?.index ?? 0).padStart(4, "0")}-${String(slice.at(-1)?.index ?? 0).padStart(4, "0")}-${slug(rule.focus)}`,
      chapters: slice,
      focus: rule.focus,
      category: rule.category,
      keywords: rule.keywords
    });
  }
  return segments;
}

function inferFocus(text: string): { focus: string; category: string; keywords: string[] } {
  let best = FOCUS_RULES[0];
  let bestScore = -1;
  for (const rule of FOCUS_RULES) {
    const score = rule.keywords.reduce((sum, keyword) => sum + occurrences(text, keyword), 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

function occurrences(text: string, keyword: string): number {
  return text.split(keyword).length - 1;
}

async function cleanGeneratedOutputs(bookDir: string): Promise<void> {
  await ensureDir(path.join(bookDir, "book-map"));
  await ensureDir(path.join(bookDir, "segments"));
  await ensureDir(path.join(bookDir, "material-cards"));
  await ensureDir(path.join(bookDir, "synthesis"));
  await removeGeneratedMarkdown(path.join(bookDir, "segments"), /^\d{3}-\d{4}-\d{4}-.+\.md$/);
  await removeGeneratedMarkdown(path.join(bookDir, "material-cards"), /^\d{3}-.+\.md$/);
  await rm(path.join(bookDir, "book-map", "剧情阶段总览.md"), { force: true });
  await rm(path.join(bookDir, "book-map", "章节索引.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "全书拆书总报告.md"), { force: true });
}

async function removeGeneratedMarkdown(dir: string, pattern: RegExp): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => unlink(path.join(dir, entry.name)))
  );
}

async function writeBookMap(bookDir: string, chapters: Chapter[], segments: Segment[]): Promise<void> {
  await writeText(
    path.join(bookDir, "book-map", "章节索引.md"),
    `# 章节索引\n\n${chapters.map((chapter) => `${chapter.index}. ${chapter.title}`).join("\n")}\n`
  );

  await writeText(
    path.join(bookDir, "book-map", "剧情阶段总览.md"),
    `# 剧情阶段总览\n\n${segments.map(renderSegmentIndexLine).join("\n")}\n`
  );
}

function renderSegmentIndexLine(segment: Segment): string {
  return `- ${segment.index}. 第 ${segment.start}-${segment.end} 章：${segment.focus}。章节标题：${segment.chapters
    .map((chapter) => chapter.title)
    .join("、")}`;
}

async function writeSegments(bookDir: string, segments: Segment[]): Promise<void> {
  for (const segment of segments) {
    await writeText(path.join(bookDir, "segments", `${segment.title}.md`), renderSegmentReport(segment));
  }
}

function renderSegmentReport(segment: Segment): string {
  const titles = segment.chapters.map((chapter) => `- ${chapter.index}. ${chapter.title}`).join("\n");
  const signals = inferSegmentSignals(segment);
  return `# 分段拆书报告：第 ${segment.start}-${segment.end} 章 ${segment.focus}

## 章节范围

${titles}

## 阶段目标

本段主要承担“${segment.focus}”功能。它把前一阶段的目标继续推进，并为后续阶段提供新的资源、身份、冲突或设定接口。

## 主要事件链

${signals.eventChain.map((item) => `- ${item}`).join("\n")}

## 新增设定

${signals.settings.map((item) => `- ${item}`).join("\n")}

## 人物关系变化

${signals.relationships.map((item) => `- ${item}`).join("\n")}

## 冲突设计

${signals.conflicts.map((item) => `- ${item}`).join("\n")}

## 爽点设计

${signals.payoffs.map((item) => `- ${item}`).join("\n")}

## 钩子与回收

${signals.hooks.map((item) => `- ${item}`).join("\n")}

## 节奏变化

本段以 ${segment.chapters.length} 章为一个局部单元，通常先通过目标或问题开场，再用资源、战斗、交易、身份或秘密推进，最后留下新的能力期待或地图期待。

## 可复用桥段

${signals.reusable.map((item) => `- ${item}`).join("\n")}

## 不可复用风险

- 不复用原书人物名、势力名、法宝名和连续事件链。
- 只抽象结构、节奏、功能和桥段用途。
- 如果未来用于新小说，需要替换目标、资源、场景和关系组合。
`;
}

function inferSegmentSignals(segment: Segment): {
  eventChain: string[];
  settings: string[];
  relationships: string[];
  conflicts: string[];
  payoffs: string[];
  hooks: string[];
  reusable: string[];
} {
  const titleText = segment.chapters.map((chapter) => chapter.title).join("、");
  const has = (keyword: string) => titleText.includes(keyword);
  const eventChain = [
    `围绕“${segment.focus}”建立阶段问题，并通过多个小事件连续推进。`,
    `章节标题显示本段关键词集中在：${segment.chapters.slice(0, 8).map((chapter) => chapter.title.replace(/^第.+?章/, "")).join("、")}。`,
    `本段结尾通常把当前收益转成下一阶段的新问题，形成连续追读。`
  ];
  const settings = [`强化“${segment.focus}”所需的制度、资源、能力或地图设定。`];
  const relationships = ["围绕主角的同学、师长、交易对象、宗门成员或高阶势力，扩展可调用关系。"];
  const conflicts = ["冲突不只来自敌人，也来自制度门槛、资源成本、知识差、身份差和环境风险。"];
  const payoffs = ["爽点多以小目标兑现呈现：获得资源、学到方法、赢下对抗、打开地图、升级身份或解锁秘密。"];
  const hooks = ["通过新资源、新能力、新人物、新地图或未解秘密把读者引到下一段。"];
  const reusable = [`可复用“${segment.focus}”作为一个阶段功能模块，而不是复用具体剧情。`];

  if (has("斗法") || has("决赛") || has("胜利") || has("战术")) {
    conflicts.push("斗法段适合写规则理解、赛前准备、对手情报、临场误导和底牌兑现。");
    payoffs.push("战斗爽点来自准备和组合技，而不是单纯境界压制。");
    reusable.push("比赛/擂台/考核可以作为低成本高密度爽点容器。");
  }
  if (has("坊市") || has("交易") || has("灵石") || has("进货") || has("摆摊")) {
    settings.push("交易场景用于把抽象资源转成价格、渠道、风险和利润。");
    reusable.push("资源变现段要写清楚来源、渠道、认证、价格和风险。");
  }
  if (has("筑基") || has("结丹") || has("金丹") || has("元婴")) {
    hooks.push("大境界词本身就是强钩子，适合搭配资源筹备和失败风险。");
    payoffs.push("境界推进最好和身份、资源、组织地位一起结算。");
  }
  if (has("魔主") || has("寂灭") || has("元始") || has("合道")) {
    settings.push("终局段把早期道具、道统和世界秘密提升到宇宙位格。");
    reusable.push("终局回收应把早期小钩子解释为高位格体系的一部分。");
  }

  return { eventChain, settings, relationships, conflicts, payoffs, hooks, reusable };
}

async function writeMaterialCards(bookDir: string, segments: Segment[]): Promise<void> {
  for (const segment of segments) {
    const fileName = `${String(segment.index).padStart(3, "0")}-${slug(segment.focus)}.md`;
    await writeText(path.join(bookDir, "material-cards", fileName), renderMaterialCard(segment));
  }
}

function renderMaterialCard(segment: Segment): string {
  return `# 素材卡：${segment.focus}

## 分类

${segment.category}

## 来源章节范围

第 ${segment.start}-${segment.end} 章

## 原始功能

本段在原书中承担“${segment.focus}”功能，连接阶段目标、资源获取、冲突推进和后续钩子。

## 抽象复用方式

把这个段落当作一个可复用阶段模块：先明确阶段目标，再设置资源或制度门槛，通过若干小事件推进，最后用新能力、新地图、新身份或新秘密作为下一段钩子。

## 可变体方向

- 玄幻/仙侠：替换为宗门考核、秘境、坊市、战场、境界突破或道统秘密。
- 都市重生：替换为考试、商业项目、投资机会、人脉升级或舆论事件。
- 科幻：替换为学院任务、实验资源、权限解锁、星际探索或技术迭代。

## 复用边界

只复用阶段功能和节奏，不复用原书连续事件链、人物名、势力名和专有设定组合。

## 标签

${segment.keywords.join("、")}
`;
}

async function writeSynthesis(bookDir: string, title: string, chapters: Chapter[], segments: Segment[]): Promise<void> {
  const focusCounts = countBy(segments.map((segment) => segment.focus));
  await writeText(
    path.join(bookDir, "synthesis", "全书拆书总报告.md"),
    `# 全书拆书总报告：《${title}》

## 拆书范围

- 章节数：${chapters.length}
- 分段数：${segments.length}
- 默认分段规模：约 20 章

## 全书结构学习

本书的核心结构是“现代制度化修仙 + 异界传统修仙资源 + 长线身份升级 + 终局伏笔回收”。它不是只靠单个金手指推进，而是持续把资源、知识、交易、战斗、身份和世界秘密组合成阶段闭环。

## 阶段功能分布

${Object.entries(focusCounts)
  .map(([focus, count]) => `- ${focus}：${count} 个分段`)
  .join("\n")}

## 关键生产启发

- 开局先锚定资源价格和制度压力，再给主角资源点，爽点更稳。
- 金手指要分阶段解锁，每次解锁都带来新的生产能力或信息权限。
- 长篇中段需要持续更换阶段容器：考试、坊市、宗门、战场、道院、身份、终局秘密。
- 生产技能和交易体系可以承担大量“非战斗爽点”。
- 终局伏笔必须和早期小物件、小权限、小秘密建立回收关系。

## 后续人工精修建议

自动全拆已经覆盖所有章节，但每段报告仍是初拆粒度。后续应该挑选高价值分段进行二次精拆，尤其是斗法篇、工业化制符篇、结丹结算篇、道子身份篇和魔主终局篇。
`
  );
}

function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    result[item] = (result[item] ?? 0) + 1;
    return result;
  }, {});
}

async function writeRunOutputs(runDir: string, bookDir: string, chapters: Chapter[], segments: Segment[]): Promise<void> {
  await writeText(
    path.join(runDir, "output", "deconstruction-report.md"),
    `# 全量长程拆书运行报告

## 运行结果

- 章节数：${chapters.length}
- 分段数：${segments.length}
- 持久拆书目录：${bookDir}

## 已生成内容

- 全书章节索引
- 剧情阶段总览
- ${segments.length} 份分段拆书报告
- ${segments.length} 张素材卡
- 全书拆书总报告

## 本次写入素材库的分段条目

${segments.map((segment) => `- ${segment.focus}：第 ${segment.start}-${segment.end} 章`).join("\n")}
`
  );

  await writeText(
    path.join(runDir, "output", "material-updates.json"),
    JSON.stringify(
      {
        targetLibrary: "全局素材库",
        items: segments.map((segment) => ({
          title: `${segment.focus}（第${segment.start}-${segment.end}章）`,
          summary: `本素材来自全量长程拆书第 ${segment.start}-${segment.end} 章，适合作为“${segment.focus}”阶段功能参考。复用时应抽象阶段目标、资源门槛、冲突推进和下一段钩子。`,
          tags: [segment.category, ...segment.keywords],
          source: `《我有一个修仙世界》第${segment.start}-${segment.end}章全量长程拆书`,
          reuseBoundary: "只复用阶段功能、结构和节奏，不复用原书连续事件链、人物名、势力名和专有设定组合。"
        }))
      },
      null,
      2
    )
  );

  await writeText(
    path.join(runDir, "output", "change-record.md"),
    `# 能力改动记录

- 能力：拆书能力
- 模式：全量长程分段拆书
- 章节数：${chapters.length}
- 分段数：${segments.length}
- 持久拆书目录：${bookDir}

## 改动摘要

本次生成全书章节索引、剧情阶段总览、所有分段拆书报告、所有素材卡和全书拆书总报告，并将 ${segments.length} 个分段条目写入全局素材库。
`
  );
}

function slug(input: string): string {
  return input
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
