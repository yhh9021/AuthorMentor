import { spawn } from "node:child_process";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { applyDeconstructionRun } from "./apply.js";
import { prepareDeconstructionRun } from "./prepare.js";
import { type PrepareOptions } from "./schema.js";
import { readText, writeText } from "../../core/workspace.js";

type Chapter = {
  index: number;
  title: string;
  text: string;
};

type Chunk = {
  index: number;
  start: number;
  end: number;
  chapters: Chapter[];
};

type EntityRecord = {
  name: string;
  mentions: number;
  chapters: Set<number>;
  markers: Map<string, number>;
};

type EntitySummary = {
  name: string;
  mentions: number;
  firstChapter: number;
  lastChapter: number;
  chapterCount: number;
  markers: string[];
};

type RelationRecord = {
  source: string;
  target: string;
  mentions: number;
  chapters: Set<number>;
  markers: Map<string, number>;
};

type RelationSummary = {
  source: string;
  target: string;
  mentions: number;
  firstChapter: number;
  lastChapter: number;
  markers: string[];
};

type DeepBook = {
  title: string;
  chapterCount: number;
  chunkCount: number;
  characters: EntitySummary[];
  relations: RelationSummary[];
  organizations: EntitySummary[];
  locations: EntitySummary[];
  systems: EntitySummary[];
  chunkSummaries: Array<{
    chunk: number;
    range: string;
    characters: string[];
    organizations: string[];
    locations: string[];
    systems: string[];
  }>;
};

type AuditItem = {
  name: string;
  status: "通过" | "需返工";
  detail: string;
};

type DeepRunOptions = PrepareOptions & {
  agentCommand?: string;
  agentMode?: "fallback" | "required";
};

type AgentChunk = {
  chunk: number;
  range: string;
  characters: Array<{ name: string; role?: string; evidence: string; relationHints?: string[] }>;
  relations: Array<{ source: string; target: string; relation: string; evidence: string }>;
  organizations: Array<{ name: string; description?: string; evidence: string }>;
  locations: Array<{ name: string; description?: string; evidence: string }>;
  systems: Array<{ name: string; category?: string; rule?: string; evidence: string }>;
  events: Array<{ name: string; evidence: string; impact?: string }>;
};

const CHAPTER_TITLE_PATTERN =
  /^(?:\d+[.、]\s*)?第[一二三四五六七八九十百千万零〇两0-9]+章[^\n\r]*/gm;

const STOP_ENTITY_PARTS = [
  "一个",
  "一下",
  "一些",
  "一种",
  "这里",
  "那里",
  "这个",
  "那个",
  "他们",
  "她们",
  "我们",
  "你们",
  "自己",
  "什么",
  "没有",
  "只是",
  "已经",
  "然后",
  "不过",
  "因为",
  "所以",
  "但是",
  "如果",
  "时候",
  "现在",
  "突然",
  "似乎",
  "可以",
  "不能",
  "不是",
  "说道",
  "问道",
  "笑道",
  "微微",
  "呵呵",
  "嘿嘿",
  "摇了",
  "点了",
  "轻轻",
  "继续",
  "一边",
  "于是",
  "说着",
  "微笑",
  "而是",
  "接着",
  "眼睁睁",
  "讪讪",
  "凑近",
  "凑到耳边",
  "好奇地",
  "静静地",
  "直接",
  "再次",
  "大声",
  "低声",
  "忽然",
  "因此",
  "反而",
  "开玩",
  "奇怪地",
  "含笑",
  "短暂的",
  "温和",
  "随口",
  "仔细",
  "赶紧",
  "专注地",
  "严肃地",
  "礼貌地",
  "目光",
  "一直",
  "此时",
  "当下",
  "闻言",
  "沿途",
  "不由",
  "暗自",
  "纷纷",
  "故意",
  "想了想",
  "想想",
  "忍不住",
  "交头接耳",
  "音乐家",
  "魔法师",
  "贤者",
  "引力",
  "经典",
  "高塔几何",
  "阿林厄",
  "纷纷起身",
  "在心灵连线里",
  "看着",
  "听到",
  "心中",
  "眼中",
  "脸上",
  "身上",
  "前方",
  "后方",
  "这位",
  "那位",
  "众人",
  "所有",
  "第一",
  "第二",
  "第三"
];

const PERSON_PATTERNS = [
  /(?:^|[\n，。！？；：“”])([\p{Script=Han}A-Za-z·]{2,8})(?:说道|说着|问道|笑道|冷笑道|沉声道|低声道|喊道|叫道|答道|叹道|皱眉道|开口道|喃喃道)/gu,
  /(?:名叫|名为|叫做|唤作|自称|称为)([\p{Script=Han}A-Za-z·]{2,10})/gu
];

const COMPOUND_SURNAMES = [
  "万俟",
  "司马",
  "上官",
  "欧阳",
  "夏侯",
  "诸葛",
  "闻人",
  "东方",
  "赫连",
  "皇甫",
  "尉迟",
  "公羊",
  "澹台",
  "公冶",
  "宗政",
  "濮阳",
  "淳于",
  "单于",
  "太叔",
  "申屠",
  "公孙",
  "仲孙",
  "轩辕",
  "令狐",
  "钟离",
  "宇文",
  "长孙",
  "慕容",
  "鲜于",
  "司徒",
  "司空",
  "南宫",
  "西门",
  "东郭",
  "端木",
  "拓跋"
];

const SINGLE_SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝安常乐于时傅齐康伍余顾孟黄和穆萧尹姚邵汪祁毛米贝明成戴宋庞熊纪舒屈项祝董梁杜阮蓝季贾路危江童颜郭梅盛林钟徐骆高夏蔡田胡凌霍虞万柯管卢莫房解应宗丁宣邓郁杭洪包左石崔吉龚程邢裴陆荣翁荀惠曲封靳松井段富巫乌焦巴弓牧山谷车侯全班秋仲伊宫宁仇甘厉祖武符刘景龙叶幸韶黎薄白怀蒲从索赖卓蔺蒙池乔闻党翟谭劳姬申冉雍桑桂牛寿边扈燕浦尚温庄晏柴瞿阎充慕连习艾鱼容向古易戈廖庾衡步都耿满弘匡文寇广东欧沃利越师巩聂晁勾敖融冷辛简饶曾沙丰关相查后荆红游竺权益桓";

const ORGANIZATION_PATTERN =
  /([\p{Script=Han}A-Za-z·]{2,16}(?:宗|门|派|教会|议会|学派|学院|道院|武殿|朝廷|军团|军|营|府|司|局|公司|家族|世家|教派|联盟|协会|结社|会|帮|堂|阁|宫|骑士团|值夜者|塔罗会|七血瞳))/gu;

const LOCATION_PATTERN =
  /([\p{Script=Han}A-Za-z·]{2,16}(?:城|镇|村|山|海|岛|州|郡|县|府|国|界|星界|神域|禁区|秘境|遗迹|战场|水府|荒原|森林|大陆|王国|帝国|港|星球|宇宙))/gu;

const SYSTEM_PATTERN =
  /([\p{Script=Han}A-Za-z·]{2,16}(?:境|期|阶|级|序列|魔药|途径|功法|法术|魔法|奥术|论文|实验|神术|源力|气血|星脉|灵石|善功|贡献|丹|符|法器|污染|失控|异质|旧日|神灵|真神|半神|筑基|结丹|金丹|元婴|化神))/gu;

const RELATION_MARKERS = [
  "师父",
  "师尊",
  "老师",
  "导师",
  "学生",
  "弟子",
  "同伴",
  "朋友",
  "兄弟",
  "姐妹",
  "父亲",
  "母亲",
  "儿子",
  "女儿",
  "妻子",
  "丈夫",
  "上司",
  "下属",
  "队长",
  "敌人",
  "对手",
  "盟友",
  "交易",
  "背叛",
  "追杀",
  "合作",
  "保护",
  "命令"
];

const TRAILING_ENTITY_NOISE = [
  "微微",
  "轻轻",
  "呵呵",
  "嘿嘿",
  "点了",
  "摇了",
  "笑着",
  "笑了",
  "微笑",
  "微",
  "失",
  "失声",
  "下意识",
  "忽然",
  "感",
  "平和",
  "礼貌",
  "摇头",
  "哈哈",
  "娇",
  "苦",
  "冷",
  "也",
  "含",
  "询",
  "询问",
  "反",
  "轻",
  "又",
  "对",
  "便",
  "还",
  "想了想",
  "想想",
  "疑惑地",
  "好笑地",
  "认真地",
  "平静地",
  "沉默地",
  "继续",
  "一边",
  "于是",
  "说着"
];

export async function runDeepDeconstruction(rawOptions: DeepRunOptions): Promise<string> {
  const chunkSize = Number.parseInt(String(rawOptions.segmentSize ?? 20), 10);
  const runDir = await prepareDeconstructionRun({
    ...rawOptions,
    mode: "长程分段拆书",
    segmentSize: chunkSize
  });
  const meta = JSON.parse(await readText(path.join(runDir, "meta.json"))) as {
    bookDir: string;
    bookSourceFile: string;
    title?: string;
    targetLibrary: "全局素材库" | "单书专属素材库";
    project?: string;
  };

  const text = await readSourceText(meta.bookSourceFile);
  const chapters = parseChapters(text);
  if (chapters.length === 0) {
    throw new Error(`未解析到章节标题：${meta.bookSourceFile}`);
  }

  const title = meta.title ?? path.basename(meta.bookSourceFile);
  const chunks = buildChunks(chapters, chunkSize);
  await writeAgentChunkTasks(runDir, title, chunks);
  if (rawOptions.agentCommand) {
    await runAgentCommand(rawOptions.agentCommand, path.join(runDir, "input", "agent-chunks"), path.join(runDir, "output", "agent-chunks"));
  }
  const agentChunks = await readAgentChunks(path.join(runDir, "output", "agent-chunks"));
  if ((rawOptions.agentMode ?? "fallback") === "required" && agentChunks.length < chunks.length) {
    throw new Error(`子 Agent 精读结果不足：${agentChunks.length}/${chunks.length}`);
  }
  const book = extractDeepBook(title, chapters, chunks, agentChunks);
  const audit = auditDeepBook(book);

  await cleanDeepOutputs(meta.bookDir);
  await writeDeepBookOutputs(meta.bookDir, book, audit);
  await writeDeepRunOutputs(runDir, meta.bookDir, book, audit, meta.targetLibrary, meta.project);

  await applyDeconstructionRun(runDir);
  return runDir;
}

async function readSourceText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const utf8Text = new TextDecoder("utf-8").decode(buffer).replace(/\r\n/g, "\n");
  if (hasChapterTitles(utf8Text)) {
    return utf8Text;
  }
  return new TextDecoder("gb18030").decode(buffer).replace(/\r\n/g, "\n");
}

function hasChapterTitles(text: string): boolean {
  CHAPTER_TITLE_PATTERN.lastIndex = 0;
  const matched = CHAPTER_TITLE_PATTERN.test(text);
  CHAPTER_TITLE_PATTERN.lastIndex = 0;
  return matched;
}

function parseChapters(text: string): Chapter[] {
  CHAPTER_TITLE_PATTERN.lastIndex = 0;
  const matches = [...text.matchAll(CHAPTER_TITLE_PATTERN)];
  CHAPTER_TITLE_PATTERN.lastIndex = 0;
  return matches.map((match, idx) => {
    const start = match.index ?? 0;
    const end = idx + 1 < matches.length ? matches[idx + 1].index ?? text.length : text.length;
    return {
      index: idx + 1,
      title: match[0].trim(),
      text: text.slice(start + match[0].length, end).trim()
    };
  });
}

function buildChunks(chapters: Chapter[], chunkSize: number): Chunk[] {
  const chunks: Chunk[] = [];
  for (let start = 0; start < chapters.length; start += chunkSize) {
    const slice = chapters.slice(start, start + chunkSize);
    chunks.push({
      index: chunks.length + 1,
      start: slice[0]?.index ?? 0,
      end: slice.at(-1)?.index ?? 0,
      chapters: slice
    });
  }
  return chunks;
}

function extractDeepBook(title: string, chapters: Chapter[], chunks: Chunk[], agentChunks: AgentChunk[]): DeepBook {
  const characters = new Map<string, EntityRecord>();
  const organizations = new Map<string, EntityRecord>();
  const locations = new Map<string, EntityRecord>();
  const systems = new Map<string, EntityRecord>();
  const relations = new Map<string, RelationRecord>();
  const chunkSummaries: DeepBook["chunkSummaries"] = [];
  const agentChunkMap = new Map(agentChunks.map((chunk) => [chunk.chunk, chunk]));

  for (const chunk of chunks) {
    const chunkCharacters = new Set<string>();
    const chunkOrganizations = new Set<string>();
    const chunkLocations = new Set<string>();
    const chunkSystems = new Set<string>();

    for (const chapter of chunk.chapters) {
      const chapterText = normalizeText(`${chapter.title}\n${chapter.text}`);
      collectPatternEntities(chapterText, PERSON_PATTERNS, characters, chapter.index, "人物行为/发言");
      collectChineseNameCandidates(chapterText, characters, chapter.index);
      collectPatternEntities(chapterText, [ORGANIZATION_PATTERN], organizations, chapter.index, "组织名词");
      collectPatternEntities(chapterText, [LOCATION_PATTERN], locations, chapter.index, "地图名词");
      collectPatternEntities(chapterText, [SYSTEM_PATTERN], systems, chapter.index, "体系名词");

      for (const name of entitiesInChapter(chapterText, characters, 150)) {
        chunkCharacters.add(name);
      }
      for (const name of entitiesInChapter(chapterText, organizations, 80)) {
        chunkOrganizations.add(name);
      }
      for (const name of entitiesInChapter(chapterText, locations, 80)) {
        chunkLocations.add(name);
      }
      for (const name of entitiesInChapter(chapterText, systems, 80)) {
        chunkSystems.add(name);
      }
    }

    const agentChunk = agentChunkMap.get(chunk.index);
    if (agentChunk) {
      mergeAgentChunk(agentChunk, characters, relations, organizations, locations, systems, chunk.start, chunk.end);
      for (const item of agentChunk.characters) {
        chunkCharacters.add(item.name);
      }
      for (const item of agentChunk.organizations) {
        chunkOrganizations.add(item.name);
      }
      for (const item of agentChunk.locations) {
        chunkLocations.add(item.name);
      }
      for (const item of agentChunk.systems) {
        chunkSystems.add(item.name);
      }
    }

    chunkSummaries.push({
      chunk: chunk.index,
      range: `第 ${chunk.start}-${chunk.end} 章`,
      characters: [...chunkCharacters].slice(0, 30),
      organizations: [...chunkOrganizations].slice(0, 20),
      locations: [...chunkLocations].slice(0, 20),
      systems: [...chunkSystems].slice(0, 20)
    });
  }

  const topCharacters = summarizeEntities(characters, 180);
  buildRelations(chapters, topCharacters.slice(0, 120).map((item) => item.name), relations);

  return {
    title,
    chapterCount: chapters.length,
    chunkCount: chunks.length,
    characters: topCharacters,
    relations: summarizeRelations(relations, 220),
    organizations: summarizeEntities(organizations, 120),
    locations: summarizeEntities(locations, 120),
    systems: summarizeEntities(systems, 140),
    chunkSummaries
  };
}

async function writeAgentChunkTasks(runDir: string, title: string, chunks: Chunk[]): Promise<void> {
  const taskDir = path.join(runDir, "input", "agent-chunks");
  await rm(taskDir, { force: true, recursive: true });
  await Promise.all(
    chunks.map((chunk) => {
      const task = renderAgentChunkTask(title, chunk);
      return writeText(path.join(taskDir, `${String(chunk.index).padStart(4, "0")}.md`), task);
    })
  );
  await writeText(
    path.join(runDir, "output", "agent-chunks", "README.md"),
    `# 子 Agent 精读输出目录

每个子 Agent 读取 \`runs/<run-id>/input/agent-chunks/NNNN.md\`，并把同名 JSON 写入本目录，例如 \`0001.json\`。

如果使用 \`--agent-command\`，命令会收到两个环境变量：

- \`AUTHOR_MENTOR_AGENT_INPUT_DIR\`
- \`AUTHOR_MENTOR_AGENT_OUTPUT_DIR\`
`
  );
}

function renderAgentChunkTask(title: string, chunk: Chunk): string {
  return `# 子 Agent 精读任务：《${title}》第 ${chunk.start}-${chunk.end} 章

你是长篇网文拆书子 Agent。请完整阅读下面正文片段，输出严格 JSON，不要输出 Markdown，不要复述原文长段。

## 输出 JSON schema

\`\`\`json
{
  "chunk": ${chunk.index},
  "range": "第 ${chunk.start}-${chunk.end} 章",
  "characters": [
    {"name": "人物名", "role": "身份/功能", "evidence": "章节证据摘要", "relationHints": ["关系线索"]}
  ],
  "relations": [
    {"source": "人物A", "target": "人物B", "relation": "关系类型", "evidence": "章节证据摘要"}
  ],
  "organizations": [
    {"name": "势力/组织名", "description": "组织功能", "evidence": "章节证据摘要"}
  ],
  "locations": [
    {"name": "地点/地图名", "description": "空间层级/功能", "evidence": "章节证据摘要"}
  ],
  "systems": [
    {"name": "能力/资源/规则名", "category": "能力/资源/规则/禁忌", "rule": "运行规则", "evidence": "章节证据摘要"}
  ],
  "events": [
    {"name": "关键事件", "evidence": "章节证据摘要", "impact": "后续影响"}
  ]
}
\`\`\`

## 质量要求

- 每个条目必须来自本 chunk 正文，不能凭全书常识补。
- 人物要列主要出场人物、身份变化、关系变化，不要把动作、副词、职业泛称当人物。
- 关系边必须写清关系类型，例如师徒、同伴、敌对、交易、上下级、亲属、暧昧、组织同盟。
- 设定条目要记录运行规则、代价或限制，不要只写名词。
- evidence 是摘要，不要复制超过 20 个连续原文字。

## 正文

${chunk.chapters.map((chapter) => `\n### ${chapter.index}. ${chapter.title}\n\n${chapter.text}`).join("\n")}
`;
}

async function runAgentCommand(command: string, inputDir: string, outputDir: string): Promise<void> {
  await writeText(path.join(outputDir, ".gitkeep"), "");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTHOR_MENTOR_AGENT_INPUT_DIR: inputDir,
        AUTHOR_MENTOR_AGENT_OUTPUT_DIR: outputDir
      },
      shell: true,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`子 Agent 命令退出码：${code}`));
    });
  });
}

async function readAgentChunks(dir: string): Promise<AgentChunk[]> {
  try {
    await stat(dir);
  } catch {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const chunks: AgentChunk[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    try {
      const parsed = JSON.parse(await readText(path.join(dir, entry.name))) as AgentChunk;
      if (Number.isInteger(parsed.chunk)) {
        chunks.push(normalizeAgentChunk(parsed));
      }
    } catch {
      // Invalid chunk outputs are ignored and surfaced by audit coverage.
    }
  }
  return chunks.sort((a, b) => a.chunk - b.chunk);
}

function normalizeAgentChunk(chunk: AgentChunk): AgentChunk {
  return {
    chunk: chunk.chunk,
    range: chunk.range ?? `第 ${chunk.chunk} 个 chunk`,
    characters: Array.isArray(chunk.characters) ? chunk.characters.filter((item) => isUsefulEntityName(item.name)) : [],
    relations: Array.isArray(chunk.relations) ? chunk.relations.filter((item) => isUsefulEntityName(item.source) && isUsefulEntityName(item.target)) : [],
    organizations: Array.isArray(chunk.organizations) ? chunk.organizations.filter((item) => isUsefulEntityName(item.name)) : [],
    locations: Array.isArray(chunk.locations) ? chunk.locations.filter((item) => isUsefulEntityName(item.name)) : [],
    systems: Array.isArray(chunk.systems) ? chunk.systems.filter((item) => isUsefulEntityName(item.name)) : [],
    events: Array.isArray(chunk.events) ? chunk.events : []
  };
}

function mergeAgentChunk(
  chunk: AgentChunk,
  characters: Map<string, EntityRecord>,
  relations: Map<string, RelationRecord>,
  organizations: Map<string, EntityRecord>,
  locations: Map<string, EntityRecord>,
  systems: Map<string, EntityRecord>,
  startChapter: number,
  endChapter: number
): void {
  const chapter = startChapter;
  for (const item of chunk.characters) {
    addEntity(characters, item.name, chapter, markerFromEvidence("子Agent人物", item.role, item.evidence));
  }
  for (const item of chunk.organizations) {
    addEntity(organizations, item.name, chapter, markerFromEvidence("子Agent组织", item.description, item.evidence));
  }
  for (const item of chunk.locations) {
    addEntity(locations, item.name, chapter, markerFromEvidence("子Agent地图", item.description, item.evidence));
  }
  for (const item of chunk.systems) {
    addEntity(systems, item.name, chapter, markerFromEvidence("子Agent体系", item.category, item.rule ?? item.evidence));
  }
  for (const item of chunk.relations) {
    addRelation(relations, item.source, item.target, chapter, [markerFromEvidence(item.relation, `第 ${startChapter}-${endChapter} 章`, item.evidence)]);
  }
}

function markerFromEvidence(prefix: string, detail: string | undefined, evidence: string | undefined): string {
  const parts = [prefix, detail, evidence].filter((item): item is string => Boolean(item && item.trim().length > 0));
  return parts.join("：").slice(0, 80);
}

function collectPatternEntities(
  text: string,
  patterns: RegExp[],
  target: Map<string, EntityRecord>,
  chapter: number,
  marker: string
): void {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]?.trim();
      const name = normalizeEntityName(raw);
      if (!isUsefulEntityName(name)) {
        continue;
      }
      addEntity(target, name, chapter, marker);
    }
  }
}

function collectChineseNameCandidates(text: string, target: Map<string, EntityRecord>, chapter: number): void {
  for (const surname of COMPOUND_SURNAMES) {
    const pattern = new RegExp(`${surname}[\\p{Script=Han}]{1,2}`, "gu");
    for (const match of text.matchAll(pattern)) {
      const name = normalizeEntityName(match[0]);
      if (isUsefulNameCandidate(name)) {
        addEntity(target, name, chapter, "姓名候选");
      }
    }
  }

  const singlePattern = new RegExp(`[${SINGLE_SURNAMES}][\\p{Script=Han}]{1,2}`, "gu");
  for (const match of text.matchAll(singlePattern)) {
    const name = normalizeEntityName(match[0]);
    if (isUsefulNameCandidate(name)) {
      addEntity(target, name, chapter, "姓名候选");
    }
  }
}

function isUsefulNameCandidate(name: string): boolean {
  if (!isUsefulEntityName(name)) {
    return false;
  }
  if (/[的是了不着过里上中下这那和都很又再才就把被给从到向为与于]/.test(name)) {
    return false;
  }
  return true;
}

function entitiesInChapter(text: string, source: Map<string, EntityRecord>, limit: number): string[] {
  return [...source.values()]
    .filter((record) => record.mentions >= 2 && text.includes(record.name))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit)
    .map((record) => record.name);
}

function buildRelations(chapters: Chapter[], characterNames: string[], target: Map<string, RelationRecord>): void {
  for (const chapter of chapters) {
    const paragraphs = splitParagraphs(chapter.text);
    for (const paragraph of paragraphs) {
      const appeared = characterNames.filter((name) => paragraph.includes(name)).slice(0, 6);
      if (appeared.length < 2) {
        continue;
      }
      const markers = RELATION_MARKERS.filter((marker) => paragraph.includes(marker));
      for (let i = 0; i < appeared.length; i += 1) {
        for (let j = i + 1; j < appeared.length; j += 1) {
          addRelation(target, appeared[i], appeared[j], chapter.index, markers.length > 0 ? markers : ["同章共现"]);
        }
      }
    }
  }
}

function addEntity(target: Map<string, EntityRecord>, name: string, chapter: number, marker: string): void {
  const record = target.get(name) ?? { name, mentions: 0, chapters: new Set<number>(), markers: new Map<string, number>() };
  record.mentions += 1;
  record.chapters.add(chapter);
  record.markers.set(marker, (record.markers.get(marker) ?? 0) + 1);
  target.set(name, record);
}

function addRelation(
  target: Map<string, RelationRecord>,
  source: string,
  targetName: string,
  chapter: number,
  markers: string[]
): void {
  const [a, b] = [source, targetName].sort();
  const key = `${a}--${b}`;
  const record = target.get(key) ?? { source: a, target: b, mentions: 0, chapters: new Set<number>(), markers: new Map<string, number>() };
  record.mentions += 1;
  record.chapters.add(chapter);
  for (const marker of markers) {
    record.markers.set(marker, (record.markers.get(marker) ?? 0) + 1);
  }
  target.set(key, record);
}

function summarizeEntities(source: Map<string, EntityRecord>, limit: number): EntitySummary[] {
  return [...source.values()]
    .filter((record) => record.mentions >= 2)
    .map((record) => {
      const chapters = [...record.chapters].sort((a, b) => a - b);
      return {
        name: record.name,
        mentions: record.mentions,
        firstChapter: chapters[0] ?? 0,
        lastChapter: chapters.at(-1) ?? 0,
        chapterCount: chapters.length,
        markers: topMarkers(record.markers, 8)
      };
    })
    .sort((a, b) => b.chapterCount - a.chapterCount || b.mentions - a.mentions)
    .slice(0, limit);
}

function summarizeRelations(source: Map<string, RelationRecord>, limit: number): RelationSummary[] {
  return [...source.values()]
    .filter((record) => record.mentions >= 2)
    .map((record) => {
      const chapters = [...record.chapters].sort((a, b) => a - b);
      return {
        source: record.source,
        target: record.target,
        mentions: record.mentions,
        firstChapter: chapters[0] ?? 0,
        lastChapter: chapters.at(-1) ?? 0,
        markers: topMarkers(record.markers, 8)
      };
    })
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}

function topMarkers(markers: Map<string, number>, limit: number): string[] {
  return [...markers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([marker, count]) => `${marker}(${count})`);
}

function auditDeepBook(book: DeepBook): AuditItem[] {
  const minCharacters = Math.max(20, Math.min(80, Math.floor(book.chapterCount / 20)));
  const minOrganizations = Math.max(6, Math.min(30, Math.floor(book.chapterCount / 80)));
  const minLocations = Math.max(6, Math.min(30, Math.floor(book.chapterCount / 80)));
  const minSystems = Math.max(8, Math.min(40, Math.floor(book.chapterCount / 60)));
  const coveredChunks = book.chunkSummaries.filter(
    (chunk) => chunk.characters.length + chunk.organizations.length + chunk.locations.length + chunk.systems.length > 0
  ).length;
  const coverage = book.chunkCount === 0 ? 0 : coveredChunks / book.chunkCount;
  const noisyCharacters = book.characters.filter((item) => looksNoisyCharacterName(item.name)).length;
  const noiseRate = book.characters.length === 0 ? 0 : noisyCharacters / book.characters.length;

  return [
    auditCount("人物数量", book.characters.length, minCharacters),
    auditCount("关系边数量", book.relations.length, Math.max(20, minCharacters)),
    auditCount("势力组织数量", book.organizations.length, minOrganizations),
    auditCount("地图地点数量", book.locations.length, minLocations),
    auditCount("能力/资源/规则数量", book.systems.length, minSystems),
    {
      name: "全书 chunk 覆盖率",
      status: coverage >= 0.85 ? "通过" : "需返工",
      detail: `覆盖 ${coveredChunks}/${book.chunkCount} 个 chunk，覆盖率 ${(coverage * 100).toFixed(1)}%。`
    },
    {
      name: "人物噪声率",
      status: noiseRate <= 0.12 ? "通过" : "需返工",
      detail: `疑似动作/语气噪声 ${noisyCharacters}/${book.characters.length}，噪声率 ${(noiseRate * 100).toFixed(1)}%。`
    }
  ];
}

function auditCount(name: string, actual: number, expected: number): AuditItem {
  return {
    name,
    status: actual >= expected ? "通过" : "需返工",
    detail: `实际 ${actual}，最低要求 ${expected}。`
  };
}

async function cleanDeepOutputs(bookDir: string): Promise<void> {
  await Promise.all(
    [
      "深拆总报告.md",
      "人物与关系图.md",
      "势力与组织图谱.md",
      "地图与世界结构.md",
      "修炼能力与资源体系.md",
      "深拆质量审计.md",
      "深拆中间数据.json"
    ].map((file) => rm(path.join(bookDir, file), { force: true }))
  );
}

async function writeDeepBookOutputs(bookDir: string, book: DeepBook, audit: AuditItem[]): Promise<void> {
  await Promise.all([
    writeText(path.join(bookDir, "深拆总报告.md"), renderDeepReport(book, audit)),
    writeText(path.join(bookDir, "人物与关系图.md"), renderCharacterGraph(book)),
    writeText(path.join(bookDir, "势力与组织图谱.md"), renderEntityFile(book.title, "势力与组织图谱", book.organizations, "势力/组织")),
    writeText(path.join(bookDir, "地图与世界结构.md"), renderEntityFile(book.title, "地图与世界结构", book.locations, "地点/地图层级")),
    writeText(path.join(bookDir, "修炼能力与资源体系.md"), renderEntityFile(book.title, "修炼能力与资源体系", book.systems, "能力/资源/规则")),
    writeText(path.join(bookDir, "深拆质量审计.md"), renderAudit(book, audit)),
    writeText(path.join(bookDir, "深拆中间数据.json"), JSON.stringify(toJsonBook(book, audit), null, 2))
  ]);
}

function renderDeepReport(book: DeepBook, audit: AuditItem[]): string {
  return `# 深拆总报告：《${book.title}》

## 执行范围

- 章节数：${book.chapterCount}
- 分块数：${book.chunkCount}
- 人物候选：${book.characters.length}
- 关系边候选：${book.relations.length}
- 势力组织候选：${book.organizations.length}
- 地图地点候选：${book.locations.length}
- 能力/资源/规则候选：${book.systems.length}

## 方法说明

本次深拆不再只读取章节标题或章节开头，而是扫描全本正文，按 chunk 沉淀结构化中间数据，再合并生成全书级报告。当前版本是脚本强约束的第一版，负责保证全本覆盖、证据章节和数量审计；后续可以把每个 chunk 的 JSON 抽取替换为子 Agent 精读。

## 审计结果

${audit.map((item) => `- ${item.name}：${item.status}。${item.detail}`).join("\n")}

## 主要入口文件

- \`人物与关系图.md\`
- \`势力与组织图谱.md\`
- \`地图与世界结构.md\`
- \`修炼能力与资源体系.md\`
- \`深拆中间数据.json\`
`;
}

function renderCharacterGraph(book: DeepBook): string {
  const topCharacters = book.characters.slice(0, 100);
  const topRelations = book.relations.slice(0, 160);
  const graphRelations = book.relations.slice(0, 35);
  return `# 人物与关系图：《${book.title}》

## 人物表

${topCharacters
  .map(
    (item, index) => `### ${index + 1}. ${item.name}

- 出现次数：${item.mentions}
- 覆盖章节数：${item.chapterCount}
- 首次出现：第 ${item.firstChapter} 章
- 最后出现：第 ${item.lastChapter} 章
- 身份/行为线索：${item.markers.join("、") || "需二次精读补充"}
`
  )
  .join("\n")}

## 关系边

${topRelations
  .map(
    (item) =>
      `- ${item.source} <-> ${item.target}：共现 ${item.mentions} 次，覆盖第 ${item.firstChapter}-${item.lastChapter} 章，关系线索：${item.markers.join("、") || "同章共现"}`
  )
  .join("\n")}

## Mermaid 关系草图

\`\`\`mermaid
graph TD
${graphRelations.map((item) => `  ${safeMermaidId(item.source)}["${item.source}"] --> ${safeMermaidId(item.target)}["${item.target}"]`).join("\n")}
\`\`\`
`;
}

function renderEntityFile(title: string, fileTitle: string, entities: EntitySummary[], label: string): string {
  return `# ${fileTitle}：《${title}》

## ${label}列表

${entities
  .slice(0, 120)
  .map(
    (item, index) => `### ${index + 1}. ${item.name}

- 出现次数：${item.mentions}
- 覆盖章节数：${item.chapterCount}
- 首次出现：第 ${item.firstChapter} 章
- 最后出现：第 ${item.lastChapter} 章
- 识别线索：${item.markers.join("、") || "需二次精读补充"}
- 后续精读任务：补全定义、运行规则、关联人物/势力、阶段变化、代价限制和复用边界。
`
  )
  .join("\n")}
`;
}

function renderAudit(book: DeepBook, audit: AuditItem[]): string {
  return `# 深拆质量审计：《${book.title}》

## 自动审计

${audit.map((item) => `- ${item.name}：${item.status}。${item.detail}`).join("\n")}

## 仍需返工的方向

- 当前脚本已全本扫描，但人物识别仍是启发式，下一步应接入 chunk 子 Agent 精读，按章节证据补全别名、身份和关系类型。
- 如果某本书人物表缺少明显主角或核心配角，应在 \`深拆中间数据.json\` 中检查对应章节 chunk，再做人工或 Agent 返工。
- 最终报告禁止只保留模板句，必须能追溯到首次出现章节、活跃章节范围和关系证据。
`;
}

async function writeDeepRunOutputs(
  runDir: string,
  bookDir: string,
  book: DeepBook,
  audit: AuditItem[],
  targetLibrary: "全局素材库" | "单书专属素材库",
  project?: string
): Promise<void> {
  await writeText(
    path.join(runDir, "output", "deconstruction-report.md"),
    `# 深拆运行报告

## 运行结果

- 持久拆书目录：${bookDir}
- 章节数：${book.chapterCount}
- 分块数：${book.chunkCount}
- 人物候选：${book.characters.length}
- 关系边候选：${book.relations.length}
- 势力组织候选：${book.organizations.length}
- 地图地点候选：${book.locations.length}
- 能力/资源/规则候选：${book.systems.length}

## 审计结果

${audit.map((item) => `- ${item.name}：${item.status}。${item.detail}`).join("\n")}
`
  );

  await writeText(
    path.join(runDir, "output", "material-updates.json"),
    JSON.stringify(
      {
        targetLibrary,
        project,
        items: [
          ...book.characters.slice(0, 20).map((item) => ({
            title: `${book.title}：人物-${item.name}`,
            summary: `深拆候选人物，覆盖第 ${item.firstChapter}-${item.lastChapter} 章，出现 ${item.mentions} 次，后续可用于人物关系和身份线精修。`,
            tags: ["深拆", "人物", "关系图"],
            source: `《${book.title}》深拆人物表`,
            reuseBoundary: "只复用人物功能、关系结构和身份变化，不复用原书人物名和可识别事件链。"
          })),
          ...book.organizations.slice(0, 10).map((item) => ({
            title: `${book.title}：势力-${item.name}`,
            summary: `深拆候选势力/组织，覆盖第 ${item.firstChapter}-${item.lastChapter} 章，出现 ${item.mentions} 次。`,
            tags: ["深拆", "势力", "组织"],
            source: `《${book.title}》深拆势力图谱`,
            reuseBoundary: "只复用组织功能和冲突位置，不复用原书势力名。"
          }))
        ]
      },
      null,
      2
    )
  );

  await writeText(
    path.join(runDir, "output", "change-record.md"),
    `# 深拆能力改动记录

- 能力：拆书能力
- 模式：deep-run 全本结构化深拆
- 章节数：${book.chapterCount}
- 分块数：${book.chunkCount}
- 持久拆书目录：${bookDir}

## 改动摘要

本次生成全本扫描后的深拆总报告、人物与关系图、势力与组织图谱、地图与世界结构、修炼能力与资源体系、深拆中间数据和质量审计。
`
  );
}

function toJsonBook(book: DeepBook, audit: AuditItem[]): Record<string, unknown> {
  return {
    title: book.title,
    chapterCount: book.chapterCount,
    chunkCount: book.chunkCount,
    audit,
    characters: book.characters,
    relations: book.relations,
    organizations: book.organizations,
    locations: book.locations,
    systems: book.systems,
    chunkSummaries: book.chunkSummaries
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, "\n");
}

function normalizeEntityName(input: string | undefined): string {
  let name = (input ?? "")
    .replace(/[“”"'『』《》（）()，。！？、；：\s]/g, "")
    .replace(/^第[一二三四五六七八九十百千万零〇两0-9]+章/, "")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const noise of TRAILING_ENTITY_NOISE) {
      if (name.endsWith(noise)) {
        name = name.slice(0, -noise.length);
        changed = true;
      }
    }
  }
  return name;
}

function isUsefulEntityName(name: string): boolean {
  if (name.length < 2 || name.length > 12) {
    return false;
  }
  if (/^\d+$/.test(name) || /[章节年月日点分秒]/.test(name.slice(0, 2))) {
    return false;
  }
  return !looksNoisyCharacterName(name);
}

function looksNoisyCharacterName(name: string): boolean {
  if (STOP_ENTITY_PARTS.some((part) => name === part || name.includes(part))) {
    return true;
  }
  if (/[地的声]$/.test(name)) {
    return true;
  }
  if (/^(他|她|它|这|那|只|很|更|最|又|也|再|才|就)/.test(name)) {
    return true;
  }
  return false;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12);
}

function safeMermaidId(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `n${hash.toString(16)}`;
}
