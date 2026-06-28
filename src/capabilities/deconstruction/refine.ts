import { copyFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { commitPaths } from "../../core/git.js";
import { ensureDir, getWorkspace, readText, writeText } from "../../core/workspace.js";

type RefineInsight = {
  title: string;
  range: string;
  evidence: string;
};

type HighlightInsight = RefineInsight & {
  plot: string;
  setup: string;
  conflict: string;
  payoff: string;
  impact: string;
  reusableMechanism: string;
  reuseBoundary: string;
};

type SettingInsight = {
  name: string;
  category: string;
  range: string;
  definition: string;
  rule: string;
  cost: string;
  interfaces: string;
  evolution: string;
  reuseValue: string;
  reuseBoundary: string;
  evidence: string;
};

type MechanismInsight = {
  name: string;
  range: string;
  principle: string;
  implementation: string;
  appeal: string;
  rewriteMethod: string;
  failureRisk: string;
  evidence: string;
};

type CharacterProfile = {
  name: string;
  role: string;
  range: string;
  identityArc: string;
  relationshipFunction: string;
  evidence: string;
  arc?: string;
  function?: string;
};

type CharacterRelation = {
  source: string;
  target: string;
  type: string;
  range: string;
  relationship: string;
  conflictOrInterest: string;
  change: string;
  plotFunction: string;
  evidence: string;
  detail?: string;
};

type CharacterNetwork = {
  protagonist: string;
  profiles: CharacterProfile[];
  relations: CharacterRelation[];
  misreads: Array<string | CharacterMisread>;
};

type CharacterMisread = {
  surface?: string;
  truth?: string;
  effect?: string;
};

type RefineOutput = {
  title: string;
  highlights: HighlightInsight[];
  settingInsights: SettingInsight[];
  mechanisms: MechanismInsight[];
  characterNetwork: CharacterNetwork;
};

export async function prepareRefineRun(bookDir: string): Promise<string> {
  const workspace = getWorkspace();
  const absoluteBookDir = path.resolve(bookDir);
  await stat(absoluteBookDir);

  const title = await inferTitle(absoluteBookDir);
  const runId = createRunId(title);
  const runDir = path.join(workspace.runsDir, runId);
  const inputDir = path.join(runDir, "input");
  const outputDir = path.join(runDir, "output");
  await ensureDir(inputDir);
  await ensureDir(outputDir);

  const sourceFile = await findSourceFile(absoluteBookDir);
  const sourceCopy = sourceFile ? path.join(inputDir, path.basename(sourceFile)) : undefined;
  if (sourceFile && sourceCopy) {
    await copyFile(sourceFile, sourceCopy);
  }

  const audit = await readOptional(path.join(absoluteBookDir, "产物有效性审计.md"));
  const characterGraph = await readOptional(path.join(absoluteBookDir, "人物与关系图.md"));
  const chapterIndex = await readOptional(path.join(absoluteBookDir, "章节索引.md"));
  const deepData = await readOptional(path.join(absoluteBookDir, "深拆中间数据.json"));

  await writeText(path.join(runDir, "TASK.md"), renderRefineTask(title, absoluteBookDir, sourceCopy, audit));
  await writeText(path.join(inputDir, "章节索引.md"), trimForInput(chapterIndex, 20000));
  await writeText(path.join(inputDir, "人物与关系图.md"), trimForInput(characterGraph, 50000));
  await writeText(path.join(inputDir, "产物有效性审计.md"), trimForInput(audit, 50000));
  await writeText(path.join(inputDir, "深拆中间数据.json"), trimForInput(deepData, 80000));
  await writeText(path.join(outputDir, "refine-insights.json"), renderRefineOutputTemplate(title));
  await writeText(
    path.join(runDir, "meta.json"),
    JSON.stringify({ runId, capability: "拆书返工", title, bookDir: absoluteBookDir, sourceFile: sourceCopy }, null, 2)
  );

  return runDir;
}

export async function applyRefineRun(runDir: string): Promise<void> {
  const meta = JSON.parse(await readText(path.join(runDir, "meta.json"))) as { title: string; bookDir: string };
  const output = parseRefineOutput(await readText(path.join(runDir, "output", "refine-insights.json")));
  const capabilityTitle = capabilityStoryBibleTitle(output);
  const capabilityPredicate = capabilityStoryBiblePredicate(output);
  if (
    output.highlights.length === 0 ||
    output.settingInsights.length === 0 ||
    output.mechanisms.length === 0 ||
    output.characterNetwork.profiles.length === 0 ||
    output.characterNetwork.relations.length === 0
  ) {
    throw new Error("返工输出必须同时包含 highlights、settingInsights、mechanisms 和 characterNetwork。");
  }

  await Promise.all([
    writeText(path.join(meta.bookDir, "全书拆书总报告.md"), renderBookOverview(output)),
    writeText(path.join(meta.bookDir, "剧情阶段总览.md"), renderStageOverview(output)),
    writeText(path.join(meta.bookDir, "关键事件链.md"), renderEventChain(output)),
    writeText(path.join(meta.bookDir, "深度高光片段.md"), renderHighlights(output)),
    writeText(path.join(meta.bookDir, "深度设定沉淀.md"), renderSettings(output)),
    writeText(path.join(meta.bookDir, "优点与可复用机制.md"), renderMechanisms(output, "优点与可复用机制")),
    writeText(path.join(meta.bookDir, "人物与关系图.md"), renderCharacterNetwork(output)),
    writeText(path.join(meta.bookDir, "设定集-总览.md"), renderStoryBibleOverview(output)),
    writeText(path.join(meta.bookDir, "设定集-修炼与能力体系.md"), renderStoryBibleFile(output, capabilityTitle, capabilityPredicate)),
    writeText(path.join(meta.bookDir, "设定集-地图与空间层级.md"), renderStoryBibleFile(output, "地图与空间层级", (item) => matchesAny(item, ["地图", "空间", "星界", "世界", "两界", "大陆", "城市", "国家", "神域", "禁区", "宇宙", "政治格局"]))),
    writeText(path.join(meta.bookDir, "设定集-势力与组织.md"), renderStoryBibleFile(output, "势力与组织", (item) => matchesAny(item, ["组织", "势力", "教会", "议会", "宗门", "学院", "朝廷", "军队", "家族", "士族", "官僚", "公司", "政治"]))),
    writeText(path.join(meta.bookDir, "设定集-资源体系.md"), renderStoryBibleFile(output, "资源体系", (item) => matchesAny(item, ["资源", "经济", "材料", "灵石", "钱", "积分", "权限", "养料", "源种", "传承", "物资"]))),
    writeText(path.join(meta.bookDir, "修炼能力与资源体系.md"), renderCapabilityResourceFile(output)),
    writeText(path.join(meta.bookDir, "设定集-人物关系与身份体系.md"), renderIdentityStoryBible(output)),
    writeText(path.join(meta.bookDir, "设定集-世界规则与禁忌.md"), renderStoryBibleFile(output, "世界规则与禁忌", (item) => matchesAny(item, ["世界", "规则", "禁忌", "代价", "制度", "污染", "旧日", "星空", "神权", "宗教", "历史", "终局", "政治规则"]))),
    writeText(path.join(meta.bookDir, "设定集-设定时间线.md"), renderTimelineStoryBible(output)),
    writeText(path.join(meta.bookDir, "设定集-写作复用边界.md"), renderReuseBoundary(output)),
    writeText(path.join(meta.bookDir, "深拆中间数据.json"), renderRefinedDeepData(output))
  ]);

  await commitPaths([runDir, meta.bookDir], `应用拆书返工产物`);
}

async function inferTitle(bookDir: string): Promise<string> {
  try {
    const manifest = JSON.parse(await readText(path.join(bookDir, "manifest.json"))) as { title?: string };
    return manifest.title ?? path.basename(bookDir);
  } catch {
    return path.basename(bookDir);
  }
}

async function findSourceFile(bookDir: string): Promise<string | undefined> {
  const sourceDir = path.join(bookDir, "source");
  try {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    return entries.find((entry) => entry.isFile()) ? path.join(sourceDir, entries.find((entry) => entry.isFile())?.name ?? "") : undefined;
  } catch {
    return undefined;
  }
}

async function readOptional(file: string): Promise<string> {
  try {
    return await readText(file);
  } catch {
    return "";
  }
}

function trimForInput(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, Math.floor(maxLength * 0.65))}\n\n...[中间内容省略，返工时请读取原文件继续核对]...\n\n${content.slice(-Math.floor(maxLength * 0.35))}`;
}

function renderRefineTask(title: string, bookDir: string, sourceFile: string | undefined, audit: string): string {
  return `# 拆书返工任务：《${title}》

请基于原文和现有拆书产物，重写高光、设定、机制三类资产。目标不是润色旧 Markdown，而是补出后续自动写作可用的深度内容。

## 输入

- 持久拆书目录：${bookDir}
- 本任务输入目录：\`input/\`
- 原文副本：${sourceFile ?? "未找到，请使用持久拆书目录 source/ 下的原文"}

## 当前审计摘要

${audit ? audit.slice(0, 12000) : "未找到审计报告；请先运行 deconstruct audit。"}

## 输出

请只编辑 \`output/refine-insights.json\`，必须符合其中模板。要求：

- highlights 至少 10 条；长篇超过 1200 章至少 16 条。
- settingInsights 至少 12 条，覆盖世界规则、能力体系、资源体系、组织势力、地图层级、人物身份、禁忌代价、时间线。
- mechanisms 至少 8 条，必须能说明“为什么好看”和“如何改写到新书”。
- characterNetwork.profiles 至少 30 个主要/高频功能人物；短篇或文本确实不足时必须在 misreads 说明。
- characterNetwork.relations 至少 40 条语义关系边，必须写清敌对/合作/师徒/上下级/亲属情感/交易利用/组织身份等关系，不允许只写“有关联”。
- 每条都必须有章节范围和证据摘要。
- 禁止使用“通常、可能、需要二次精读、候选”等占位话。
- 禁止多个条目复用同一套模板句。
`;
}

function renderRefineOutputTemplate(title: string): string {
  return JSON.stringify(
    {
      title,
      highlights: [
        {
          title: "高光片段名",
          range: "第 1-20 章",
          plot: "具体剧情过程",
          setup: "前置铺垫",
          conflict: "冲突设计",
          payoff: "当场兑现",
          impact: "后续影响",
          reusableMechanism: "可复用写法",
          reuseBoundary: "复用边界",
          evidence: "章节证据摘要"
        }
      ],
      settingInsights: [
        {
          name: "设定名",
          category: "能力体系",
          range: "第 1-20 章",
          definition: "设定定义",
          rule: "运行规则",
          cost: "代价限制",
          interfaces: "人物/势力接口",
          evolution: "阶段变化",
          reuseValue: "借鉴价值",
          reuseBoundary: "复用边界",
          evidence: "章节证据摘要"
        }
      ],
      mechanisms: [
        {
          name: "机制名",
          range: "第 1-20 章",
          principle: "机制原理",
          implementation: "本书实现方式",
          appeal: "为什么好看",
          rewriteMethod: "改写方法",
          failureRisk: "失败风险",
          evidence: "章节证据摘要"
        }
      ],
      characterNetwork: {
        protagonist: "主角姓名",
        profiles: [
          {
            name: "人物名",
            role: "主角/核心同伴/主要对手/导师上位者/亲属情感/交易对象/重要配角",
            range: "第 1-20 章",
            identityArc: "身份变化或阶段功能",
            relationshipFunction: "此人在主角关系网或主要矛盾中的功能",
            evidence: "章节证据摘要"
          }
        ],
        relations: [
          {
            source: "人物 A",
            target: "人物 B",
            type: "敌对/矛盾",
            range: "第 1-20 章",
            relationship: "两人的具体关系",
            conflictOrInterest: "矛盾、利益、情感、身份或组织牵引",
            change: "关系如何变化",
            plotFunction: "这条关系承担的剧情功能",
            evidence: "章节证据摘要"
          }
        ],
        misreads: ["旧产物里明显误判或需要删除的人物/关系"]
      }
    },
    null,
    2
  );
}

function parseRefineOutput(content: string): RefineOutput {
  const parsed = JSON.parse(content) as RefineOutput;
  return {
    title: requireText(parsed.title, "title"),
    highlights: ensureArray(parsed.highlights).map(normalizeHighlight),
    settingInsights: ensureArray(parsed.settingInsights).map(normalizeSetting),
    mechanisms: ensureArray(parsed.mechanisms).map(normalizeMechanism),
    characterNetwork: normalizeCharacterNetwork(parsed.characterNetwork)
  };
}

function normalizeHighlight(item: HighlightInsight): HighlightInsight {
  return {
    title: requireText(item.title, "highlight.title"),
    range: requireText(item.range, "highlight.range"),
    plot: requireText(item.plot, "highlight.plot"),
    setup: requireText(item.setup, "highlight.setup"),
    conflict: requireText(item.conflict, "highlight.conflict"),
    payoff: requireText(item.payoff, "highlight.payoff"),
    impact: requireText(item.impact, "highlight.impact"),
    reusableMechanism: requireText(item.reusableMechanism, "highlight.reusableMechanism"),
    reuseBoundary: requireText(item.reuseBoundary, "highlight.reuseBoundary"),
    evidence: requireText(item.evidence, "highlight.evidence")
  };
}

function normalizeSetting(item: SettingInsight): SettingInsight {
  return {
    name: requireText(item.name, "setting.name"),
    category: requireText(item.category, "setting.category"),
    range: requireText(item.range, "setting.range"),
    definition: requireText(item.definition, "setting.definition"),
    rule: requireText(item.rule, "setting.rule"),
    cost: requireText(item.cost, "setting.cost"),
    interfaces: requireText(item.interfaces, "setting.interfaces"),
    evolution: requireText(item.evolution, "setting.evolution"),
    reuseValue: requireText(item.reuseValue, "setting.reuseValue"),
    reuseBoundary: requireText(item.reuseBoundary, "setting.reuseBoundary"),
    evidence: requireText(item.evidence, "setting.evidence")
  };
}

function normalizeMechanism(item: MechanismInsight): MechanismInsight {
  return {
    name: requireText(item.name, "mechanism.name"),
    range: requireText(item.range, "mechanism.range"),
    principle: requireText(item.principle, "mechanism.principle"),
    implementation: requireText(item.implementation, "mechanism.implementation"),
    appeal: requireText(item.appeal, "mechanism.appeal"),
    rewriteMethod: requireText(item.rewriteMethod, "mechanism.rewriteMethod"),
    failureRisk: requireText(item.failureRisk, "mechanism.failureRisk"),
    evidence: requireText(item.evidence, "mechanism.evidence")
  };
}

function normalizeCharacterNetwork(value: CharacterNetwork | undefined): CharacterNetwork {
  return {
    protagonist: requireText(value?.protagonist, "characterNetwork.protagonist"),
    profiles: ensureArray(value?.profiles).map(normalizeCharacterProfile),
    relations: ensureArray(value?.relations).map(normalizeCharacterRelation),
    misreads: ensureArray(value?.misreads).map(normalizeCharacterMisread)
  };
}

function normalizeCharacterMisread(item: string | CharacterMisread): string {
  if (typeof item === "string") {
    return requireText(item, "characterNetwork.misreads");
  }
  const parts = [
    item.surface ? `表象：${item.surface}` : "",
    item.truth ? `真相：${item.truth}` : "",
    item.effect ? `影响：${item.effect}` : ""
  ].filter(Boolean);
  return requireText(parts.join("；"), "characterNetwork.misreads");
}

function normalizeCharacterProfile(item: CharacterProfile): CharacterProfile {
  const identityArc = item.identityArc ?? item.arc;
  const relationshipFunction = item.relationshipFunction ?? item.function;
  return {
    name: requireText(item.name, "character.profile.name"),
    role: requireText(item.role, "character.profile.role"),
    range: requireText(item.range ?? "全书多阶段", "character.profile.range"),
    identityArc: requireText(identityArc, "character.profile.identityArc"),
    relationshipFunction: requireText(relationshipFunction, "character.profile.relationshipFunction"),
    evidence: requireText(item.evidence ?? `${item.name} 在人物关系网中承担“${relationshipFunction ?? item.role}”功能。`, "character.profile.evidence")
  };
}

function normalizeCharacterRelation(item: CharacterRelation): CharacterRelation {
  const detail = item.detail ?? item.relationship;
  return {
    source: requireText(item.source, "character.relation.source"),
    target: requireText(item.target, "character.relation.target"),
    type: requireText(item.type, "character.relation.type"),
    range: requireText(item.range ?? "全书多阶段", "character.relation.range"),
    relationship: requireText(item.relationship ?? detail, "character.relation.relationship"),
    conflictOrInterest: requireText(item.conflictOrInterest ?? detail, "character.relation.conflictOrInterest"),
    change: requireText(item.change ?? detail, "character.relation.change"),
    plotFunction: requireText(item.plotFunction ?? detail, "character.relation.plotFunction"),
    evidence: requireText(item.evidence ?? detail, "character.relation.evidence")
  };
}

function requireText(value: string | undefined, field: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`返工 JSON 缺少字段：${field}`);
  }
  return value.trim();
}

function ensureArray<T>(value: T[] | undefined): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

function renderHighlights(output: RefineOutput): string {
  return `# 深度高光片段：《${output.title}》

## 生成口径

本文件来自返工精读 JSON，用于替换模板化高光报告。每条都必须能服务后续章节生成和素材复用。

## 高光片段详拆

${output.highlights.map((item, index) => `### ${index + 1}. ${item.range}：${item.title}

**剧情概述**：${item.plot}

**剧情拆分**：

- 起点：${item.setup}
- 推进：${item.conflict}
- 结果：${item.payoff}

**前置铺垫**：${item.setup}

**冲突设计**：${item.conflict}

**当场爽点**：${item.payoff}

**后续影响**：${item.impact}

**为什么好**：${item.evidence}

**可复用写法**：${item.reusableMechanism}

**不可复用元素**：${item.reuseBoundary}
`).join("\n")}
`;
}

function renderSettings(output: RefineOutput): string {
  return `# 深度设定沉淀：《${output.title}》

## 生成口径

本文件来自返工精读 JSON，用于替换模板化设定报告。每条设定都应进入后续 Story Bible。

## 设定条目

${output.settingInsights.map((item, index) => `### ${index + 1}. ${item.name}

**设定定义**：${item.definition}

**剧情落点**：${item.range}。证据摘要：${item.evidence}

**运行规则**：${item.rule}

**代价与限制**：${item.cost}

**人物和势力接口**：${item.interfaces}

**阶段变化**：${item.evolution}

**为什么值得借鉴**：${item.reuseValue}

**复用边界**：${item.reuseBoundary}
`).join("\n")}
`;
}

function renderMechanisms(output: RefineOutput, title: string): string {
  return `# ${title}：《${output.title}》

## 生成口径

本文件来自返工精读 JSON，用于替换标题级机制列表。每条机制都必须能指导新书改写。

## 机制拆解

${output.mechanisms.map((item, index) => `### ${index + 1}. ${item.name}

**机制原理**：${item.principle}

**本书中的工作方式**：${item.implementation}（来源：${item.range}；证据摘要：${item.evidence}）

**为什么好看**：${item.appeal}

**适用题材**：男频玄幻、仙侠、都市重生、科幻、高武、历史、西幻或志怪题材均可借用其结构，但必须替换题材包装、资源形态和组织关系。

**改写方法**：${item.rewriteMethod}

**失败风险**：${item.failureRisk}
`).join("\n")}
`;
}

function renderBookOverview(output: RefineOutput): string {
  return `# 全书拆书总报告：《${output.title}》

## 结论

本报告来自子 Agent 精读返工结果，只保留对后续自动写作有检索和复用价值的结论。旧的标题级分段报告、正则实体表和占位审计不再作为事实源。

## 创作资产概览

- 高光片段：${output.highlights.length} 条，见 \`深度高光片段.md\`。
- 设定条目：${output.settingInsights.length} 条，见 \`深度设定沉淀.md\` 和 \`设定集-*.md\`。
- 可复用机制：${output.mechanisms.length} 条，见 \`优点与可复用机制.md\`。
- 主要人物：${output.characterNetwork.profiles.length} 个，语义关系边：${output.characterNetwork.relations.length} 条，见 \`人物与关系图.md\`。

## 全书最值得复用的机制

${output.mechanisms.slice(0, 10).map((item, index) => `### ${index + 1}. ${item.name}

- **为什么好看**：${item.appeal}
- **本书实现**：${item.implementation}
- **改写方法**：${item.rewriteMethod}
- **失败风险**：${item.failureRisk}
`).join("\n")}

## 优先检索入口

- 查剧情高光：\`深度高光片段.md\`
- 查设定事实：\`设定集-总览.md\` 与各 \`设定集-*.md\`
- 查人物关系：\`人物与关系图.md\`
- 查事件因果：\`关键事件链.md\`
- 查机器可读数据：\`深拆中间数据.json\`
`;
}

function renderStageOverview(output: RefineOutput): string {
  return `# 剧情阶段总览：《${output.title}》

## 生成口径

本文件只保留精读后确认有复用价值的关键阶段，不再逐 20 章罗列标题。完整章节检索见 \`章节索引.md\`，具体事件因果见 \`关键事件链.md\`。

## 关键阶段

${output.highlights.map((item, index) => `### ${index + 1}. ${item.range}：${item.title}

**阶段事件**：${item.plot}

**阶段矛盾**：${item.conflict}

**阶段兑现**：${item.payoff}

**后续影响**：${item.impact}

**可复用写法**：${item.reusableMechanism}
`).join("\n")}
`;
}

function renderEventChain(output: RefineOutput): string {
  return `# 关键事件链：《${output.title}》

## 生成口径

本文件来自子 Agent 精读确认的高光事件，用于替代旧的空事件占位。每条事件都必须能回答：前因是什么、冲突如何升级、兑现了什么、后续改变了哪里。

## 事件链

${output.highlights.map((item, index) => `### ${index + 1}. ${item.range}：${item.title}

**前因**：${item.setup}

**冲突升级**：${item.conflict}

**事件过程**：${item.plot}

**当场结果**：${item.payoff}

**后续影响**：${item.impact}

**证据摘要**：${item.evidence}
`).join("\n")}
`;
}

function renderCharacterNetwork(output: RefineOutput): string {
  return `# 人物与关系图：《${output.title}》

## 生成口径

本文件来自子 Agent 精读校正 JSON，用语义关系替换机械共现统计。人物和关系必须能服务后续章节生成、设定校验和吃书检查。

## 主角

${output.characterNetwork.protagonist}

## 主要人物画像

${output.characterNetwork.profiles.map((item, index) => `### ${index + 1}. ${item.name}

- **功能定位**：${item.role}
- **章节范围**：${item.range}
- **身份变化**：${item.identityArc}
- **关系网功能**：${item.relationshipFunction}
- **证据摘要**：${item.evidence}
`).join("\n")}

## 语义关系边

${output.characterNetwork.relations.map((item, index) => `### ${index + 1}. ${item.source} -> ${item.target}

- **关系类型**：${item.type}
- **章节范围**：${item.range}
- **具体关系**：${item.relationship}
- **矛盾/利益/情感牵引**：${item.conflictOrInterest}
- **阶段变化**：${item.change}
- **剧情功能**：${item.plotFunction}
- **证据摘要**：${item.evidence}
`).join("\n")}

## 当前自动图明显误判或需删除项

${output.characterNetwork.misreads.length > 0 ? output.characterNetwork.misreads.map((item) => `- ${item}`).join("\n") : "- 暂无明确误判。"}
`;
}

function renderStoryBibleOverview(output: RefineOutput): string {
  return `# 设定集-总览：《${output.title}》

## 文件用途

本文件来自子 Agent 精读返工结果，是后续自动写作、章节审核和吃书检查的事实入口。具体规则以各分册设定集为准。

## 核心承诺

- 高光片段：${output.highlights.length} 条
- 设定条目：${output.settingInsights.length} 条
- 优点机制：${output.mechanisms.length} 条
- 主要人物：${output.characterNetwork.profiles.length} 个
- 语义关系边：${output.characterNetwork.relations.length} 条

## 题材与爽点接口

${output.mechanisms.slice(0, 8).map((item) => `- **${item.name}**：${item.appeal} 改写时可按“${item.rewriteMethod}”处理，风险是 ${item.failureRisk}`).join("\n")}

## 关键高光入口

${output.highlights.slice(0, 12).map((item) => `- **${item.range} ${item.title}**：${item.plot} 后续影响：${item.impact}`).join("\n")}
`;
}

function renderStoryBibleFile(output: RefineOutput, fileTitle: string, predicate: (item: SettingInsight) => boolean): string {
  const matched = output.settingInsights.filter(predicate);
  const selected = matched.length > 0 ? matched : output.settingInsights.slice(0, Math.min(8, output.settingInsights.length));
  return `# 设定集-${fileTitle}：《${output.title}》

## 文件用途

本文件来自子 Agent 精读返工结果。写章节前先查本文件，确认规则、代价、人物接口和复用边界。

## 设定条目

${selected.map((item, index) => renderSettingStoryBibleEntry(index + 1, item)).join("\n")}
`;
}

function renderCapabilityResourceFile(output: RefineOutput): string {
  const historical = isHistoricalResourceBook(output);
  const selected = output.settingInsights.filter(capabilityStoryBiblePredicate(output));
  const settings = selected.length > 0 ? selected : output.settingInsights.slice(0, Math.min(12, output.settingInsights.length));
  const title = historical ? "能力与资源体系（历史军政适配）" : "修炼能力与资源体系";
  const note = historical
    ? "本书属于历史/军政题材，不存在境界、功法、魔药、序列这类超凡修炼体系。本文件只拆主角和势力可调度的现实能力与资源：官职制度、军队兵粮、地缘、名望、人脉、门生故吏、商业财政、正统叙事和信息差。"
    : "本文件沉淀本书的修炼、能力、资源和规则接口。写章节前先确认入口条件、升级方式、代价限制和人物/势力接口。";
  return `# ${title}：《${output.title}》

## 题材适配说明

${note}

## 能力/资源/规则条目

${settings.map((item, index) => `### ${index + 1}. ${item.name}

**类型**：${item.category}

**定义**：${item.definition}

**运行规则**：${item.rule}

**资源或代价**：${item.cost}

**人物/势力接口**：${item.interfaces}

**阶段变化**：${item.evolution}

**剧情落点**：${item.range}。证据摘要：${item.evidence}

**可复用价值**：${item.reuseValue}

**复用边界**：${item.reuseBoundary}
`).join("\n")}
`;
}

function renderIdentityStoryBible(output: RefineOutput): string {
  const identitySettings = output.settingInsights.filter((item) => matchesAny(item, ["身份", "人物", "关系"]));
  const settingEntries = identitySettings.length > 0 ? identitySettings.map((item, index) => renderSettingStoryBibleEntry(index + 1, item)).join("\n") : "";
  const profileEntries = output.characterNetwork.profiles.slice(0, 24).map((item, index) => `## ${identitySettings.length + index + 1}. ${item.name}

**设定定义**：${item.name} 的身份功能是“${item.role}”，主要承担 ${item.relationshipFunction}

**运行规则**：调用 ${item.name} 时，先确认其在 ${item.range} 的身份阶段，再围绕其关系功能安排行动、信息、压力或兑现。

**剧情落点**：${item.range}。证据摘要：${item.evidence}

**代价与限制**：复用 ${item.name} 的功能位时，必须改写姓名、阵营、利益和互动场景；若只保留标签而不保留“${item.relationshipFunction}”，人物会失去剧情作用。

**人物和势力接口**：${item.relationshipFunction}

**阶段变化**：${item.identityArc}

**复用边界**：可借鉴 ${item.role} 的结构作用，不能迁移 ${item.name} 的专名、原书标志性互动和原有人物绑定关系。
`).join("\n");
  return `# 设定集-人物关系与身份体系：《${output.title}》

## 文件用途

本文件来自子 Agent 精读返工结果。它用于约束人物身份、关系变化和章节生成时的人物调用。

## 设定条目

${settingEntries}
${profileEntries}
`;
}

function renderTimelineStoryBible(output: RefineOutput): string {
  return `# 设定集-设定时间线：《${output.title}》

## 文件用途

本文件把高光节点转成可检索的设定时间线。写后续章节时，用它检查伏笔、升级、兑现和后续影响。

## 时间线条目

${output.highlights.map((item, index) => `## ${index + 1}. ${item.range}：${item.title}

**设定定义**：这是全书时间线上的关键剧情节点，核心事件是：${item.plot}

**运行规则**：该节点通过“${item.reusableMechanism}”运转。写同类章节时，要先搭建前置铺垫，再制造限制和冲突，最后兑现明确收益或真相。

**剧情落点**：${item.range}。证据摘要：${item.evidence}

**代价与限制**：${item.conflict} 复用时还要遵守：${item.reuseBoundary}

**人物和势力接口**：前置铺垫为“${item.setup}”；冲突接口为“${item.conflict}”。

**阶段变化**：${item.impact}

**复用边界**：${item.reuseBoundary}
`).join("\n")}
`;
}

function renderReuseBoundary(output: RefineOutput): string {
  return `# 设定集-写作复用边界：《${output.title}》

## 可复用结构

${output.mechanisms.map((item) => `- **${item.name}**：${item.rewriteMethod}`).join("\n")}

## 不可复用边界

${[
  ...output.highlights.map((item) => `- **${item.title}**：${item.reuseBoundary}`),
  ...output.settingInsights.map((item) => `- **${item.name}**：${item.reuseBoundary}`),
  ...output.mechanisms.map((item) => `- **${item.name}**：${item.failureRisk}`)
].join("\n")}
`;
}

function renderSettingStoryBibleEntry(index: number, item: SettingInsight): string {
  return `## ${index}. ${item.name}

**设定定义**：${item.definition}

**运行规则**：${item.rule}

**剧情落点**：${item.range}。证据摘要：${item.evidence}

**代价与限制**：${item.cost}

**人物和势力接口**：${item.interfaces}

**阶段变化**：${item.evolution}

**复用边界**：${item.reuseBoundary}

**写作用途**：${item.reuseValue}
`;
}

function renderRefinedDeepData(output: RefineOutput): string {
  return JSON.stringify(
    {
      refineAgentRun: true,
      title: output.title,
      agentChunkCount: 1,
      chunkCount: 1,
      events: output.highlights.map((item) => ({
        name: item.title,
        range: item.range,
        summary: item.plot,
        impact: item.impact,
        evidence: item.evidence
      })),
      highlights: output.highlights,
      settingInsights: output.settingInsights,
      mechanisms: output.mechanisms,
      characterNetwork: output.characterNetwork
    },
    null,
    2
  );
}

function matchesAny(item: SettingInsight, keywords: string[]): boolean {
  const haystack = `${item.name} ${item.category} ${item.definition} ${item.rule}`;
  return keywords.some((keyword) => haystack.includes(keyword));
}

function capabilityStoryBibleTitle(output: RefineOutput): string {
  return isHistoricalResourceBook(output) ? "能力与资源体系（历史军政适配）" : "修炼与能力体系";
}

function capabilityStoryBiblePredicate(output: RefineOutput): (item: SettingInsight) => boolean {
  if (isHistoricalResourceBook(output)) {
    return (item) =>
      matchesAny(item, [
        "军政",
        "政治",
        "朝廷",
        "官僚",
        "官署",
        "士族",
        "家族",
        "州郡",
        "军队",
        "兵粮",
        "财政",
        "商业",
        "屯田",
        "地缘",
        "边疆",
        "名望",
        "人脉",
        "门生",
        "故吏",
        "正统",
        "资源",
        "制度",
        "身份"
      ]);
  }
  return (item) => matchesAny(item, ["能力", "修炼", "魔法", "奥术", "序列", "途径", "武道", "训练", "功法", "科技", "高维", "仪式"]);
}

function isHistoricalResourceBook(output: RefineOutput): boolean {
  const text = output.settingInsights
    .map((item) => `${item.name} ${item.category} ${item.definition} ${item.rule} ${item.interfaces}`)
    .join("\n");
  const historicalScore = occurrences(text, "汉末") + occurrences(text, "朝廷") + occurrences(text, "士族") + occurrences(text, "州郡") + occurrences(text, "军政") + occurrences(text, "官僚") + occurrences(text, "边疆") + occurrences(text, "正统");
  const cultivationScore = occurrences(text, "修炼") + occurrences(text, "境界") + occurrences(text, "功法") + occurrences(text, "魔法") + occurrences(text, "奥术") + occurrences(text, "序列") + occurrences(text, "魔药") + occurrences(text, "筑基") + occurrences(text, "武道");
  return historicalScore >= 3 && historicalScore > cultivationScore;
}

function occurrences(text: string, keyword: string): number {
  return text.split(keyword).length - 1;
}

function createRunId(title: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const slug = title.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${timestamp}-refine-${slug || "untitled"}`;
}
