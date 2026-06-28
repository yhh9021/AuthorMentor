import path from "node:path";
import { readText, writeText } from "../../core/workspace.js";
import type { CharacterRecallReport } from "./character-recall.js";
import { buildHighlightCandidateRecall, renderHighlightCandidateRecall } from "./highlight-candidates.js";

export type TopicOutputs = {
  plot?: PlotTopicOutput;
  characters?: CharacterTopicOutput;
  factions?: FactionTopicOutput;
  map?: MapTopicOutput;
  settings?: SettingTopicOutput;
  highlightCandidates?: HighlightCandidateTopicOutput;
  highlights?: HighlightTopicOutput;
};

type PlotTopicOutput = {
  overviewStages: Array<{
    title: string;
    range: string;
    summary: string;
    coreConflict: string;
    payoff: string;
    nextImpact: string;
    evidence: string;
  }>;
  events: Array<{
    title: string;
    timeLabel?: string;
    range: string;
    cause: string;
    conflict: string;
    process: string;
    turn: string;
    result: string;
    impact: string;
    involved: string;
    evidence: string;
  }>;
};

type CharacterTopicOutput = {
  protagonist: string;
  profiles: Array<{
    name: string;
    importance: string;
    role: string;
    range: string;
    identityArc: string;
    relationshipFunction: string;
    keyConflicts: string;
    evidence: string;
  }>;
  relations: Array<{
    source: string;
    target: string;
    type: string;
    range: string;
    relationship: string;
    conflictOrInterest: string;
    change: string;
    plotFunction: string;
    evidence: string;
  }>;
  misreads: string[];
};

type FactionTopicOutput = {
  factions: Array<{
    name: string;
    type: string;
    coreMembers: string;
    territory: string;
    controlledRegions: string;
    organization: string;
    resources: string;
    allies: string;
    enemies: string;
    stageChanges: string;
    keyEvents: string;
    relationshipToProtagonist: string;
    evidence: string;
  }>;
};

type MapTopicOutput = {
  locations: Array<{
    name: string;
    category: string;
    region: string;
    controller: string;
    function: string;
    connectedLocations: string;
    powerDistribution: string;
    range: string;
    evidence: string;
  }>;
};

type SettingTopicEntry = {
  name: string;
  category: string;
  definition: string;
  rule: string;
  cost: string;
  interfaces: string;
  evolution: string;
  reuseValue: string;
  reuseBoundary: string;
  range: string;
  evidence: string;
};

type SettingTopicOutput = {
  coreSettings: SettingTopicEntry[];
  capabilitySystem: SettingTopicEntry[];
  resourceSystem: SettingTopicEntry[];
  worldRules: SettingTopicEntry[];
};

type HighlightTopicOutput = {
  highlights: Array<{
    title: string;
    category?: string;
    range: string;
    plot: string;
    setup: string;
    conflict: string;
    payoff: string;
    impact: string;
    reusableMechanism: string;
    reuseBoundary: string;
    evidence: string;
  }>;
  mechanisms: Array<{
    name: string;
    range: string;
    principle: string;
    implementation: string;
    appeal: string;
    rewriteMethod: string;
    failureRisk: string;
    evidence: string;
  }>;
  narrativeDevices: Array<{
    name: string;
    type: string;
    range: string;
    form: string;
    function: string;
    whyInteresting: string;
    reusableMethod: string;
    boundary: string;
    evidence: string;
  }>;
  recurringJokes: Array<{
    name: string;
    range: string;
    pattern: string;
    comedicFunction: string;
    readerPayoff: string;
    reusableMethod: string;
    boundary: string;
    evidence: string;
  }>;
  candidateCoverage: Array<{
    candidate: string;
    type: string;
    range: string;
    decision: string;
    reason: string;
    finalLocation: string;
  }>;
  externalSignalsUsed: Array<ExternalDiscussionSignal>;
};

type CandidateItem = {
  name: string;
  type: string;
  range: string;
  reason: string;
  evidence: string;
  sourceSignals: string;
  confidence: string;
};

type ExternalDiscussionSignal = {
  platform: string;
  sourceType: string;
  title: string;
  url: string;
  summary: string;
  engagement: string;
  credibility: string;
  relevance: string;
  candidateHint: string;
};

type HighlightCandidateTopicOutput = {
  sourceAttempts: Array<{
    source: string;
    query: string;
    resultSummary: string;
    usable: string;
    limitation: string;
  }>;
  eventHighlights: CandidateItem[];
  battleCandidates: CandidateItem[];
  narrativeDevices: CandidateItem[];
  recurringJokes: CandidateItem[];
  memoryAnchors: CandidateItem[];
  externalSignals: ExternalDiscussionSignal[];
  mustReviewMissedCandidates: CandidateItem[];
};

type TopicDefinition = {
  file: string;
  title: string;
  output: string;
  task: string;
  template: unknown;
};

export async function writeTopicRefineScaffold(params: {
  runDir: string;
  title: string;
  bookDir: string;
  sourceCopy?: string;
  characterRecall?: CharacterRecallReport;
}): Promise<void> {
  const taskDir = path.join(params.runDir, "input", "topic-tasks");
  const outputDir = path.join(params.runDir, "output", "topics");
  const definitions = topicDefinitions(params);
  const highlightRecall = await buildHighlightCandidateRecall({ title: params.title, sourceFile: params.sourceCopy });
  await Promise.all(
    [
      ...definitions.flatMap((definition) => [
        writeText(path.join(taskDir, definition.file), renderTopicTask(params, definition)),
        writeText(path.join(outputDir, definition.output), JSON.stringify(definition.template, null, 2))
      ]),
      writeText(path.join(params.runDir, "input", "亮点候选召回.json"), JSON.stringify(highlightRecall, null, 2)),
      writeText(path.join(params.runDir, "input", "亮点候选召回.md"), renderHighlightCandidateRecall(highlightRecall))
    ]
  );
  await writeText(
    path.join(outputDir, "README.md"),
    `# 专题子 Agent 输出目录

每个专题子 Agent 只负责一个 JSON 文件。脚本只校验 schema 和渲染 Markdown，不负责补写内容判断。

${definitions.map((item) => `- ${item.title}：${item.output}`).join("\n")}
`
  );
}

export async function readTopicOutputs(runDir: string): Promise<TopicOutputs> {
  const outputDir = path.join(runDir, "output", "topics");
  return {
    plot: normalizePlotTopic(await readOptionalJson(path.join(outputDir, "plot.json"))),
    characters: normalizeCharacterTopic(await readOptionalJson(path.join(outputDir, "characters.json"))),
    factions: normalizeFactionTopic(await readOptionalJson(path.join(outputDir, "factions.json"))),
    map: normalizeMapTopic(await readOptionalJson(path.join(outputDir, "map.json"))),
    settings: normalizeSettingTopic(await readOptionalJson(path.join(outputDir, "settings.json"))),
    highlightCandidates: normalizeHighlightCandidateTopic(await readOptionalJson(path.join(outputDir, "highlight-candidates.json"))),
    highlights: normalizeHighlightTopic(await readOptionalJson(path.join(outputDir, "highlights.json")))
  };
}

export function hasAnyTopicOutput(topics: TopicOutputs): boolean {
  return Boolean(topics.plot || topics.characters || topics.factions || topics.map || topics.settings || topics.highlightCandidates || topics.highlights);
}

export function renderTopicStageOverview(title: string, output: PlotTopicOutput): string {
  return `# 剧情阶段总览：《${title}》

## 生成口径

本文件由剧情结构专题子 Agent 独立生成，只回答全书主线如何分阶段推进。细颗粒事件因果见 \`关键事件链.md\`，不复述设定库、人物图或高光机制。

## 全书阶段

${output.overviewStages.map((item, index) => `### ${index + 1}. ${item.range}：${item.title}

**阶段主线**：${item.summary}

**核心矛盾**：${item.coreConflict}

**阶段兑现**：${item.payoff}

**后续影响**：${item.nextImpact}

**证据摘要**：${item.evidence}
`).join("\n")}
`;
}

export function renderTopicEventChain(title: string, output: PlotTopicOutput): string {
  return `# 关键事件链：《${title}》

## 生成口径

本文件由剧情结构专题子 Agent 独立生成，按故事因果链切分事件。它比剧情阶段总览更细，只服务章节续写时的因果、伏笔和进展校验。

## 事件链

${output.events.map((item, index) => `### ${index + 1}. ${item.timeLabel ? `${item.timeLabel}，` : ""}${item.range}：${item.title}

**前因**：${item.cause}

**冲突升级**：${item.conflict}

**事件过程**：${item.process}

**关键转折**：${item.turn}

**当场结果**：${item.result}

**后续影响**：${item.impact}

**涉及人物/势力**：${item.involved}

**证据摘要**：${item.evidence}
`).join("\n")}
`;
}

export function renderTopicCharacterNetwork(title: string, output: CharacterTopicOutput, characterRecall?: CharacterRecallReport): string {
  return `# 人物与关系图：《${title}》

## 生成口径

本文件来自人物关系专题子 Agent 精读校正，只处理人物、身份变化和语义关系边。地点、规则、资源和势力范围不进入人物画像。

## 主角

${output.protagonist}

## 主要人物画像

${output.profiles.map((item, index) => `### ${index + 1}. ${item.name}

- **重要度**：${item.importance}
- **功能定位**：${item.role}
- **章节范围**：${item.range}
- **身份变化**：${item.identityArc}
- **关系网功能**：${item.relationshipFunction}
- **关键矛盾/牵引**：${item.keyConflicts}
- **证据摘要**：${item.evidence}
`).join("\n")}

## 语义关系边

${output.relations.map((item, index) => `### ${index + 1}. ${item.source} -> ${item.target}

- **关系类型**：${item.type}
- **章节范围**：${item.range}
- **具体关系**：${item.relationship}
- **矛盾/利益/情感牵引**：${item.conflictOrInterest}
- **阶段变化**：${item.change}
- **剧情功能**：${item.plotFunction}
- **证据摘要**：${item.evidence}
`).join("\n")}

${renderRecallCheck(output, characterRecall)}

## 当前自动图明显误判或需删除项

${output.misreads.length > 0 ? output.misreads.map((item) => `- ${item}`).join("\n") : "- 暂无明确误判。"}
`;
}

export function renderTopicIdentityStoryBible(title: string, output: CharacterTopicOutput): string {
  const core = output.profiles.filter((item) => /主角|核心/.test(item.importance)).slice(0, 16);
  const important = output.profiles.filter((item) => /重要/.test(item.importance)).slice(0, 28);
  const minor = output.profiles.filter((item) => !core.includes(item) && !important.includes(item));
  return `# 设定集-人物关系与身份体系：《${title}》

## 文件用途

本文件由人物关系专题子 Agent 独立生成，只收人物身份和调用约束，不收地点、组织、制度或抽象规则。

## 主角与核心人物

${core.map((item, index) => renderCharacterEntry(index + 1, item, output, true)).join("\n")}

## 重要人物

${important.map((item, index) => renderCharacterEntry(index + 1, item, output, false)).join("\n")}

## 次要功能人物

${minor.length > 0 ? minor.map((item) => `- **${item.name}**（${item.role}）：${item.relationshipFunction} 章节范围：${item.range}。证据：${item.evidence}`).join("\n") : "- 暂无。"}
`;
}

export function renderTopicFactions(title: string, output: FactionTopicOutput): string {
  return `# 设定集-势力与组织：《${title}》

## 文件用途

本文件由势力地图专题子 Agent 独立生成，只记录阵营、集团、政权、军政组织和势力范围。制度规则、资源规则、婚姻规则、官职规则不进入本文件。

## 势力范围图谱

${output.factions.map((item, index) => `### ${index + 1}. ${item.name}

**类型**：${item.type}

**核心人物**：${item.coreMembers}

**势力范围**：${item.territory}

**控制区域**：${item.controlledRegions}

**组织结构**：${item.organization}

**资源与兵力**：${item.resources}

**盟友/附庸**：${item.allies}

**敌对/竞争势力**：${item.enemies}

**阶段变化**：${item.stageChanges}

**关键事件**：${item.keyEvents}

**与主角关系**：${item.relationshipToProtagonist}

**章节范围与证据**：${item.evidence}
`).join("\n")}
`;
}

export function renderTopicMap(title: string, output: MapTopicOutput): string {
  return `# 设定集-地图与空间层级：《${title}》

## 文件用途

本文件由地图空间专题子 Agent 独立生成，只整理地点、区域、空间层级、通道和势力分布。阵营组织的内部结构见 \`设定集-势力与组织.md\`。

## 地点与势力分布

${output.locations.map((item, index) => `### ${index + 1}. ${item.name}

**类型/层级**：${item.category}

**所属区域**：${item.region}

**控制者/主要势力**：${item.controller}

**剧情功能**：${item.function}

**连接关系**：${item.connectedLocations}

**势力分布**：${item.powerDistribution}

**章节范围与证据**：${item.range}。${item.evidence}
`).join("\n")}
`;
}

export function renderTopicDeepSettings(title: string, output: SettingTopicOutput): string {
  const entries = [...output.coreSettings, ...output.capabilitySystem, ...output.resourceSystem, ...output.worldRules];
  return `# 深度设定沉淀：《${title}》

## 生成口径

本文件由设定体系专题子 Agent 独立生成，只沉淀世界规则、能力资源、禁忌代价和可复用设定机制。人物关系、势力范围、地图空间和剧情高光不在此重复展开。

## 设定专题索引

${entries.map((item, index) => `### ${index + 1}. ${item.name}

**设定类型**：${item.category}

**核心含义**：${item.definition}

**写作功能**：${item.reuseValue}

**使用边界**：${item.reuseBoundary}

**主要接口**：${item.interfaces}

**证据定位**：${item.range}。${item.evidence}
`).join("\n")}
`;
}

export function renderTopicSettingFile(title: string, fileTitle: string, entries: SettingTopicEntry[]): string {
  return `# 设定集-${fileTitle}：《${title}》

## 文件用途

本文件由设定体系专题子 Agent 独立生成。写章节前用它校验规则、代价、资源接口和禁忌边界。

## 设定条目

${entries.map((item, index) => renderStoryBibleSettingEntry(index + 1, item)).join("\n")}
`;
}

export function renderTopicCapabilityResource(title: string, output: SettingTopicOutput): string {
  const entries = [...output.capabilitySystem, ...output.resourceSystem];
  return `# 修炼能力与资源体系：《${title}》

## 题材适配说明

本文件由设定体系专题子 Agent 独立生成。历史、官场、战争等无超凡题材应拆现实能力和资源，不硬套修炼境界。

## 能力/资源路由

${entries.map((item, index) => `### ${index + 1}. ${item.name}

**类型**：${item.category}

**章节使用场景**：${item.reuseValue}

**调用条件**：${item.rule}

**代价约束**：${item.cost}

**关联接口**：${item.interfaces}

**证据定位**：${item.range}。${item.evidence}
`).join("\n")}
`;
}

export function renderTopicHighlights(title: string, output: HighlightTopicOutput, candidates?: HighlightCandidateTopicOutput): string {
  return `# 深度高光片段：《${title}》

## 生成口径

本文件由高光机制专题子 Agent 独立生成，只拆高光片段的铺垫、冲突、兑现、后续影响和可复用写法，不承担全书剧情总览或设定百科功能。高光选择必须先读取亮点候选发现结果，覆盖大事件、精彩战役、叙事装置和读者记忆梗。

## 候选覆盖与外部讨论信号

${renderCandidateCoverage(output, candidates)}

## 高光片段详拆

${output.highlights.map((item, index) => `### ${index + 1}. ${item.range}：${item.title}

**高光类型**：${item.category ?? "剧情高光"}

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

## 形式亮点与梗

${renderNarrativeDevices(output)}
`;
}

export function renderTopicMechanisms(title: string, output: HighlightTopicOutput, candidates?: HighlightCandidateTopicOutput): string {
  const narrativeMechanisms = output.narrativeDevices.map((item) => ({
    name: item.name,
    range: item.range,
    principle: `${item.type}通过固定文本形式制造第二声部。`,
    implementation: `${item.form} 功能：${item.function}`,
    appeal: item.whyInteresting,
    rewriteMethod: item.reusableMethod,
    failureRisk: item.boundary,
    evidence: item.evidence
  }));
  const jokeMechanisms = output.recurringJokes.map((item) => ({
    name: item.name,
    range: item.range,
    principle: "反复出现的文本梗通过重复、变形和读者预期制造记忆点。",
    implementation: `${item.pattern} 功能：${item.comedicFunction}`,
    appeal: item.readerPayoff,
    rewriteMethod: item.reusableMethod,
    failureRisk: item.boundary,
    evidence: item.evidence
  }));
  const mechanisms = [...output.mechanisms, ...narrativeMechanisms, ...jokeMechanisms];
  return `# 优点与可复用机制：《${title}》

## 生成口径

本文件由高光机制专题子 Agent 独立生成，只总结读者爽点、结构性优点和可改写方法，不复述设定条目或人物百科。外部讨论和候选发现只提供召回信号，最终机制必须回到原文验证。

## 候选覆盖摘要

${renderCandidateCoverage(output, candidates)}

## 机制拆解

${mechanisms.map((item, index) => `### ${index + 1}. ${item.name}

**机制原理**：${item.principle}

**本书中的工作方式**：${item.implementation}（来源：${item.range}；证据摘要：${item.evidence}）

**为什么好看**：${item.appeal}

**适用题材**：男频玄幻、仙侠、都市重生、科幻、高武、历史、西幻或志怪题材均可借用其结构，但必须替换题材包装、资源形态和组织关系。

**改写方法**：${item.rewriteMethod}

**失败风险**：${item.failureRisk}
`).join("\n")}
`;
}

export function renderTopicDeepData(topics: TopicOutputs): Record<string, unknown> {
  return {
    topicAgentRun: true,
    topicOutputs: {
      plot: Boolean(topics.plot),
      characters: Boolean(topics.characters),
      factions: Boolean(topics.factions),
      map: Boolean(topics.map),
      settings: Boolean(topics.settings),
      highlightCandidates: Boolean(topics.highlightCandidates),
      highlights: Boolean(topics.highlights)
    },
    plot: topics.plot,
    characters: topics.characters,
    factions: topics.factions,
    map: topics.map,
    settings: topics.settings,
    highlightCandidates: topics.highlightCandidates,
    highlights: topics.highlights
  };
}

function renderCandidateCoverage(output: HighlightTopicOutput, candidates?: HighlightCandidateTopicOutput): string {
  const candidateCounts = candidates
    ? `候选发现：大事件 ${candidates.eventHighlights.length} 条，战役 ${candidates.battleCandidates.length} 条，叙事装置 ${candidates.narrativeDevices.length} 条，梗 ${candidates.recurringJokes.length} 条，记忆锚点 ${candidates.memoryAnchors.length} 条。`
    : "未读取到亮点候选发现 JSON；本次只能依靠高光机制专题自身判断。";
  const attempts = candidates?.sourceAttempts ?? [];
  const signals = [...(candidates?.externalSignals ?? []), ...output.externalSignalsUsed];
  const coverage = output.candidateCoverage;
  return `${candidateCounts}

**外部检索尝试**：
${attempts.length > 0 ? attempts.map((item) => `- ${item.source} / ${item.query}：${item.resultSummary}；可用：${item.usable}；限制：${item.limitation}`).join("\n") : "- 未记录外部检索尝试。"}

**可用外部讨论信号**：
${signals.length > 0 ? signals.slice(0, 12).map((item) => `- ${item.platform} / ${item.title}：${item.summary}；可信度：${item.credibility}；相关性：${item.relevance}；候选提示：${item.candidateHint}${item.url && item.url !== "未填写" ? `；链接：${item.url}` : ""}`).join("\n") : "- 未找到足够可靠的外部讨论信号，按原文候选召回和精读判断。"}

**候选处理记录**：
${coverage.length > 0 ? coverage.map((item) => `- ${item.candidate}（${item.type}，${item.range}）：${item.decision}；${item.reason}；落点：${item.finalLocation}`).join("\n") : "- 未记录候选处理结果，需返工补齐选用、合并或排除理由。"}
`;
}

function renderNarrativeDevices(output: HighlightTopicOutput): string {
  const devices = output.narrativeDevices.map((item) => `- **${item.name}**（${item.type}，${item.range}）：形式：${item.form}；功能：${item.function}；为什么有趣：${item.whyInteresting}；复用：${item.reusableMethod}；边界：${item.boundary}；证据：${item.evidence}`);
  const jokes = output.recurringJokes.map((item) => `- **${item.name}**（${item.range}）：重复模式：${item.pattern}；喜剧/调侃功能：${item.comedicFunction}；读者回报：${item.readerPayoff}；复用：${item.reusableMethod}；边界：${item.boundary}；证据：${item.evidence}`);
  const items = [...devices, ...jokes];
  return items.length > 0 ? items.join("\n") : "- 未发现可独立沉淀的叙事装置或文本梗。";
}

function topicDefinitions(params: { title: string; bookDir: string; sourceCopy?: string; characterRecall?: CharacterRecallReport }): TopicDefinition[] {
  return [
    {
      file: "剧情结构.md",
      title: "剧情结构专题",
      output: "plot.json",
      task: "只分析全书阶段和细颗粒关键事件链。不要写设定百科、人物百科、高光机制或势力图谱。",
      template: {
        overviewStages: [{ title: "阶段名", range: "第 1-80 章", summary: "阶段主线", coreConflict: "核心矛盾", payoff: "阶段兑现", nextImpact: "后续影响", evidence: "章节证据摘要" }],
        events: [{ title: "事件名", timeLabel: "小说内时间", range: "第 1-10 章", cause: "前因", conflict: "冲突升级", process: "事件过程", turn: "关键转折", result: "当场结果", impact: "后续影响", involved: "涉及人物/势力", evidence: "章节证据摘要" }]
      }
    },
    {
      file: "人物关系.md",
      title: "人物关系专题",
      output: "characters.json",
      task: "只分析人物画像、身份变化、人物之间的语义关系。必须读取角色召回候选，避免漏掉高频高价值人物。",
      template: {
        protagonist: "主角姓名",
        profiles: [{ name: "人物名", importance: "主角/核心人物/重要人物/次要人物", role: "功能定位", range: "章节范围", identityArc: "身份弧线", relationshipFunction: "关系网功能", keyConflicts: "关键矛盾/牵引", evidence: "章节证据摘要" }],
        relations: [{ source: "人物A", target: "人物B", type: "敌对/合作/上下级/亲属/交易", range: "章节范围", relationship: "具体关系", conflictOrInterest: "矛盾/利益/情感", change: "阶段变化", plotFunction: "剧情功能", evidence: "章节证据摘要" }],
        misreads: ["需要删除或合并的误判"]
      }
    },
    {
      file: "势力与组织.md",
      title: "势力与组织专题",
      output: "factions.json",
      task: "只分析阵营、集团、政权、军政组织和势力范围。势力应类似公孙珣势力、袁绍势力、曹操势力、董卓势力、黄巾势力，不要写经学、军功、婚姻、水利等制度规则。",
      template: {
        factions: [{ name: "势力名", type: "政权/军政集团/宗门/公司/家族/民间组织", coreMembers: "核心人物", territory: "势力范围", controlledRegions: "控制区域", organization: "组织结构", resources: "资源与兵力", allies: "盟友/附庸", enemies: "敌对/竞争势力", stageChanges: "阶段变化", keyEvents: "关键事件", relationshipToProtagonist: "与主角关系", evidence: "章节范围与证据" }]
      }
    },
    {
      file: "地图空间.md",
      title: "地图空间专题",
      output: "map.json",
      task: "只分析地图、地点、空间层级、通道、边界和空间内势力分布。不要写组织内部结构或制度规则。",
      template: {
        locations: [{ name: "地点/区域名", category: "类型/层级", region: "所属区域", controller: "控制者/主要势力", function: "剧情功能", connectedLocations: "连接关系", powerDistribution: "势力分布", range: "章节范围", evidence: "章节证据摘要" }]
      }
    },
    {
      file: "设定体系.md",
      title: "设定体系专题",
      output: "settings.json",
      task: "只分析世界规则、能力体系、资源体系和禁忌代价。不要写人物关系、势力范围、地图条目或高光桥段。",
      template: {
        coreSettings: [settingTemplate()],
        capabilitySystem: [settingTemplate()],
        resourceSystem: [settingTemplate()],
        worldRules: [settingTemplate()]
      }
    },
    {
      file: "亮点候选发现.md",
      title: "亮点候选发现专题",
      output: "highlight-candidates.json",
      task: "先于高光机制专题执行。只负责召回可能被漏掉的高光、精彩战役、叙事装置、文本梗和读者记忆锚点；必须结合 input/亮点候选召回.md、本地原文、现有章节索引，以及可用的外部讨论搜索。不要直接写最终高光分析。",
      template: {
        sourceAttempts: [{ source: "Sensight 社媒搜索/搜索热点事件/通用网络搜索/本地正文", query: "搜索词", resultSummary: "结果摘要", usable: "是/否", limitation: "时间限制、噪声或缺少互动数据" }],
        eventHighlights: [candidateTemplate("大事件高光")],
        battleCandidates: [candidateTemplate("战役高光")],
        narrativeDevices: [candidateTemplate("叙事装置")],
        recurringJokes: [candidateTemplate("梗/趣味点")],
        memoryAnchors: [candidateTemplate("记忆锚点")],
        externalSignals: [externalSignalTemplate()],
        mustReviewMissedCandidates: [candidateTemplate("必须复核")]
      }
    },
    {
      file: "高光机制.md",
      title: "高光机制专题",
      output: "highlights.json",
      task: "只分析高光片段和为什么好看的机制。必须先读取 input/亮点候选召回.md 和 output/topics/highlight-candidates.json，覆盖大事件高光、精彩战役、叙事装置、文本梗和外部讨论中出现的高置信候选。不要复述全书阶段、设定百科、势力图谱或人物百科。",
      template: {
        highlights: [{ title: "高光片段名", category: "大事件高光/战役高光/政治高光/形式亮点", range: "章节范围", plot: "具体剧情过程", setup: "前置铺垫", conflict: "冲突设计", payoff: "当场兑现", impact: "后续影响", reusableMechanism: "可复用写法", reuseBoundary: "复用边界", evidence: "章节证据摘要" }],
        mechanisms: [{ name: "机制名", range: "章节范围", principle: "机制原理", implementation: "本书实现方式", appeal: "为什么好看", rewriteMethod: "改写方法", failureRisk: "失败风险", evidence: "章节证据摘要" }],
        narrativeDevices: [{ name: "叙事装置名", type: "章末伪史评/后世评价/系统公告/论坛体/新闻体", range: "章节范围", form: "文本形式", function: "剧情或情绪功能", whyInteresting: "为什么有趣", reusableMethod: "如何复用", boundary: "复用边界", evidence: "章节证据摘要" }],
        recurringJokes: [{ name: "梗名", range: "章节范围", pattern: "重复模式", comedicFunction: "喜剧或调侃功能", readerPayoff: "读者回报", reusableMethod: "如何复用", boundary: "复用边界", evidence: "章节证据摘要" }],
        candidateCoverage: [{ candidate: "候选名", type: "战役/叙事装置/梗/外部讨论", range: "章节范围", decision: "选用/合并/排除", reason: "理由", finalLocation: "深度高光片段.md/优点与可复用机制.md/排除" }],
        externalSignalsUsed: [externalSignalTemplate()]
      }
    }
  ];
}

function candidateTemplate(type: string): CandidateItem {
  return {
    name: "候选名",
    type,
    range: "章节范围",
    reason: "为什么需要复核",
    evidence: "原文证据或章节定位",
    sourceSignals: "本地召回/外部讨论/用户点名",
    confidence: "高/中/低"
  };
}

function externalSignalTemplate(): ExternalDiscussionSignal {
  return {
    platform: "微博/小红书/公众号/知乎/抖音/其它",
    sourceType: "社媒搜索/热点事件/书评/拆书视频/用户提供链接",
    title: "来源标题",
    url: "链接，可为空",
    summary: "讨论内容摘要",
    engagement: "点赞/收藏/评论/热度，没有则写未提供",
    credibility: "高/中/低，并说明依据",
    relevance: "与候选高光或梗的关系",
    candidateHint: "提示应复核的章节、战役、梗或叙事装置"
  };
}

function renderTopicTask(params: { title: string; bookDir: string; sourceCopy?: string; characterRecall?: CharacterRecallReport }, definition: TopicDefinition): string {
  return `# ${definition.title}：《${params.title}》

## 任务边界

${definition.task}

## 输入

- 持久拆书目录：${params.bookDir}
- 原文副本：${params.sourceCopy ?? "未找到，请读取持久目录 source/ 下原文"}
- 角色召回候选：${params.characterRecall ? "`../角色召回候选.json`" : "未生成"}
- 旧综合中间数据：\`../深拆中间数据.json\`

## 输出

只编辑 \`../../output/topics/${definition.output}\`。必须输出严格 JSON，不要输出 Markdown。

## 质量要求

- 必须独立阅读原文和必要输入，不要照抄其它专题产物。
- 只写本专题职责内的内容，职责外内容宁可不写。
- 每条必须有章节范围和证据摘要。
- 不允许使用“可能、通常、候选、需要二次精读”等占位语。
- 不要复制超过 20 个连续原文字。
`;
}

function settingTemplate(): SettingTopicEntry {
  return {
    name: "设定名",
    category: "世界规则/能力体系/资源体系/禁忌代价",
    definition: "设定定义",
    rule: "运行规则",
    cost: "代价或限制",
    interfaces: "人物/势力/资源/地图接口",
    evolution: "阶段变化",
    reuseValue: "为什么值得借鉴",
    reuseBoundary: "复用边界",
    range: "章节范围",
    evidence: "章节证据摘要"
  };
}

async function readOptionalJson(file: string): Promise<unknown> {
  try {
    const content = await readText(file);
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

function normalizePlotTopic(value: unknown): PlotTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const overviewStages = ensureArray((value as { overviewStages?: unknown[] }).overviewStages).map((item) => normalizeObject(item));
  const events = ensureArray((value as { events?: unknown[] }).events).map((item) => normalizeObject(item));
  if (overviewStages.length === 0 || events.length === 0) return undefined;
  return {
    overviewStages: overviewStages.map((item) => ({
      title: text(item.title),
      range: text(item.range),
      summary: text(item.summary),
      coreConflict: text(item.coreConflict),
      payoff: text(item.payoff),
      nextImpact: text(item.nextImpact),
      evidence: text(item.evidence)
    })),
    events: events.map((item) => ({
      title: text(item.title),
      timeLabel: optionalText(item.timeLabel),
      range: text(item.range),
      cause: text(item.cause),
      conflict: text(item.conflict),
      process: text(item.process),
      turn: text(item.turn),
      result: text(item.result),
      impact: text(item.impact),
      involved: text(item.involved),
      evidence: text(item.evidence)
    }))
  };
}

function normalizeCharacterTopic(value: unknown): CharacterTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const profiles = ensureArray((value as { profiles?: unknown[] }).profiles).map((item) => normalizeObject(item));
  const relations = ensureArray((value as { relations?: unknown[] }).relations).map((item) => normalizeObject(item));
  if (profiles.length === 0 || relations.length === 0) return undefined;
  return {
    protagonist: text((value as { protagonist?: unknown }).protagonist),
    profiles: profiles.map((item) => ({
      name: text(item.name),
      importance: text(item.importance),
      role: text(item.role),
      range: text(item.range),
      identityArc: text(item.identityArc),
      relationshipFunction: text(item.relationshipFunction),
      keyConflicts: text(item.keyConflicts),
      evidence: text(item.evidence)
    })),
    relations: relations.map((item) => ({
      source: text(item.source),
      target: text(item.target),
      type: text(item.type),
      range: text(item.range),
      relationship: text(item.relationship),
      conflictOrInterest: text(item.conflictOrInterest),
      change: text(item.change),
      plotFunction: text(item.plotFunction),
      evidence: text(item.evidence)
    })),
    misreads: ensureArray((value as { misreads?: unknown[] }).misreads).map((item) => text(item))
  };
}

function normalizeFactionTopic(value: unknown): FactionTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const factions = ensureArray((value as { factions?: unknown[] }).factions).map((item) => normalizeObject(item));
  if (factions.length === 0) return undefined;
  return {
    factions: factions.map((item) => ({
      name: text(item.name),
      type: text(item.type),
      coreMembers: text(item.coreMembers),
      territory: text(item.territory),
      controlledRegions: text(item.controlledRegions),
      organization: text(item.organization),
      resources: text(item.resources),
      allies: text(item.allies),
      enemies: text(item.enemies),
      stageChanges: text(item.stageChanges),
      keyEvents: text(item.keyEvents),
      relationshipToProtagonist: text(item.relationshipToProtagonist),
      evidence: text(item.evidence)
    }))
  };
}

function normalizeMapTopic(value: unknown): MapTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const locations = ensureArray((value as { locations?: unknown[] }).locations).map((item) => normalizeObject(item));
  if (locations.length === 0) return undefined;
  return {
    locations: locations.map((item) => ({
      name: text(item.name),
      category: text(item.category),
      region: text(item.region),
      controller: text(item.controller),
      function: text(item.function),
      connectedLocations: text(item.connectedLocations),
      powerDistribution: text(item.powerDistribution),
      range: text(item.range),
      evidence: text(item.evidence)
    }))
  };
}

function normalizeSettingTopic(value: unknown): SettingTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const output = {
    coreSettings: normalizeSettingEntries((value as { coreSettings?: unknown[] }).coreSettings),
    capabilitySystem: normalizeSettingEntries((value as { capabilitySystem?: unknown[] }).capabilitySystem),
    resourceSystem: normalizeSettingEntries((value as { resourceSystem?: unknown[] }).resourceSystem),
    worldRules: normalizeSettingEntries((value as { worldRules?: unknown[] }).worldRules)
  };
  return Object.values(output).some((items) => items.length > 0) ? output : undefined;
}

function normalizeHighlightCandidateTopic(value: unknown): HighlightCandidateTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const output = {
    sourceAttempts: ensureArray((value as { sourceAttempts?: unknown[] }).sourceAttempts).map((item) => {
      const object = normalizeObject(item);
      return {
        source: text(object.source),
        query: text(object.query),
        resultSummary: text(object.resultSummary),
        usable: text(object.usable),
        limitation: text(object.limitation)
      };
    }),
    eventHighlights: normalizeCandidateItems((value as { eventHighlights?: unknown[] }).eventHighlights),
    battleCandidates: normalizeCandidateItems((value as { battleCandidates?: unknown[] }).battleCandidates),
    narrativeDevices: normalizeCandidateItems((value as { narrativeDevices?: unknown[] }).narrativeDevices),
    recurringJokes: normalizeCandidateItems((value as { recurringJokes?: unknown[] }).recurringJokes),
    memoryAnchors: normalizeCandidateItems((value as { memoryAnchors?: unknown[] }).memoryAnchors),
    externalSignals: normalizeExternalSignals((value as { externalSignals?: unknown[] }).externalSignals),
    mustReviewMissedCandidates: normalizeCandidateItems((value as { mustReviewMissedCandidates?: unknown[] }).mustReviewMissedCandidates)
  };
  return Object.values(output).some((items) => Array.isArray(items) && items.length > 0) ? output : undefined;
}

function normalizeHighlightTopic(value: unknown): HighlightTopicOutput | undefined {
  if (!isObject(value)) return undefined;
  const highlights = ensureArray((value as { highlights?: unknown[] }).highlights).map((item) => normalizeObject(item));
  const mechanisms = ensureArray((value as { mechanisms?: unknown[] }).mechanisms).map((item) => normalizeObject(item));
  if (highlights.length === 0 || mechanisms.length === 0) return undefined;
  return {
    highlights: highlights.map((item) => ({
      title: text(item.title),
      category: optionalText(item.category),
      range: text(item.range),
      plot: text(item.plot),
      setup: text(item.setup),
      conflict: text(item.conflict),
      payoff: text(item.payoff),
      impact: text(item.impact),
      reusableMechanism: text(item.reusableMechanism),
      reuseBoundary: text(item.reuseBoundary),
      evidence: text(item.evidence)
    })),
    mechanisms: mechanisms.map((item) => ({
      name: text(item.name),
      range: text(item.range),
      principle: text(item.principle),
      implementation: text(item.implementation),
      appeal: text(item.appeal),
      rewriteMethod: text(item.rewriteMethod),
      failureRisk: text(item.failureRisk),
      evidence: text(item.evidence)
    })),
    narrativeDevices: ensureArray((value as { narrativeDevices?: unknown[] }).narrativeDevices).map((item) => {
      const object = normalizeObject(item);
      return {
        name: text(object.name),
        type: text(object.type),
        range: text(object.range),
        form: text(object.form),
        function: text(object.function),
        whyInteresting: text(object.whyInteresting),
        reusableMethod: text(object.reusableMethod ?? object.reuseMethod),
        boundary: text(object.boundary),
        evidence: text(object.evidence)
      };
    }),
    recurringJokes: ensureArray((value as { recurringJokes?: unknown[] }).recurringJokes).map((item) => {
      const object = normalizeObject(item);
      return {
        name: text(object.name ?? object.memory),
        range: text(object.range),
        pattern: text(object.pattern),
        comedicFunction: text(object.comedicFunction ?? object.function),
        readerPayoff: text(object.readerPayoff ?? object.payoff),
        reusableMethod: text(object.reusableMethod ?? object.reuseMethod),
        boundary: text(object.boundary ?? object.reuseBoundary),
        evidence: text(object.evidence)
      };
    }),
    candidateCoverage: ensureArray((value as { candidateCoverage?: unknown[] }).candidateCoverage).map((item) => {
      const object = normalizeObject(item);
      return {
        candidate: text(object.candidate ?? object.item),
        type: text(object.type),
        range: text(object.range),
        decision: text(object.decision ?? object.status),
        reason: text(object.reason),
        finalLocation: text(object.finalLocation ?? object.placement)
      };
    }),
    externalSignalsUsed: normalizeExternalSignals((value as { externalSignalsUsed?: unknown[] }).externalSignalsUsed)
  };
}

function normalizeSettingEntries(value: unknown): SettingTopicEntry[] {
  return ensureArray(value).map((item) => normalizeObject(item)).map((item) => ({
    name: text(item.name),
    category: text(item.category),
    definition: text(item.definition),
    rule: text(item.rule),
    cost: text(item.cost),
    interfaces: text(item.interfaces),
    evolution: text(item.evolution),
    reuseValue: text(item.reuseValue),
    reuseBoundary: text(item.reuseBoundary),
    range: text(item.range),
    evidence: text(item.evidence)
  }));
}

function normalizeCandidateItems(value: unknown): CandidateItem[] {
  return ensureArray(value).map((item) => normalizeObject(item)).map((item) => ({
    name: text(item.name),
    type: text(item.type),
    range: text(item.range),
    reason: text(item.reason),
    evidence: text(item.evidence),
    sourceSignals: text(item.sourceSignals),
    confidence: text(item.confidence)
  }));
}

function normalizeExternalSignals(value: unknown): ExternalDiscussionSignal[] {
  return ensureArray(value).map((item) => normalizeObject(item)).map((item) => ({
    platform: text(item.platform),
    sourceType: text(item.sourceType),
    title: text(item.title),
    url: optionalText(item.url) ?? "",
    summary: text(item.summary),
    engagement: text(item.engagement),
    credibility: text(item.credibility),
    relevance: text(item.relevance),
    candidateHint: text(item.candidateHint)
  }));
}

function renderStoryBibleSettingEntry(index: number, item: SettingTopicEntry): string {
  return `## ${index}. ${item.name}

**类型**：${item.category}

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

function renderCharacterEntry(index: number, item: CharacterTopicOutput["profiles"][number], output: CharacterTopicOutput, core: boolean): string {
  const relations = output.relations.filter((relation) => relation.source === item.name || relation.target === item.name).slice(0, core ? 6 : 3);
  return `### ${index}. ${item.name}

**重要度**：${item.importance}

**功能定位**：${item.role}

**身份弧线**：${item.identityArc}

**关系网功能**：${item.relationshipFunction}

**关键矛盾/牵引**：${item.keyConflicts}

**关键关系**：
${relations.length > 0 ? relations.map((relation) => `- ${relation.source} -> ${relation.target}（${relation.type}）：${relation.relationship}；变化：${relation.change}`).join("\n") : "- 暂无结构化关系边。"}

**章节范围与证据**：${item.range}。${item.evidence}
`;
}

function renderRecallCheck(output: CharacterTopicOutput, characterRecall?: CharacterRecallReport): string {
  if (!characterRecall) return "";
  const profileNames = output.profiles.map((item) => item.name).join("\n");
  const required = characterRecall.candidates.filter((item) => item.mustReview).slice(0, 60);
  return `## 角色召回校验

${required.map((item) => {
    const included = [item.name, ...item.aliases.filter((alias) => alias.length >= 3)].some((term) => profileNames.includes(term));
    const aliasSummary = Object.entries(item.aliasMentions).filter(([, count]) => count > 0).map(([term, count]) => `${term} ${count} 次`).join("，");
    return `- **${item.name}**：${included ? "已纳入人物画像" : "未纳入人物画像，需返工核对"}。${aliasSummary || `总命中 ${item.mentions} 次`}。召回原因：${item.reason}`;
  }).join("\n")}`;
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "未填写";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
