import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readText, writeText } from "../../core/workspace.js";

type Severity = "高" | "中" | "低";

type AuditIssue = {
  file: string;
  severity: Severity;
  message: string;
  evidence: string;
  suggestion: string;
};

type FileSummary = {
  file: string;
  status: "通过" | "需返工";
  issueCount: number;
};

export type ProductAuditResult = {
  target: string;
  title: string;
  status: "通过" | "需返工";
  summaries: FileSummary[];
  issues: AuditIssue[];
  reportPath?: string;
};

type AuditOptions = {
  writeReport?: boolean;
};

const REQUIRED_FILES = [
  "章节索引.md",
  "剧情阶段总览.md",
  "全书拆书总报告.md",
  "优点与可复用机制.md",
  "深度设定沉淀.md",
  "深度高光片段.md",
  "设定集-总览.md",
  "设定集-修炼与能力体系.md",
  "设定集-地图与空间层级.md",
  "设定集-势力与组织.md",
  "设定集-资源体系.md",
  "设定集-人物关系与身份体系.md",
  "设定集-世界规则与禁忌.md",
  "设定集-设定时间线.md",
  "设定集-写作复用边界.md",
  "人物与关系图.md",
  "修炼能力与资源体系.md",
  "关键事件链.md",
  "深拆中间数据.json"
];

const WEAK_PHRASES = [
  "通常",
  "可能",
  "应该",
  "需要二次精读",
  "需二次精读",
  "后续人工精修",
  "当前自动索引",
  "候选",
  "不是单章爆点，而是一个局部剧情单元",
  "这个结果可能是",
  "这个机制把",
  "不是孤立名词"
];

const DEEP_SETTING_FIELDS = ["设定定义", "剧情落点", "运行规则", "代价与限制", "人物和势力接口", "阶段变化", "为什么值得借鉴", "复用边界"];
const HIGHLIGHT_FIELDS = ["剧情概述", "剧情拆分", "前置铺垫", "冲突设计", "当场爽点", "后续影响", "为什么好", "可复用写法", "不可复用元素"];
const MECHANISM_FIELDS = ["机制原理", "本书中的工作方式", "为什么好看", "适用题材", "改写方法", "失败风险"];
const STORY_BIBLE_FIELDS = ["设定定义", "运行规则", "剧情落点", "代价与限制", "人物和势力接口", "阶段变化", "复用边界"];

export async function auditDeconstructionTarget(targetDir: string, options: AuditOptions = {}): Promise<ProductAuditResult | ProductAuditResult[]> {
  if (await looksLikeBookDir(targetDir)) {
    return auditBookDir(targetDir, options);
  }
  return auditCollectionDir(targetDir, options);
}

export async function auditBookDir(bookDir: string, options: AuditOptions = {}): Promise<ProductAuditResult> {
  const title = path.basename(bookDir);
  const files = await readBookFiles(bookDir);
  const issues: AuditIssue[] = [];

  for (const file of REQUIRED_FILES) {
    if (!files.has(file)) {
      issues.push({
        file,
        severity: "高",
        message: "缺少必需产物",
        evidence: "文件不存在",
        suggestion: "重新运行深拆或补齐该文件后再审计。"
      });
    }
  }

  const chapterCount = countChapters(files.get("章节索引.md") ?? "");
  auditHighlights(files.get("深度高光片段.md") ?? "", chapterCount, issues);
  auditDeepSettings(files.get("深度设定沉淀.md") ?? "", issues);
  auditMechanisms(files.get("优点与可复用机制.md") ?? "", "优点与可复用机制.md", false, issues);
  auditStoryBible(files, issues);
  auditCharacterGraph(files.get("人物与关系图.md") ?? "", issues);
  auditDeepJson(files.get("深拆中间数据.json") ?? "", issues);

  const summaries = summarizeFiles(issues);
  const result: ProductAuditResult = {
    target: bookDir,
    title,
    status: issues.some((issue) => issue.severity === "高" || issue.severity === "中") ? "需返工" : "通过",
    summaries,
    issues
  };

  if (options.writeReport ?? true) {
    const reportPath = path.join(bookDir, "产物有效性审计.md");
    await writeText(reportPath, renderAuditReport(result));
    result.reportPath = reportPath;
  }
  return result;
}

async function auditCollectionDir(collectionDir: string, options: AuditOptions): Promise<ProductAuditResult[]> {
  const entries = await readdir(collectionDir, { withFileTypes: true });
  const bookDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(collectionDir, entry.name));
  const results: ProductAuditResult[] = [];
  for (const bookDir of bookDirs) {
    if (await looksLikeBookDir(bookDir)) {
      results.push(await auditBookDir(bookDir, options));
    }
  }
  if (options.writeReport ?? true) {
    await writeText(path.join(collectionDir, "产物有效性总审计.md"), renderCollectionReport(results));
  }
  return results;
}

async function looksLikeBookDir(dir: string): Promise<boolean> {
  try {
    await stat(path.join(dir, "章节索引.md"));
    await stat(path.join(dir, "人物与关系图.md"));
    return true;
  } catch {
    return false;
  }
}

async function readBookFiles(bookDir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await readdir(bookDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") && !entry.name.endsWith(".json")) {
      continue;
    }
    files.set(entry.name, await readText(path.join(bookDir, entry.name)));
  }
  return files;
}

function auditHighlights(content: string, chapterCount: number, issues: AuditIssue[]): void {
  const sections = splitNumberedSections(content);
  const expected = highlightTarget(chapterCount);
  if (sections.length < expected) {
    issues.push({
      file: "深度高光片段.md",
      severity: "高",
      message: "高光数量低于体量要求",
      evidence: `实际 ${sections.length} 个，最低要求 ${expected} 个。`,
      suggestion: "按全书体量和讨论度重新选取高光，不要机械固定数量。"
    });
  }
  for (const section of sections) {
    requireFields("深度高光片段.md", section.title, section.body, HIGHLIGHT_FIELDS, issues);
    requireLength("深度高光片段.md", section.title, section.body, 400, issues);
    requireEvidence("深度高光片段.md", section.title, section.body, issues);
  }
  auditTemplateDuplication("深度高光片段.md", sections.map((section) => section.body), 0.28, issues);
}

function auditDeepSettings(content: string, issues: AuditIssue[]): void {
  const sections = splitNumberedSections(content);
  if (sections.length < 6) {
    issues.push({
      file: "深度设定沉淀.md",
      severity: "中",
      message: "深度设定条目过少",
      evidence: `实际 ${sections.length} 条。`,
      suggestion: "至少覆盖世界规则、能力体系、资源体系、组织势力、地图层级、人物关系和时间线。"
    });
  }
  for (const section of sections) {
    requireFields("深度设定沉淀.md", section.title, section.body, DEEP_SETTING_FIELDS, issues);
    requireLength("深度设定沉淀.md", section.title, section.body, 280, issues);
    requireEvidence("深度设定沉淀.md", section.title, section.body, issues);
  }
  auditTemplateDuplication("深度设定沉淀.md", sections.map((section) => section.body), 0.22, issues);
}

function auditMechanisms(content: string, file: string, deep: boolean, issues: AuditIssue[]): void {
  const sections = splitNumberedSections(content);
  if (!deep && sections.length === 0) {
    issues.push({
      file,
      severity: "高",
      message: "机制只有标题级列表，没有逐条拆解",
      evidence: "未发现 `### 1.` 形式的机制条目。",
      suggestion: "每条机制都要写清原理、本书实现、为什么好看、适用题材、改写方法和失败风险。"
    });
    return;
  }
  if (deep && sections.length < 5) {
    issues.push({
      file,
      severity: "中",
      message: "深度机制条目不足",
      evidence: `实际 ${sections.length} 条。`,
      suggestion: "从核心优点、高光片段和分段精拆中补足至少 5 条机制。"
    });
  }
  for (const section of sections) {
    requireFields(file, section.title, section.body, MECHANISM_FIELDS, issues);
    requireLength(file, section.title, section.body, 240, issues);
    requireEvidence(file, section.title, section.body, issues);
  }
  auditTemplateDuplication(file, sections.map((section) => section.body), 0.24, issues);
}

function auditStoryBible(files: Map<string, string>, issues: AuditIssue[]): void {
  const storyFiles = [...files.entries()].filter(([file]) => file.startsWith("设定集-") && file !== "设定集-总览.md" && file !== "设定集-写作复用边界.md");
  for (const [file, content] of storyFiles) {
    const sections = splitNumberedSections(content, /^## \d+\./m);
    if (sections.length === 0) {
      issues.push({
        file,
        severity: "中",
        message: "设定集缺少可检索条目",
        evidence: "未发现编号条目。",
        suggestion: "按设定定义、运行规则、剧情落点、代价限制、人物接口、阶段变化和复用边界重写。"
      });
      continue;
    }
    for (const section of sections) {
      requireFields(file, section.title, section.body, STORY_BIBLE_FIELDS, issues);
      requireLength(file, section.title, section.body, 240, issues);
    }
    auditTemplateDuplication(file, sections.map((section) => section.body), 0.3, issues);
  }
}

function auditCharacterGraph(content: string, issues: AuditIssue[]): void {
  if (!content.includes("子 Agent 精读校正")) {
    issues.push({
      file: "人物与关系图.md",
      severity: "高",
      message: "人物关系图缺少子 Agent 精读校正",
      evidence: "未发现 `子 Agent 精读校正`。",
      suggestion: "必须用原文精读校正主角、同伴、反派、师徒上下级、亲属情感和关键矛盾链。"
    });
  }
  if (!content.includes("当前自动图明显误判")) {
    issues.push({
      file: "人物与关系图.md",
      severity: "中",
      message: "没有明确指出自动抽取误判",
      evidence: "未发现 `当前自动图明显误判`。",
      suggestion: "需要显式列出误判人物、误判关系和应删除的噪声节点。"
    });
  }
  const profileSection = sectionBetween(content, "## 主要人物画像", "## 语义关系边");
  const relationSection = sectionBetween(content, "## 语义关系边", "## 当前自动图明显误判");
  const profileCount = countNumberedItems(profileSection);
  const relationCount = countNumberedItems(relationSection);
  if (profileCount < 15) {
    issues.push({
      file: "人物与关系图.md",
      severity: "中",
      message: "人物画像数量不足",
      evidence: `实际 ${profileCount} 个。`,
      suggestion: "补充核心同伴、主要对手、导师上位者、组织接口、交易对象和阶段性重要配角。"
    });
  }
  if (relationCount < 20) {
    issues.push({
      file: "人物与关系图.md",
      severity: "高",
      message: "语义关系边不足",
      evidence: `实际 ${relationCount} 条。`,
      suggestion: "人物关系图必须写出敌对、合作、上下级、亲属情感、交易利用和组织身份等语义关系。"
    });
  }
  const relationTypes = ["敌对", "矛盾", "合作", "同盟", "师徒", "上下级", "亲属", "情感", "交易", "利用", "组织"];
  const matchedTypes = relationTypes.filter((type) => relationSection.includes(type));
  if (relationCount > 0 && matchedTypes.length < 4) {
    issues.push({
      file: "人物与关系图.md",
      severity: "中",
      message: "关系类型过少",
      evidence: `命中关系类型：${matchedTypes.join("、") || "无"}。`,
      suggestion: "关系边不能只写共现或泛泛关联，至少覆盖敌对/合作/上下级/亲属情感/交易利用/组织身份中的多类。"
    });
  }
  if (occurrences(content, "共现") > 6) {
    issues.push({
      file: "人物与关系图.md",
      severity: "中",
      message: "人物关系仍偏机械统计",
      evidence: "`共现` 出现过多。",
      suggestion: "降低共现统计表述，改写为人物之间的具体矛盾、利益、身份、情感和阶段变化。"
    });
  }
}

function auditDeepJson(content: string, issues: AuditIssue[]): void {
  if (!content.trim()) {
    return;
  }
  try {
    const parsed = JSON.parse(content) as {
      refineAgentRun?: boolean;
      agentChunkCount?: number;
      chunkCount?: number;
      events?: unknown[];
      highlights?: unknown[];
      settingInsights?: unknown[];
      mechanisms?: unknown[];
      characterNetwork?: { profiles?: unknown[]; relations?: unknown[] };
    };
    if (parsed.refineAgentRun) {
      if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
        issues.push({
          file: "深拆中间数据.json",
          severity: "中",
          message: "返工中间数据缺少事件",
          evidence: "refineAgentRun=true，但 events 为空或不存在。",
          suggestion: "返工应用时必须把高光片段转成可检索事件。"
        });
      }
      if (
        !Array.isArray(parsed.highlights) ||
        !Array.isArray(parsed.settingInsights) ||
        !Array.isArray(parsed.mechanisms) ||
        !Array.isArray(parsed.characterNetwork?.profiles) ||
        !Array.isArray(parsed.characterNetwork?.relations)
      ) {
        issues.push({
          file: "深拆中间数据.json",
          severity: "中",
          message: "返工中间数据结构不完整",
          evidence: "缺少 highlights、settingInsights、mechanisms 或 characterNetwork。",
          suggestion: "返工中间数据必须保留子 Agent 精读 JSON 的主要结构，方便后续检索。"
        });
      }
      return;
    }
    const agentCount = parsed.agentChunkCount ?? 0;
    const chunkCount = parsed.chunkCount ?? 0;
    if (chunkCount > 0 && agentCount / chunkCount < 0.85) {
      issues.push({
        file: "深拆中间数据.json",
        severity: "高",
        message: "runner 子 Agent JSON 覆盖率不足",
        evidence: `agentChunkCount=${agentCount}, chunkCount=${chunkCount}。`,
        suggestion: "补跑 chunk 子 Agent JSON，不能只依赖 fallback 抽取。"
      });
    }
    if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
      issues.push({
        file: "深拆中间数据.json",
        severity: "中",
        message: "缺少关键事件结构化数据",
        evidence: "events 为空或不存在。",
        suggestion: "chunk 精读必须抽取关键事件、证据摘要和后续影响。"
      });
    }
  } catch {
    issues.push({
      file: "深拆中间数据.json",
      severity: "高",
      message: "JSON 无法解析",
      evidence: "JSON.parse 失败。",
      suggestion: "重新生成深拆中间数据。"
    });
  }
}

function requireFields(file: string, title: string, body: string, fields: string[], issues: AuditIssue[]): void {
  const missing = fields.filter((field) => !body.includes(`**${field}**`) && !body.includes(`## ${field}`) && !body.includes(`### ${field}`));
  if (missing.length > 0) {
    issues.push({
      file,
      severity: "中",
      message: "条目缺少必需分析维度",
      evidence: `${title} 缺少：${missing.join("、")}。`,
      suggestion: "补齐缺失维度，避免只写剧情复述或标题级总结。"
    });
  }
}

function requireLength(file: string, title: string, body: string, minChars: number, issues: AuditIssue[]): void {
  const length = body.replace(/\s/g, "").length;
  if (length < minChars) {
    issues.push({
      file,
      severity: "中",
      message: "条目分析过短",
      evidence: `${title} 有效字符 ${length}，最低要求 ${minChars}。`,
      suggestion: "增加具体剧情过程、规则细节、人物/势力接口、前后影响和可复用边界。"
    });
  }
}

function requireEvidence(file: string, title: string, body: string, issues: AuditIssue[]): void {
  const chapterNumber = "[一二三四五六七八九十百千万零〇两0-9]+";
  const chapterRange = `${chapterNumber}(?:[-—~至]\\s*${chapterNumber})?`;
  const chapterPattern = new RegExp(`第\\s*${chapterRange}(?:\\s*[、,，]\\s*${chapterRange})*\\s*[章卷]`);
  const evidenceText = `${title}\n${body}`;
  if (!chapterPattern.test(evidenceText) && !/(第[一二三四五六七八九十百千万零〇两0-9]+卷|全书|贯穿全书)/.test(evidenceText)) {
    issues.push({
      file,
      severity: "中",
      message: "缺少章节级证据",
      evidence: `${title} 未出现明确章节范围。`,
      suggestion: "每条结论都要能追溯到首次出现、升级或回收章节。"
    });
  }
}

function auditTemplateDuplication(file: string, bodies: string[], threshold: number, issues: AuditIssue[]): void {
  if (bodies.length < 3) {
    return;
  }
  const duplicateRatio = repeatedSentenceRatio(bodies);
  const weakRatio = weakPhraseRatio(bodies.join("\n"));
  if (duplicateRatio > threshold) {
    issues.push({
      file,
      severity: "高",
      message: "模板句重复比例过高",
      evidence: `重复句比例 ${(duplicateRatio * 100).toFixed(1)}%，阈值 ${(threshold * 100).toFixed(1)}%。`,
      suggestion: "回到原文或子 Agent JSON 重写，不要用同一套解释套不同条目。"
    });
  }
  if (weakRatio > 0.03) {
    issues.push({
      file,
      severity: "中",
      message: "弱结论/占位表达过多",
      evidence: `弱表达密度 ${(weakRatio * 100).toFixed(1)}%。`,
      suggestion: "减少“通常/可能/需二次精读/候选”等占位话，改成有证据的确定结论。"
    });
  }
}

function splitNumberedSections(content: string, pattern = /^### \d+\./m): Array<{ title: string; body: string }> {
  const matches = [...content.matchAll(new RegExp(pattern.source, "gm"))];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? content.length : content.length;
    const section = content.slice(start, end).trim();
    const [title = "未命名条目", ...rest] = section.split("\n");
    return { title: title.replace(/^#+\s*/, "").trim(), body: rest.join("\n").trim() };
  });
}

function sectionBetween(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  if (start < 0) {
    return "";
  }
  const end = content.indexOf(endMarker, start + startMarker.length);
  return content.slice(start, end < 0 ? undefined : end);
}

function countNumberedItems(content: string): number {
  return [...content.matchAll(/^### \d+\./gm)].length;
}

function repeatedSentenceRatio(bodies: string[]): number {
  const sentences = bodies.flatMap((body) => splitSentences(body).map(normalizeSentence)).filter((sentence) => sentence.length >= 18);
  if (sentences.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  }
  const repeated = [...counts.values()].filter((count) => count >= 3).reduce((sum, count) => sum + count, 0);
  return repeated / sentences.length;
}

function weakPhraseRatio(content: string): number {
  const compactLength = Math.max(1, content.replace(/\s/g, "").length);
  const count = WEAK_PHRASES.reduce((sum, phrase) => sum + occurrences(content, phrase), 0);
  return count / compactLength;
}

function splitSentences(content: string): string[] {
  return content.split(/[。！？\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeSentence(sentence: string): string {
  return sentence
    .replace(/《[^》]+》/g, "《书名》")
    .replace(/“[^”]{1,20}”/g, "“条目”")
    .replace(/第\s*[一二三四五六七八九十百千万零〇两0-9]+(?:[-—~至]\s*[一二三四五六七八九十百千万零〇两0-9]+)?\s*章/g, "第X章")
    .replace(/\d+/g, "N")
    .replace(/\s/g, "");
}

function countChapters(content: string): number {
  return content.split("\n").filter((line) => /^\d+\.\s/.test(line.trim())).length;
}

function highlightTarget(chapterCount: number): number {
  if (chapterCount >= 1200) {
    return 16;
  }
  if (chapterCount >= 850) {
    return 12;
  }
  if (chapterCount >= 500) {
    return 10;
  }
  return 8;
}

function summarizeFiles(issues: AuditIssue[]): FileSummary[] {
  const files = new Set([...REQUIRED_FILES, ...issues.map((issue) => issue.file)]);
  return [...files].map((file) => {
    const fileIssues = issues.filter((issue) => issue.file === file);
    return {
      file,
      status: fileIssues.some((issue) => issue.severity === "高" || issue.severity === "中") ? "需返工" : "通过",
      issueCount: fileIssues.length
    };
  });
}

function renderAuditReport(result: ProductAuditResult): string {
  return `# 产物有效性审计：《${result.title}》

## 结论

- 状态：${result.status}
- 问题数：${result.issues.length}
- 审计目标：${result.target}

## 审计口径

本审计只判断产物是否能服务后续自动写作：内容必须有深度、可检索、可复用、有证据，不接受只做标题级分析、模板化拆解或“后续二次精拆”占位。

## 文件概览

${result.summaries.map((summary) => `- ${summary.file}：${summary.status}，问题 ${summary.issueCount} 个`).join("\n")}

## 问题清单

${result.issues.length === 0 ? "- 未发现阻塞性问题。" : result.issues.map(renderIssue).join("\n")}
`;
}

function renderCollectionReport(results: ProductAuditResult[]): string {
  const failed = results.filter((result) => result.status === "需返工");
  return `# 产物有效性总审计

## 总览

- 审计书目：${results.length}
- 需返工：${failed.length}
- 通过：${results.length - failed.length}

## 书目结果

${results.map((result) => `- ${result.title}：${result.status}，问题 ${result.issues.length} 个${result.reportPath ? `，报告：${result.reportPath}` : ""}`).join("\n")}

## 优先返工方向

${failed.length === 0 ? "- 暂无。" : failed.flatMap((result) => result.issues.filter((issue) => issue.severity === "高").slice(0, 3).map((issue) => `- ${result.title} / ${issue.file}：${issue.message}。${issue.suggestion}`)).join("\n")}
`;
}

function renderIssue(issue: AuditIssue): string {
  return `### ${issue.file} / ${issue.message}

- 严重度：${issue.severity}
- 证据：${issue.evidence}
- 建议：${issue.suggestion}
`;
}

function occurrences(text: string, keyword: string): number {
  return text.split(keyword).length - 1;
}
