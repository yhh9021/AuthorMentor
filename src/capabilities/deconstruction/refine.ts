import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { commitPaths } from "../../core/git.js";
import { ensureDir, getWorkspace, readText, writeText } from "../../core/workspace.js";
import { buildCharacterRecallFromSourceFile, findBookSourceFile, normalizeCharacterRecallReport, parseCharacterRecallReport, type CharacterRecallReport } from "./character-recall.js";
import {
  hasAnyTopicOutput,
  readTopicOutputs,
  renderTopicCapabilityResource,
  renderTopicCharacterNetwork,
  renderTopicDeepData,
  renderTopicDeepSettings,
  renderTopicEventChain,
  renderTopicFactions,
  renderTopicHighlights,
  renderTopicIdentityStoryBible,
  renderTopicMap,
  renderTopicMechanisms,
  renderTopicSettingFile,
  renderTopicStageOverview,
  writeTopicRefineScaffold
} from "./topic-refine.js";

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

type StoryEvent = RefineInsight & {
  timeLabel?: string;
  summary: string;
  setup: string;
  conflict: string;
  turn: string;
  result: string;
  impact: string;
  involved: string;
};

type TimelineEntry = {
  timeLabel: string;
  range: string;
  event: string;
  involved: string;
  politicalContext: string;
  consequence: string;
  evidence: string;
};

type LocationInsight = {
  name: string;
  category: string;
  region: string;
  range: string;
  controller: string;
  function: string;
  connectedLocations: string;
  powerDistribution: string;
  evidence: string;
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
  importance?: string;
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
  events: StoryEvent[];
  timeline: TimelineEntry[];
  locations: LocationInsight[];
  settingInsights: SettingInsight[];
  mechanisms: MechanismInsight[];
  characterNetwork: CharacterNetwork;
  characterRecall?: CharacterRecallReport;
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

  const sourceFile = await findBookSourceFile(absoluteBookDir);
  const sourceCopy = sourceFile ? path.join(inputDir, path.basename(sourceFile)) : undefined;
  if (sourceFile && sourceCopy) {
    await copyFile(sourceFile, sourceCopy);
  }
  const characterRecall = sourceFile ? await buildCharacterRecallFromSourceFile(sourceFile, title) : undefined;

  const audit = await readOptional(path.join(absoluteBookDir, "产物有效性审计.md"));
  const characterGraph = await readOptional(path.join(absoluteBookDir, "人物与关系图.md"));
  const chapterIndex = await readOptional(path.join(absoluteBookDir, "章节索引.md"));
  const deepData = await readOptional(path.join(absoluteBookDir, "深拆中间数据.json"));

  await writeText(path.join(runDir, "TASK.md"), renderRefineTask(title, absoluteBookDir, sourceCopy, audit, characterRecall));
  await writeText(path.join(inputDir, "章节索引.md"), trimForInput(chapterIndex, 20000));
  await writeText(path.join(inputDir, "人物与关系图.md"), trimForInput(characterGraph, 50000));
  await writeText(path.join(inputDir, "产物有效性审计.md"), trimForInput(audit, 50000));
  await writeText(path.join(inputDir, "深拆中间数据.json"), trimForInput(deepData, 80000));
  if (characterRecall) {
    await writeText(path.join(inputDir, "角色召回候选.json"), JSON.stringify(characterRecall, null, 2));
  }
  await writeTopicRefineScaffold({ runDir, title, bookDir: absoluteBookDir, sourceCopy, characterRecall });
  await writeText(path.join(outputDir, "refine-insights.json"), renderRefineOutputTemplate(title));
  await writeText(
    path.join(runDir, "meta.json"),
    JSON.stringify({ runId, capability: "拆书返工", title, bookDir: absoluteBookDir, sourceFile: sourceCopy }, null, 2)
  );

  return runDir;
}

export async function applyRefineRun(runDir: string): Promise<void> {
  const meta = JSON.parse(await readText(path.join(runDir, "meta.json"))) as { title: string; bookDir: string };
  const parsedOutput = parseRefineOutput(await readText(path.join(runDir, "output", "refine-insights.json")));
  const output: RefineOutput = {
    ...parsedOutput,
    characterRecall: parsedOutput.characterRecall ?? (await readOptionalRecall(path.join(runDir, "input", "角色召回候选.json")))
  };
  const topics = await readTopicOutputs(runDir);
  const topicData = hasAnyTopicOutput(topics) ? renderTopicDeepData(topics) : undefined;
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
    writeText(path.join(meta.bookDir, "剧情阶段总览.md"), topics.plot ? renderTopicStageOverview(output.title, topics.plot) : renderStageOverview(output)),
    writeText(path.join(meta.bookDir, "关键事件链.md"), topics.plot ? renderTopicEventChain(output.title, topics.plot) : renderEventChain(output)),
    writeText(path.join(meta.bookDir, "深度高光片段.md"), topics.highlights ? renderTopicHighlights(output.title, topics.highlights, topics.highlightCandidates) : renderHighlights(output)),
    writeText(path.join(meta.bookDir, "深度设定沉淀.md"), topics.settings ? renderTopicDeepSettings(output.title, topics.settings) : renderSettings(output)),
    writeText(path.join(meta.bookDir, "优点与可复用机制.md"), topics.highlights ? renderTopicMechanisms(output.title, topics.highlights, topics.highlightCandidates) : renderMechanisms(output, "优点与可复用机制")),
    writeText(path.join(meta.bookDir, "人物与关系图.md"), topics.characters ? renderTopicCharacterNetwork(output.title, topics.characters, output.characterRecall) : renderCharacterNetwork(output)),
    writeText(path.join(meta.bookDir, "设定集-总览.md"), renderStoryBibleOverview(output)),
    writeText(path.join(meta.bookDir, "设定集-修炼与能力体系.md"), topics.settings ? renderTopicSettingFile(output.title, capabilityTitle, topics.settings.capabilitySystem) : renderStoryBibleFile(output, capabilityTitle, capabilityPredicate)),
    writeText(path.join(meta.bookDir, "设定集-地图与空间层级.md"), topics.map ? renderTopicMap(output.title, topics.map) : renderMapStoryBible(output)),
    writeText(path.join(meta.bookDir, "设定集-势力与组织.md"), topics.factions ? renderTopicFactions(output.title, topics.factions) : renderStoryBibleFile(output, "势力与组织", (item) => matchesAny(item, ["组织", "势力", "教会", "议会", "宗门", "学院", "朝廷", "军队", "家族", "士族", "官僚", "公司", "政治"]))),
    writeText(path.join(meta.bookDir, "设定集-资源体系.md"), topics.settings ? renderTopicSettingFile(output.title, "资源体系", topics.settings.resourceSystem) : renderStoryBibleFile(output, "资源体系", (item) => matchesAny(item, ["资源", "经济", "材料", "灵石", "钱", "积分", "权限", "养料", "源种", "传承", "物资"]))),
    writeText(path.join(meta.bookDir, "修炼能力与资源体系.md"), topics.settings ? renderTopicCapabilityResource(output.title, topics.settings) : renderCapabilityResourceFile(output)),
    writeText(path.join(meta.bookDir, "设定集-人物关系与身份体系.md"), topics.characters ? renderTopicIdentityStoryBible(output.title, topics.characters) : renderIdentityStoryBible(output)),
    writeText(path.join(meta.bookDir, "设定集-世界规则与禁忌.md"), topics.settings ? renderTopicSettingFile(output.title, "世界规则与禁忌", topics.settings.worldRules) : renderStoryBibleFile(output, "世界规则与禁忌", (item) => matchesAny(item, ["世界", "规则", "禁忌", "代价", "制度", "污染", "旧日", "星空", "神权", "宗教", "历史", "终局", "政治规则"]))),
    writeText(path.join(meta.bookDir, "设定集-设定时间线.md"), renderTimelineStoryBible(output)),
    writeText(path.join(meta.bookDir, "设定集-写作复用边界.md"), renderReuseBoundary(output)),
    writeText(path.join(meta.bookDir, "深拆中间数据.json"), renderRefinedDeepData(output, topicData))
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

async function readOptional(file: string): Promise<string> {
  try {
    return await readText(file);
  } catch {
    return "";
  }
}

async function readOptionalRecall(file: string): Promise<CharacterRecallReport | undefined> {
  try {
    return parseCharacterRecallReport(await readText(file));
  } catch {
    return undefined;
  }
}

function trimForInput(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, Math.floor(maxLength * 0.65))}\n\n...[中间内容省略，返工时请读取原文件继续核对]...\n\n${content.slice(-Math.floor(maxLength * 0.35))}`;
}

function renderRefineTask(title: string, bookDir: string, sourceFile: string | undefined, audit: string, characterRecall?: CharacterRecallReport): string {
  return `# 拆书返工任务：《${title}》

请基于原文和现有拆书产物，重写高光、设定、机制三类资产。目标不是润色旧 Markdown，而是补出后续自动写作可用的深度内容。

## 输入

- 持久拆书目录：${bookDir}
- 本任务输入目录：\`input/\`
- 原文副本：${sourceFile ?? "未找到，请使用持久拆书目录 source/ 下的原文"}
- 角色召回候选：${characterRecall ? "`input/角色召回候选.json`" : "未生成"}

## 当前审计摘要

${audit ? audit.slice(0, 12000) : "未找到审计报告；请先运行 deconstruct audit。"}

## 输出

请只编辑 \`output/refine-insights.json\`，必须符合其中模板。要求：

- highlights 至少 10 条；长篇超过 1200 章至少 16 条。
- events 至少 24 条；按故事真实进展切分，优先 5-12 章一个事件，不能只复用 highlights。
- timeline 必须使用小说内时间，如“熹平六年”“光和七年/岁在甲子”“中平元年”，不能把章节号当时间。
- locations 至少 12 条；历史题材要覆盖朝代地理、州郡、边塞、主要势力分布，架空题材要覆盖全书主要地图层级。
- settingInsights 至少 12 条，覆盖世界规则、能力体系、资源体系、组织势力、地图层级、人物身份、禁忌代价、时间线。
- mechanisms 至少 8 条，必须能说明“为什么好看”和“如何改写到新书”。
- characterNetwork.profiles 至少 30 个主要/高频功能人物；每个 profile 要写 importance（主角/核心人物/重要人物/次要人物），非人物的规则、组织、地点不得混入 profiles。
- characterNetwork.relations 至少 40 条语义关系边，必须写清敌对/合作/师徒/上下级/亲属情感/交易利用/组织身份等关系，不允许只写“有关联”。
- 必须先读取 \`input/角色召回候选.json\`。其中 mustReview=true 且原文高频命中的人物，必须进入 characterNetwork.profiles 和必要关系边；如果判断不是剧情人物，必须在 characterNetwork.misreads 写清排除理由。
- 历史/三国类作品尤其要核对别名、字、误写和同姓不同人，不允许因为已有 30 个以上人物就跳过赵云、张飞、周瑜这类高辨识度角色。
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
      events: [
        {
          title: "事件名",
          timeLabel: "小说内时间；如 熹平六年/光和七年/中平元年；架空作品写纪元或卷内年份",
          range: "第 1-10 章",
          summary: "事件过程摘要",
          setup: "前因",
          conflict: "冲突升级",
          turn: "关键转折",
          result: "当场结果",
          impact: "后续影响",
          involved: "涉及人物/势力",
          evidence: "章节证据摘要"
        }
      ],
      timeline: [
        {
          timeLabel: "小说内时间；不能写章节号",
          range: "第 1-10 章",
          event: "这一年/这一时段发生的关键事",
          involved: "涉及人物/势力",
          politicalContext: "当时世界局势/朝代背景/地图势力状态",
          consequence: "后续影响",
          evidence: "章节证据摘要"
        }
      ],
      locations: [
        {
          name: "地点或区域名",
          category: "州郡/边塞/都城/宗门/秘境/星域/城市/国家",
          region: "上级区域或地图层级",
          range: "出现章节范围",
          controller: "控制者或主要势力",
          function: "剧情功能",
          connectedLocations: "与哪些地点相连，路线/边界/通道是什么",
          powerDistribution: "该空间内的势力分布",
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
            importance: "主角/核心人物/重要人物/次要人物",
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
    events: ensureArray(parsed.events).map(normalizeStoryEvent),
    timeline: ensureArray(parsed.timeline).map(normalizeTimelineEntry),
    locations: ensureArray(parsed.locations).map(normalizeLocationInsight),
    settingInsights: ensureArray(parsed.settingInsights).map(normalizeSetting),
    mechanisms: ensureArray(parsed.mechanisms).map(normalizeMechanism),
    characterNetwork: normalizeCharacterNetwork(parsed.characterNetwork),
    characterRecall: normalizeCharacterRecallReport((parsed as { characterRecall?: unknown }).characterRecall)
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

function normalizeStoryEvent(item: StoryEvent): StoryEvent {
  return {
    title: requireText(item.title, "event.title"),
    timeLabel: item.timeLabel?.trim(),
    range: requireText(item.range, "event.range"),
    summary: requireText(item.summary, "event.summary"),
    setup: requireText(item.setup, "event.setup"),
    conflict: requireText(item.conflict, "event.conflict"),
    turn: requireText(item.turn, "event.turn"),
    result: requireText(item.result, "event.result"),
    impact: requireText(item.impact, "event.impact"),
    involved: requireText(item.involved, "event.involved"),
    evidence: requireText(item.evidence, "event.evidence")
  };
}

function normalizeTimelineEntry(item: TimelineEntry): TimelineEntry {
  return {
    timeLabel: requireText(item.timeLabel, "timeline.timeLabel"),
    range: requireText(item.range, "timeline.range"),
    event: requireText(item.event, "timeline.event"),
    involved: requireText(item.involved, "timeline.involved"),
    politicalContext: requireText(item.politicalContext, "timeline.politicalContext"),
    consequence: requireText(item.consequence, "timeline.consequence"),
    evidence: requireText(item.evidence, "timeline.evidence")
  };
}

function normalizeLocationInsight(item: LocationInsight): LocationInsight {
  return {
    name: requireText(item.name, "location.name"),
    category: requireText(item.category, "location.category"),
    region: requireText(item.region, "location.region"),
    range: requireText(item.range, "location.range"),
    controller: requireText(item.controller, "location.controller"),
    function: requireText(item.function, "location.function"),
    connectedLocations: requireText(item.connectedLocations, "location.connectedLocations"),
    powerDistribution: requireText(item.powerDistribution, "location.powerDistribution"),
    evidence: requireText(item.evidence, "location.evidence")
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
    evidence: requireText(item.evidence ?? `${item.name} 在人物关系网中承担“${relationshipFunction ?? item.role}”功能。`, "character.profile.evidence"),
    importance: item.importance?.trim()
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
  const stages = buildOverviewStages(output);
  return `# 剧情阶段总览：《${output.title}》

## 生成口径

本文件只保留全书粗粒度剧情阶段，目标是帮助写作系统快速理解主线推进。细颗粒事件因果见 \`关键事件链.md\`，设定年份顺序见 \`设定集-设定时间线.md\`。

## 全书阶段

${stages.map((stage, index) => `### ${index + 1}. ${stage.range}：${stage.title}

**阶段主线**：${stage.summary}

**核心矛盾**：${stage.conflict}

**阶段兑现**：${stage.payoff}

**后续影响**：${stage.impact}

**关键事件入口**：${stage.events.join("；")}
`).join("\n")}
`;
}

function renderEventChain(output: RefineOutput): string {
  const events = storyEvents(output);
  return `# 关键事件链：《${output.title}》

## 生成口径

本文件记录比剧情总览更细的事件因果链。事件切分优先按故事进展，而不是机械章节段；每条都必须能回答：前因是什么、冲突如何升级、关键转折在哪里、当场结果和后续影响是什么。

## 事件链

${events.map((item, index) => `### ${index + 1}. ${item.timeLabel ? `${item.timeLabel}，` : ""}${item.range}：${item.title}

**前因**：${item.setup}

**冲突升级**：${item.conflict}

**事件过程**：${item.summary}

**关键转折**：${item.turn}

**当场结果**：${item.result}

**后续影响**：${item.impact}

**涉及人物/势力**：${item.involved}

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

${renderCharacterRecallSection(output)}

## 当前自动图明显误判或需删除项

${output.characterNetwork.misreads.length > 0 ? output.characterNetwork.misreads.map((item) => `- ${item}`).join("\n") : "- 暂无明确误判。"}
`;
}

function renderCharacterRecallSection(output: RefineOutput): string {
  const recall = output.characterRecall;
  if (!recall || recall.candidates.length === 0) {
    return "";
  }
  const profileText = output.characterNetwork.profiles.map((item) => item.name).join("\n");
  const required = recall.candidates.filter((item) => item.mustReview).slice(0, 60);
  if (required.length === 0) {
    return `## 角色召回校验

- 未发现必须核对的高频高价值角色。`;
  }
  return `## 角色召回校验

${required.map((item) => {
    const included = [item.name, ...item.aliases.filter((alias) => alias.length >= 3)].some((term) => profileText.includes(term));
    const aliasSummary = Object.entries(item.aliasMentions)
      .filter(([, count]) => count > 0)
      .map(([term, count]) => `${term} ${count} 次`)
      .join("，");
    return `- **${item.name}**：${included ? "已纳入人物画像" : "未纳入人物画像，需返工核对"}。${aliasSummary || `总命中 ${item.mentions} 次`}。召回原因：${item.reason}`;
  }).join("\n")}`;
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
  const people = output.characterNetwork.profiles.filter(isLikelyCharacterProfile);
  const tiers = tierCharacters(people, output);
  return `# 设定集-人物关系与身份体系：《${output.title}》

## 文件用途

本文件只收人物，不收规则、组织、地点或抽象设定。它用于区分主角、核心人物、重要人物和次要人物，并约束章节生成时的人物调用。

## 主角与核心人物

${tiers.core.map((item, index) => renderCoreCharacterEntry(item, output, index + 1)).join("\n")}

## 重要人物

${tiers.important.map((item, index) => renderImportantCharacterEntry(item, output, index + 1)).join("\n")}

## 次要功能人物

${tiers.minor.length > 0 ? tiers.minor.map((item) => `- **${item.name}**（${item.role}）：${item.relationshipFunction} 章节范围：${item.range}。证据：${item.evidence}`).join("\n") : "- 暂无。"}
`;
}

function renderTimelineStoryBible(output: RefineOutput): string {
  const timeline = timelineEntries(output);
  return `# 设定集-设定时间线：《${output.title}》

## 文件用途

本文件记录小说世界内部的时间线，优先使用原文年号、纪元、朝代年份或卷内年份；章节号只作为证据定位，不能替代时间。

## 时间线条目

${timeline.map((item, index) => `## ${index + 1}. ${item.timeLabel}：${item.event}

**小说内时间**：${item.timeLabel}

**世界局势**：${item.politicalContext}

**事件内容**：${item.event}

**涉及人物/势力**：${item.involved}

**后续影响**：${item.consequence}

**章节定位**：${item.range}

**证据摘要**：${item.evidence}
`).join("\n")}
`;
}

function renderMapStoryBible(output: RefineOutput): string {
  const locations = output.locations.filter(isUsefulLocation);
  const entries = locations.length > 0 ? locations : fallbackLocations(output);
  return `# 设定集-地图与空间层级：《${output.title}》

## 文件用途

本文件按全书地图、空间层级和势力分布整理地点。历史题材要兼顾真实朝代地理和本书改写后的势力控制；架空题材要依赖正文总结主要地图层级、通道和势力边界。

## 地图总览

${renderMapOverview(output, entries)}

## 地点与势力分布

${entries.map((item, index) => renderLocationEntry(item, index + 1)).join("\n")}
`;
}

function buildOverviewStages(output: RefineOutput): Array<{ range: string; title: string; summary: string; conflict: string; payoff: string; impact: string; events: string[] }> {
  const source = output.highlights;
  if (source.length <= 7) {
    return source.map((item) => ({
      range: item.range,
      title: item.title,
      summary: item.plot,
      conflict: item.conflict,
      payoff: item.payoff,
      impact: item.impact,
      events: [item.title]
    }));
  }
  const targetCount = Math.min(7, Math.max(4, Math.ceil(source.length / 3)));
  const groupSize = Math.ceil(source.length / targetCount);
  const stages: Array<{ range: string; title: string; summary: string; conflict: string; payoff: string; impact: string; events: string[] }> = [];
  for (let start = 0; start < source.length; start += groupSize) {
    const group = source.slice(start, start + groupSize);
    const first = group[0];
    const last = group[group.length - 1];
    stages.push({
      range: mergeRanges(first.range, last.range),
      title: first === last ? first.title : `${first.title} -> ${last.title}`,
      summary: `${first.plot} ${last !== first ? last.plot : ""}`.trim(),
      conflict: group.map((item) => item.conflict).join(" / "),
      payoff: group.map((item) => item.payoff).join(" / "),
      impact: last.impact,
      events: group.map((item) => `${item.range} ${item.title}`)
    });
  }
  return stages;
}

function storyEvents(output: RefineOutput): StoryEvent[] {
  if (output.events.length > 0) {
    return output.events;
  }
  return output.highlights.map((item) => ({
    title: item.title,
    range: item.range,
    timeLabel: extractInStoryTime(`${item.title} ${item.setup} ${item.plot} ${item.evidence}`),
    summary: item.plot,
    setup: item.setup,
    conflict: item.conflict,
    turn: item.payoff,
    result: item.payoff,
    impact: item.impact,
    involved: inferInvolvedFromText(`${item.setup} ${item.conflict} ${item.impact}`),
    evidence: item.evidence
  }));
}

function timelineEntries(output: RefineOutput): TimelineEntry[] {
  if (output.timeline.length > 0) {
    return output.timeline;
  }
  return storyEvents(output).map((item) => ({
    timeLabel: item.timeLabel && !looksLikeChapterRange(item.timeLabel) ? item.timeLabel : "小说内时间未标明",
    range: item.range,
    event: item.title,
    involved: item.involved,
    politicalContext: item.setup,
    consequence: item.impact,
    evidence: item.evidence
  }));
}

function renderCoreCharacterEntry(item: CharacterProfile, output: RefineOutput, index: number): string {
  const relations = relationsFor(item.name, output).slice(0, 6);
  return `### ${index}. ${item.name}

**重要度**：${characterTierLabel(item, output)}

**功能定位**：${item.role}

**身份弧线**：${item.identityArc}

**关系网功能**：${item.relationshipFunction}

**关键关系**：
${relations.length > 0 ? relations.map((relation) => `- ${relation.source} -> ${relation.target}（${relation.type}）：${relation.relationship}；变化：${relation.change}`).join("\n") : "- 暂无结构化关系边。"}

**章节范围与证据**：${item.range}。${item.evidence}

**调用注意**：写到 ${item.name} 时，必须同时检查其身份阶段、利益牵引、与主角关系的变化，以及其是否会改变当前事件的权力结构。
`;
}

function renderImportantCharacterEntry(item: CharacterProfile, output: RefineOutput, index: number): string {
  const relations = relationsFor(item.name, output).slice(0, 3);
  return `### ${index}. ${item.name}

- **重要度**：${characterTierLabel(item, output)}
- **功能定位**：${item.role}
- **身份变化**：${item.identityArc}
- **关系功能**：${item.relationshipFunction}
- **关键关系**：${relations.length > 0 ? relations.map((relation) => `${relation.source}->${relation.target}（${relation.type}）`).join("；") : "暂无结构化关系边"}
- **章节范围与证据**：${item.range}。${item.evidence}
`;
}

function tierCharacters(people: CharacterProfile[], output: RefineOutput): { core: CharacterProfile[]; important: CharacterProfile[]; minor: CharacterProfile[] } {
  const sorted = [...people].sort((a, b) => characterScore(b, output) - characterScore(a, output));
  const core = sorted.filter((item, index) => characterScore(item, output) >= 80 || index < 10).slice(0, 14);
  const coreNames = new Set(core.map((item) => item.name));
  const important = sorted.filter((item) => !coreNames.has(item.name) && characterScore(item, output) >= 35).slice(0, 24);
  const importantNames = new Set(important.map((item) => item.name));
  const minor = sorted.filter((item) => !coreNames.has(item.name) && !importantNames.has(item.name));
  return { core, important, minor };
}

function characterScore(item: CharacterProfile, output: RefineOutput): number {
  const relationCount = relationsFor(item.name, output).length;
  const roleText = `${item.name} ${item.role} ${item.importance ?? ""}`;
  let score = relationCount * 4;
  if (item.name === output.characterNetwork.protagonist || item.importance === "主角" || item.role.includes("主角")) score += 1000;
  if (roleText.includes("核心")) score += 70;
  if (roleText.includes("主要对手") || roleText.includes("反派")) score += 60;
  if (roleText.includes("导师") || roleText.includes("上位者") || roleText.includes("亲属")) score += 45;
  if (roleText.includes("重要")) score += 35;
  if (roleText.includes("次要")) score -= 20;
  return score;
}

function characterTierLabel(item: CharacterProfile, output: RefineOutput): string {
  const score = characterScore(item, output);
  if (item.name === output.characterNetwork.protagonist || item.importance === "主角" || item.role.includes("主角")) return "主角";
  if (score >= 80) return "核心人物";
  if (score >= 35) return "重要人物";
  return "次要人物";
}

function relationsFor(name: string, output: RefineOutput): CharacterRelation[] {
  return output.characterNetwork.relations.filter((item) => item.source === name || item.target === name);
}

function isLikelyCharacterProfile(item: CharacterProfile): boolean {
  const name = item.name.trim();
  const noise = ["规则", "体系", "网络", "制度", "资源", "政治", "贸易", "空间", "地图", "时间线", "节点", "义舍", "天命", "谶纬", "婚姻", "旗号", "组织结构"];
  return name.length >= 2 && name.length <= 12 && !noise.some((term) => name.includes(term));
}

function isUsefulLocation(item: LocationInsight): boolean {
  const name = item.name.trim();
  return name.length >= 2 && name.length <= 20 && !["规则", "体系", "机制"].some((term) => name.includes(term));
}

function fallbackLocations(output: RefineOutput): LocationInsight[] {
  const settingLocations = output.settingInsights
    .filter((item) => matchesAny(item, ["地图", "空间", "州", "郡", "县", "都城", "边塞", "宗门", "秘境", "星域", "城市", "国家", "战场", "政治格局"]))
    .map<LocationInsight>((item) => ({
      name: item.name,
      category: item.category,
      region: "从设定条目推断",
      range: item.range,
      controller: item.interfaces,
      function: item.reuseValue,
      connectedLocations: item.rule,
      powerDistribution: item.interfaces,
      evidence: item.evidence
    }));
  if (isHanThreeKingdomsBook(output)) {
    return [...settingLocations, ...hanThreeKingdomsFallbackLocations(output)].slice(0, 24);
  }
  return settingLocations.length > 0 ? settingLocations : output.settingInsights.slice(0, 8).map((item) => ({
    name: item.name,
    category: item.category,
    region: "待子 Agent 补充地图层级",
    range: item.range,
    controller: item.interfaces,
    function: item.reuseValue,
    connectedLocations: item.rule,
    powerDistribution: item.interfaces,
    evidence: item.evidence
  }));
}

function hanThreeKingdomsFallbackLocations(output: RefineOutput): LocationInsight[] {
  const evidence = "汉末/三国历史题材地理补全；后续子 Agent 应回到正文补具体章节证据。";
  return [
    ["洛阳与司隶", "都城/中枢", "东汉司隶", "皇帝、宦官、士人、尚书台", "朝廷权力、党锢、征辟和诏令的中心"],
    ["幽州", "州域/北方边镇", "河北东北与辽西辽东", "公孙氏、边郡汉军、乌桓鲜卑接口", "主角早期立身、边军资源和北防根基"],
    ["辽西、右北平、卢龙塞", "边塞/门户", "幽州北部", "公孙氏、辽西太守、右北平军政系统", "连接塞外胡部与河北平原的军事门户"],
    ["冀州与赵国", "州郡/治理试验场", "河北腹地", "地方官、豪强、太平道、袁绍势力接口", "治理、黄巾、河北争霸的核心地带"],
    ["并州、雁门与塞外", "边州/北疆", "黄河以北与草原南缘", "汉军、鲜卑、乌桓、边将", "骑战、胡汉贸易和边疆威望来源"],
    ["关中与凉州", "西北军政区", "长安、三辅、凉州军", "董卓、西凉兵、朝廷军权", "董卓线和西北军权问题的空间根源"],
    ["兖州、豫州、徐州", "中原州域", "黄河以南、淮北一带", "曹操、刘备、地方州牧", "旧友转敌、中原对抗和后期统一战线"],
    ["青州、扬州、荆州", "东南与南方外延", "黄河下游至江汉江东", "地方豪强、州牧、士族集团", "天下格局外延和潜在未取之地"],
    ["鲜卑草原与弹汗山", "塞外权力中心", "长城以北", "檀石槐体系、鲜卑诸部", "北方威胁、火烧弹汗和白马威名的来源"]
  ].map(([name, category, region, controller, fn]) => ({
    name,
    category,
    region,
    range: "全书多阶段",
    controller,
    function: fn,
    connectedLocations: "通过边塞、州郡道路、河道、商路或军事行军线与中原相连。",
    powerDistribution: controller,
    evidence
  }));
}

function renderMapOverview(output: RefineOutput, entries: LocationInsight[]): string {
  if (isHanThreeKingdomsBook(output)) {
    return "本书属于汉末/三国历史改写题材，地图应先按东汉州郡和北方边塞理解，再叠加本书改写后的公孙珣势力扩张、黄巾动乱、董卓入洛、关东群雄、河北袁绍和中原曹操等势力变化。";
  }
  return `本书地图共整理 ${entries.length} 个主要空间节点。阅读时先看上级区域和控制者，再看地点之间的通道、边界和势力分布。`;
}

function renderLocationEntry(item: LocationInsight, index: number): string {
  return `### ${index}. ${item.name}

**类型/层级**：${item.category}

**所属区域**：${item.region}

**控制者/主要势力**：${item.controller}

**剧情功能**：${item.function}

**连接关系**：${item.connectedLocations}

**势力分布**：${item.powerDistribution}

**章节范围与证据**：${item.range}。${item.evidence}
`;
}

function mergeRanges(first: string, last: string): string {
  return first === last ? first : `${first} 至 ${last}`;
}

function extractInStoryTime(text: string): string | undefined {
  const match = text.match(/(?:熹平|光和|中平|初平|建安|兴平|永汉|章武|黄初|太康)[一二三四五六七八九十0-9元]+年|岁在[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|公元\s*\d+\s*年|[一二三四五六七八九十0-9元]+年/);
  return match?.[0];
}

function looksLikeChapterRange(value: string): boolean {
  return /第\s*\d+|章/.test(value);
}

function inferInvolvedFromText(text: string): string {
  const names = [...new Set(text.match(/[\p{Script=Han}A-Za-z·]{2,6}/gu) ?? [])].filter((item) => !["前置铺垫", "冲突接口", "后续影响", "复用边界", "章节证据"].includes(item));
  return names.slice(0, 8).join("、") || "需子 Agent 补充涉及人物/势力";
}

function isHanThreeKingdomsBook(output: RefineOutput): boolean {
  const text = [
    output.title,
    ...output.highlights.map((item) => `${item.title} ${item.plot}`),
    ...output.settingInsights.map((item) => `${item.name} ${item.definition} ${item.interfaces}`)
  ].join("\n");
  const score = ["汉末", "三国", "黄巾", "董卓", "曹操", "袁绍", "刘备", "洛阳", "幽州", "冀州", "鲜卑", "公孙"].reduce((sum, keyword) => sum + occurrences(text, keyword), 0);
  return score >= 5;
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

function renderRefinedDeepData(output: RefineOutput, topicData?: Record<string, unknown>): string {
  return JSON.stringify(
    {
      refineAgentRun: true,
      title: output.title,
      agentChunkCount: 1,
      chunkCount: 1,
      events: storyEvents(output).map((item) => ({
        name: item.title,
        range: item.range,
        timeLabel: item.timeLabel,
        summary: item.summary,
        impact: item.impact,
        evidence: item.evidence
      })),
      highlights: output.highlights,
      storyEvents: storyEvents(output),
      timeline: timelineEntries(output),
      locations: output.locations,
      settingInsights: output.settingInsights,
      mechanisms: output.mechanisms,
      characterNetwork: output.characterNetwork,
      characterRecall: output.characterRecall,
      topicData
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
