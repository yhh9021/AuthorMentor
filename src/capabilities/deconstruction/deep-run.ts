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

type RelationGroup = "敌对/矛盾" | "同盟/合作" | "师徒/上下级" | "亲属/情感" | "交易/利用" | "普通共现";

type SemanticRelationSummary = RelationSummary & {
  group: RelationGroup;
  relationType: string;
  confidence: "高" | "中" | "低";
};

type CharacterRoleSummary = {
  name: string;
  role: string;
  reason: string;
  firstChapter: number;
  lastChapter: number;
  confidence: "高" | "中" | "低";
};

type EventSummary = {
  name: string;
  chunk: number;
  range: string;
  evidence: string;
  impact?: string;
};

type HighlightSummary = {
  title: string;
  chunk: number;
  range: string;
  plot: string;
  setup: string;
  conflict: string;
  payoff: string;
  impact: string;
  reusableMechanism: string;
  reuseBoundary: string;
  evidence: string;
};

type SettingInsightSummary = {
  name: string;
  category: string;
  chunk: number;
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

type MechanismSummary = {
  name: string;
  chunk: number;
  range: string;
  principle: string;
  implementation: string;
  appeal: string;
  rewriteMethod: string;
  failureRisk: string;
  evidence: string;
};

type DeepBook = {
  title: string;
  chapterCount: number;
  chunkCount: number;
  agentChunkCount: number;
  protagonist?: string;
  characters: EntitySummary[];
  characterRoles: CharacterRoleSummary[];
  relations: RelationSummary[];
  semanticRelations: SemanticRelationSummary[];
  organizations: EntitySummary[];
  locations: EntitySummary[];
  systems: EntitySummary[];
  events: EventSummary[];
  highlights: HighlightSummary[];
  settingInsights: SettingInsightSummary[];
  mechanisms: MechanismSummary[];
  chunkSummaries: Array<{
    chunk: number;
    range: string;
    characters: string[];
    organizations: string[];
    locations: string[];
    systems: string[];
    events: string[];
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
  highlights?: Array<{
    title: string;
    plot: string;
    setup: string;
    conflict: string;
    payoff: string;
    impact: string;
    reusableMechanism: string;
    reuseBoundary: string;
    evidence: string;
  }>;
  settingInsights?: Array<{
    name: string;
    category: string;
    definition: string;
    rule: string;
    cost: string;
    interfaces: string;
    evolution: string;
    reuseValue: string;
    reuseBoundary: string;
    evidence: string;
  }>;
  mechanisms?: Array<{
    name: string;
    principle: string;
    implementation: string;
    appeal: string;
    rewriteMethod: string;
    failureRisk: string;
    evidence: string;
  }>;
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
  "第三",
  "转而",
  "开口",
  "主动",
  "连忙",
  "明显",
  "万万",
  "何意",
  "方如此",
  "何如此",
  "斟酌着"
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

const NAME_CANDIDATE_NOISE = new Set([
  "东西",
  "时间",
  "关系",
  "查看",
  "解释",
  "厉害",
  "明白",
  "正常",
  "左右",
  "马上",
  "房间",
  "房间内",
  "房门",
  "边缘",
  "门口",
  "后面",
  "后者",
  "简单",
  "应该",
  "时间流",
  "时间内",
  "时间之",
  "段时间",
  "危险",
  "程度",
  "成功",
  "成果",
  "方法",
  "相信",
  "怀疑",
  "安静",
  "冷静",
  "周围",
  "方面",
  "任何一",
  "水准",
  "成员",
  "毕竟",
  "相比起",
  "后面精",
  "高阶魔",
  "古代魔",
  "高阶",
  "古代",
  "左手",
  "施展",
  "红衣主",
  "方教会",
  "高评议",
  "古怪",
  "周一求",
  "时可能",
  "时准备",
  "古代传",
  "解地问",
  "齐声回",
  "全大陆",
  "封印",
  "丰收公",
  "应该知",
  "东张西",
  "范围型",
  "白蜜糖",
  "高塔几",
  "左看右",
  "高阶以",
  "明明知",
  "习惯性",
  "相对论",
  "广义相",
  "施法材",
  "冷汗",
  "习魔法",
  "转而",
  "开口",
  "主动",
  "连忙",
  "明显",
  "万万",
  "何意",
  "方如此",
  "何如此",
  "安利号",
  "尚书台",
  "斟酌着",
  "陈莫白开口",
  "许青所",
  "许青凝",
  "许青知",
  "许青而",
  "许青有",
  "许青想",
  "李源笑",
  "李源连",
  "毕竟他",
  "越来越",
  "莫名其",
  "微斟酌",
  "松了口",
  "能看到",
  "能不能",
  "都不敢",
  "都不知",
  "胡思乱",
  "连忙抬",
  "方天地",
  "应道",
  "武夫",
  "师父",
  "徒弟",
  "和尚",
  "老板",
  "谢公子",
  "谢大哥",
  "郭姐姐",
  "步姐姐",
  "叶姐姐",
  "南宫掌",
  "宫掌门",
  "南宫烨见",
  "宫烨见",
  "长宁郡",
  "宁郡主",
  "房东太",
  "太后娘",
  "后娘娘",
  "巫教之",
  "巫教妖",
  "龙骨滩",
  "阴阳尺",
  "正伦剑",
  "白毛仙",
  "苏大仙",
  "武神",
  "司空老"
]);

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
  "矛盾",
  "冲突",
  "仇",
  "盟友",
  "交易",
  "交换",
  "雇佣",
  "委托",
  "利用",
  "试探",
  "背叛",
  "追杀",
  "围攻",
  "镇压",
  "威胁",
  "争夺",
  "合作",
  "保护",
  "救",
  "帮助",
  "支援",
  "同行",
  "命令",
  "宗主",
  "掌门",
  "长老",
  "亲人",
  "兄长",
  "妹妹",
  "喜欢",
  "暧昧"
];

const TRAILING_ENTITY_NOISE = [
  "微微",
  "轻轻",
  "心",
  "目",
  "身",
  "眼",
  "暗",
  "抬",
  "看",
  "沉",
  "在",
  "神",
  "没",
  "已",
  "道",
  "笑",
  "开口",
  "所",
  "凝",
  "知",
  "而",
  "有",
  "想",
  "连",
  "一",
  "却",
  "忽",
  "当",
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

const NON_PERSON_CANDIDATE_PARTS = [
  "时间",
  "危险",
  "程度",
  "成功",
  "成果",
  "方法",
  "相信",
  "怀疑",
  "安静",
  "冷静",
  "周围",
  "方面",
  "任何",
  "水准",
  "成员",
  "相比",
  "后面",
  "后者",
  "毕竟",
  "房间",
  "房门",
  "边缘",
  "左手",
  "右手",
  "声音",
  "目光",
  "身体",
  "问题",
  "情况",
  "东西",
  "感觉",
  "名字",
  "地方"
];

const RELATION_GROUP_MARKERS: Record<RelationGroup, string[]> = {
  "敌对/矛盾": ["敌人", "对手", "追杀", "背叛", "矛盾", "冲突", "仇", "杀", "围攻", "镇压", "威胁", "争夺"],
  "同盟/合作": ["同伴", "朋友", "兄弟", "姐妹", "盟友", "合作", "保护", "救", "帮助", "支援", "同行"],
  "师徒/上下级": ["师父", "师尊", "老师", "导师", "学生", "弟子", "上司", "下属", "队长", "命令", "宗主", "掌门", "长老"],
  "亲属/情感": ["父亲", "母亲", "儿子", "女儿", "妻子", "丈夫", "亲人", "兄长", "妹妹", "喜欢", "暧昧"],
  "交易/利用": ["交易", "交换", "雇佣", "委托", "利用", "试探"],
  "普通共现": ["同章共现"]
};

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
  const events: EventSummary[] = [];
  const highlights: HighlightSummary[] = [];
  const settingInsights: SettingInsightSummary[] = [];
  const mechanisms: MechanismSummary[] = [];
  const chunkSummaries: DeepBook["chunkSummaries"] = [];
  const agentChunkMap = new Map(agentChunks.map((chunk) => [chunk.chunk, chunk]));

  for (const chunk of chunks) {
    const chunkCharacters = new Set<string>();
    const chunkOrganizations = new Set<string>();
    const chunkLocations = new Set<string>();
    const chunkSystems = new Set<string>();
    const chunkEvents = new Set<string>();

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
      for (const item of agentChunk.events) {
        if (!item.name || !item.evidence) {
          continue;
        }
        chunkEvents.add(item.name);
        events.push({
          name: item.name,
          chunk: chunk.index,
          range: agentChunk.range ?? `第 ${chunk.start}-${chunk.end} 章`,
          evidence: item.evidence,
          impact: item.impact
        });
      }
      for (const item of agentChunk.highlights ?? []) {
        if (!isCompleteHighlight(item)) {
          continue;
        }
        highlights.push({
          title: item.title,
          chunk: chunk.index,
          range: agentChunk.range ?? `第 ${chunk.start}-${chunk.end} 章`,
          plot: item.plot,
          setup: item.setup,
          conflict: item.conflict,
          payoff: item.payoff,
          impact: item.impact,
          reusableMechanism: item.reusableMechanism,
          reuseBoundary: item.reuseBoundary,
          evidence: item.evidence
        });
      }
      for (const item of agentChunk.settingInsights ?? []) {
        if (!isCompleteSettingInsight(item)) {
          continue;
        }
        settingInsights.push({
          name: item.name,
          category: item.category,
          chunk: chunk.index,
          range: agentChunk.range ?? `第 ${chunk.start}-${chunk.end} 章`,
          definition: item.definition,
          rule: item.rule,
          cost: item.cost,
          interfaces: item.interfaces,
          evolution: item.evolution,
          reuseValue: item.reuseValue,
          reuseBoundary: item.reuseBoundary,
          evidence: item.evidence
        });
      }
      for (const item of agentChunk.mechanisms ?? []) {
        if (!isCompleteMechanism(item)) {
          continue;
        }
        mechanisms.push({
          name: item.name,
          chunk: chunk.index,
          range: agentChunk.range ?? `第 ${chunk.start}-${chunk.end} 章`,
          principle: item.principle,
          implementation: item.implementation,
          appeal: item.appeal,
          rewriteMethod: item.rewriteMethod,
          failureRisk: item.failureRisk,
          evidence: item.evidence
        });
      }
    }

    chunkSummaries.push({
      chunk: chunk.index,
      range: `第 ${chunk.start}-${chunk.end} 章`,
      characters: [...chunkCharacters].slice(0, 30),
      organizations: [...chunkOrganizations].slice(0, 20),
      locations: [...chunkLocations].slice(0, 20),
      systems: [...chunkSystems].slice(0, 20),
      events: [...chunkEvents].slice(0, 20)
    });
  }

  pruneCharacterEntities(characters, organizations, locations, systems);
  const topCharacters = summarizeEntities(characters, 180);
  buildRelations(chapters, topCharacters.slice(0, 120).map((item) => item.name), relations);
  const summarizedRelations = summarizeRelations(relations, 220);
  const protagonist = inferProtagonist(topCharacters);
  const semanticRelations = buildSemanticRelations(summarizedRelations);
  const characterRoles = buildCharacterRoles(topCharacters, semanticRelations, protagonist);

  return {
    title,
    chapterCount: chapters.length,
    chunkCount: chunks.length,
    agentChunkCount: agentChunks.length,
    protagonist,
    characters: topCharacters,
    characterRoles,
    relations: summarizedRelations,
    semanticRelations,
    organizations: summarizeEntities(organizations, 120),
    locations: summarizeEntities(locations, 120),
    systems: summarizeEntities(systems, 140),
    events: events.slice(0, 500),
    highlights: highlights.slice(0, 120),
    settingInsights: settingInsights.slice(0, 160),
    mechanisms: mechanisms.slice(0, 120),
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
  ],
  "highlights": [
    {
      "title": "高光片段名",
      "plot": "这一段具体发生了什么，写清事件链，不要只写功能",
      "setup": "前置铺垫",
      "conflict": "冲突设计、限制、对手或代价",
      "payoff": "当场兑现的爽点/情绪/资源/真相/身份变化",
      "impact": "后续影响",
      "reusableMechanism": "可复用写法机制",
      "reuseBoundary": "不可复用的专名、事件组合或表达",
      "evidence": "章节证据摘要"
    }
  ],
  "settingInsights": [
    {
      "name": "设定名",
      "category": "世界规则/能力体系/资源体系/组织势力/地图层级/人物身份/禁忌代价",
      "definition": "设定定义",
      "rule": "运行规则",
      "cost": "代价或限制",
      "interfaces": "关联人物/势力/资源/地图接口",
      "evolution": "本 chunk 内的首次出现、升级、反转或回收",
      "reuseValue": "为什么值得借鉴",
      "reuseBoundary": "复用边界",
      "evidence": "章节证据摘要"
    }
  ],
  "mechanisms": [
    {
      "name": "为什么好看的机制名",
      "principle": "机制原理",
      "implementation": "本 chunk 如何具体实现",
      "appeal": "为什么好看，读者获得什么期待或满足",
      "rewriteMethod": "改写到新书时怎么做",
      "failureRisk": "失败风险",
      "evidence": "章节证据摘要"
    }
  ]
}
\`\`\`

## 质量要求

- 每个条目必须来自本 chunk 正文，不能凭全书常识补。
- 人物要列主要出场人物、身份变化、关系变化，不要把动作、副词、职业泛称当人物。
- 关系边必须写清关系类型，例如师徒、同伴、敌对、交易、上下级、亲属、暧昧、组织同盟。
- 设定条目要记录运行规则、代价或限制，不要只写名词。
- highlights 只选本 chunk 内真正值得复用的桥段；必须写具体剧情过程、铺垫、兑现和后续影响。
- settingInsights 必须能进入后续 Story Bible；不能写成“某某设定很重要”。
- mechanisms 必须解释“为什么好看”和“如何改写”，不能只列标题。
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
    events: Array.isArray(chunk.events) ? chunk.events : [],
    highlights: Array.isArray(chunk.highlights) ? chunk.highlights.filter(isCompleteHighlight) : [],
    settingInsights: Array.isArray(chunk.settingInsights) ? chunk.settingInsights.filter(isCompleteSettingInsight) : [],
    mechanisms: Array.isArray(chunk.mechanisms) ? chunk.mechanisms.filter(isCompleteMechanism) : []
  };
}

function isCompleteHighlight(item: NonNullable<AgentChunk["highlights"]>[number]): boolean {
  return Boolean(
    item?.title &&
      item.plot &&
      item.setup &&
      item.conflict &&
      item.payoff &&
      item.impact &&
      item.reusableMechanism &&
      item.reuseBoundary &&
      item.evidence
  );
}

function isCompleteSettingInsight(item: NonNullable<AgentChunk["settingInsights"]>[number]): boolean {
  return Boolean(
    item?.name &&
      item.category &&
      item.definition &&
      item.rule &&
      item.cost &&
      item.interfaces &&
      item.evolution &&
      item.reuseValue &&
      item.reuseBoundary &&
      item.evidence
  );
}

function isCompleteMechanism(item: NonNullable<AgentChunk["mechanisms"]>[number]): boolean {
  return Boolean(
    item?.name &&
      item.principle &&
      item.implementation &&
      item.appeal &&
      item.rewriteMethod &&
      item.failureRisk &&
      item.evidence
  );
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
      if (isUsefulNameCandidate(name) && hasNameContext(text, match.index ?? 0, match[0].length)) {
        addEntity(target, name, chapter, "姓名候选");
      }
    }
  }

  const singlePattern = new RegExp(`[${SINGLE_SURNAMES}][\\p{Script=Han}]{1,2}`, "gu");
  for (const match of text.matchAll(singlePattern)) {
    const name = normalizeEntityName(match[0]);
    if (isUsefulNameCandidate(name) && hasNameContext(text, match.index ?? 0, match[0].length)) {
      addEntity(target, name, chapter, "姓名候选");
    }
  }
}

function isUsefulNameCandidate(name: string): boolean {
  if (!isUsefulEntityName(name)) {
    return false;
  }
  if (NAME_CANDIDATE_NOISE.has(name)) {
    return false;
  }
  if (/[的是了不着过里上中下这那和都很又再才就把被给从到向为与于]/.test(name)) {
    return false;
  }
  if (NON_PERSON_CANDIDATE_PARTS.some((part) => name.includes(part))) {
    return false;
  }
  return true;
}

function hasNameContext(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 12), index);
  const after = text.slice(index + length, index + length + 12);
  if (/^(?:说|问|笑|道|看|望|想|点头|摇头|皱眉|开口|低声|沉声|喊|叫|答|叹|走|站|坐|出手|杀|救|拜|跪|拿|伸|推|扶|转身|离开|进入)/.test(after)) {
    return true;
  }
  return /(?:叫|名|称|为|是|和|与|向|对|让|被|把|给|见|问|看见|望向|跟|随|拜见)$/.test(before);
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

function pruneCharacterEntities(
  characters: Map<string, EntityRecord>,
  organizations: Map<string, EntityRecord>,
  locations: Map<string, EntityRecord>,
  systems: Map<string, EntityRecord>
): void {
  for (const [name, record] of characters.entries()) {
    if (hasStrongPersonEvidence(record)) {
      continue;
    }
    if (looksNonPersonCandidate(name) || organizations.has(name) || locations.has(name) || systems.has(name)) {
      characters.delete(name);
    }
  }
}

function hasStrongPersonEvidence(record: EntityRecord): boolean {
  return markerCountFromMap(record.markers, "子Agent人物") > 0 || markerCountFromMap(record.markers, "人物行为/发言") >= 2;
}

function looksNonPersonCandidate(name: string): boolean {
  if (NAME_CANDIDATE_NOISE.has(name)) {
    return true;
  }
  if (NON_PERSON_CANDIDATE_PARTS.some((part) => name.includes(part))) {
    return true;
  }
  return /(?:之|内|中|上|下|前|后|里|外|起|来)$/.test(name);
}

function inferProtagonist(characters: EntitySummary[]): string | undefined {
  const explicit = characters.find((item) => item.markers.some((marker) => /主角|男主|主人公/.test(marker)));
  if (explicit) {
    return explicit.name;
  }
  return [...characters]
    .sort((a, b) => protagonistScore(b) - protagonistScore(a))
    [0]?.name;
}

function protagonistScore(character: EntitySummary): number {
  const agentScore = markerCountFromList(character.markers, "子Agent人物") * 1000;
  const behaviorScore = markerCountFromList(character.markers, "人物行为/发言") * 20;
  const earlyBonus = Math.max(0, 120 - character.firstChapter);
  const nameCandidatePenalty =
    markerCountFromList(character.markers, "姓名候选") > 0 && markerCountFromList(character.markers, "人物行为/发言") === 0 ? 120 : 0;
  return agentScore + behaviorScore + character.chapterCount + character.mentions / 10 + earlyBonus - nameCandidatePenalty;
}

function buildSemanticRelations(relations: RelationSummary[]): SemanticRelationSummary[] {
  return relations.map((relation) => {
    const group = classifyRelationGroup(relation.markers);
    return {
      ...relation,
      group,
      relationType: inferRelationType(group, relation.markers),
      confidence: inferRelationConfidence(group, relation.markers)
    };
  });
}

function classifyRelationGroup(markers: string[]): RelationGroup {
  const scores = relationGroupScores(markers);
  const ranked = ([...scores.entries()] as Array<[RelationGroup, number]>)
    .filter(([group]) => group !== "普通共现")
    .sort((a, b) => b[1] - a[1]);
  if ((ranked[0]?.[1] ?? 0) > 0) {
    return ranked[0][0];
  }
  return "普通共现";
}

function relationGroupScores(markers: string[]): Map<RelationGroup, number> {
  const scores = new Map<RelationGroup, number>();
  for (const group of Object.keys(RELATION_GROUP_MARKERS) as RelationGroup[]) {
    scores.set(group, 0);
  }
  for (const group of ["敌对/矛盾", "同盟/合作", "师徒/上下级", "亲属/情感", "交易/利用"] as RelationGroup[]) {
    for (const marker of markers) {
      const markerName = marker.replace(/\(\d+\)$/, "");
      if (RELATION_GROUP_MARKERS[group].some((expected) => markerName.includes(expected))) {
        scores.set(group, (scores.get(group) ?? 0) + markerWeight(marker));
      }
    }
  }
  return scores;
}

function inferRelationType(group: RelationGroup, markers: string[]): string {
  const matched = markers
    .map((marker) => ({ marker: marker.replace(/\(\d+\)$/, ""), weight: markerWeight(marker) }))
    .filter((item) => RELATION_GROUP_MARKERS[group].some((expected) => item.marker.includes(expected)))
    .sort((a, b) => b.weight - a.weight)[0]?.marker;
  if (matched && matched !== "同章共现") {
    return matched;
  }
  return group;
}

function inferRelationConfidence(group: RelationGroup, markers: string[]): "高" | "中" | "低" {
  if (markers.some((marker) => marker.includes("子Agent"))) {
    return "高";
  }
  if ((relationGroupScores(markers).get(group) ?? 0) >= 3) {
    return "中";
  }
  return "低";
}

function markerWeight(marker: string): number {
  const matched = marker.match(/\((\d+)\)$/);
  return matched ? Number.parseInt(matched[1], 10) : 1;
}

function markerCountFromMap(markers: Map<string, number>, key: string): number {
  return [...markers.entries()]
    .filter(([marker]) => marker.includes(key))
    .reduce((sum, [, count]) => sum + count, 0);
}

function markerCountFromList(markers: string[], key: string): number {
  return markers.filter((marker) => marker.includes(key)).reduce((sum, marker) => sum + markerWeight(marker), 0);
}

function buildCharacterRoles(
  characters: EntitySummary[],
  relations: SemanticRelationSummary[],
  protagonist: string | undefined
): CharacterRoleSummary[] {
  return characters.slice(0, 80).map((character) => {
    if (character.name === protagonist) {
      return {
        name: character.name,
        role: "主角候选",
        reason: `综合主角得分最高，覆盖第 ${character.firstChapter}-${character.lastChapter} 章。`,
        firstChapter: character.firstChapter,
        lastChapter: character.lastChapter,
        confidence: character.markers.some((marker) => /主角|男主|主人公|子Agent/.test(marker)) ? "高" : "中"
      };
    }

    const linked = relations.filter((relation) => relation.source === character.name || relation.target === character.name);
    const protagonistLink = protagonist
      ? linked.find((relation) => relation.source === protagonist || relation.target === protagonist)
      : undefined;
    const roleRelation = protagonistLink ?? linked.find((relation) => relation.confidence !== "低") ?? linked[0];
    const role = roleFromRelation(roleRelation);
    return {
      name: character.name,
      role,
      reason: roleRelation
        ? `${relationCounterpart(character.name, roleRelation)}：${roleRelation.relationType}，覆盖第 ${roleRelation.firstChapter}-${roleRelation.lastChapter} 章，证据：${roleRelation.markers.join("、")}`
        : `高频出场人物，覆盖第 ${character.firstChapter}-${character.lastChapter} 章，需子 Agent 精读确认人物功能。`,
      firstChapter: character.firstChapter,
      lastChapter: character.lastChapter,
      confidence: roleRelation?.confidence ?? "低"
    };
  });
}

function roleFromRelation(relation: SemanticRelationSummary | undefined): string {
  if (!relation || relation.confidence === "低") {
    return "重要配角候选";
  }
  if (relation.group === "敌对/矛盾") {
    return "主要对手/反派候选";
  }
  if (relation.group === "同盟/合作") {
    return "核心同伴/盟友候选";
  }
  if (relation.group === "师徒/上下级") {
    return "导师/上位者/下属候选";
  }
  if (relation.group === "亲属/情感") {
    return "亲属/情感关系候选";
  }
  if (relation.group === "交易/利用") {
    return "交易/利用关系候选";
  }
  return "重要配角候选";
}

function relationCounterpart(name: string, relation: RelationSummary): string {
  return relation.source === name ? relation.target : relation.source;
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
  const agentCoverage = book.chunkCount === 0 ? 0 : book.agentChunkCount / book.chunkCount;
  const noisyCharacters = book.characters.filter((item) => looksNoisyCharacterName(item.name)).length;
  const noiseRate = book.characters.length === 0 ? 0 : noisyCharacters / book.characters.length;

  return [
    {
      name: "子 Agent 精读覆盖率",
      status: agentCoverage >= 0.85 ? "通过" : "需返工",
      detail: `收到 ${book.agentChunkCount}/${book.chunkCount} 个 chunk JSON，覆盖率 ${(agentCoverage * 100).toFixed(1)}%。`
    },
    auditCount("人物数量", book.characters.length, minCharacters),
    auditCount("关系边数量", book.relations.length, Math.max(20, minCharacters)),
    auditCount("语义关系数量", book.semanticRelations.filter((relation) => relation.confidence !== "低").length, Math.max(10, Math.floor(minCharacters / 2))),
    auditCount("势力组织数量", book.organizations.length, minOrganizations),
    auditCount("地图地点数量", book.locations.length, minLocations),
    auditCount("能力/资源/规则数量", book.systems.length, minSystems),
    auditCount("高光洞察数量", book.highlights.length, determineHighlightTarget(book.chapterCount)),
    auditCount("设定洞察数量", book.settingInsights.length, Math.max(12, Math.floor(book.chapterCount / 80))),
    auditCount("机制洞察数量", book.mechanisms.length, Math.max(8, Math.floor(book.chapterCount / 120))),
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

function determineHighlightTarget(chapterCount: number): number {
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

async function cleanDeepOutputs(bookDir: string): Promise<void> {
  await Promise.all(
    [
      "深拆总报告.md",
      "人物与关系图.md",
      "势力与组织图谱.md",
      "地图与世界结构.md",
      "修炼能力与资源体系.md",
      "关键事件链.md",
      "深度高光片段.md",
      "深度设定沉淀.md",
      "深度优点机制.md",
      "优点与可复用机制.md",
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
    writeText(path.join(bookDir, "关键事件链.md"), renderEventFile(book.title, book.events)),
    writeText(path.join(bookDir, "深度高光片段.md"), renderDeepHighlights(book)),
    writeText(path.join(bookDir, "深度设定沉淀.md"), renderDeepSettingInsights(book)),
    writeText(path.join(bookDir, "深度优点机制.md"), renderDeepMechanisms(book, "深度优点机制")),
    writeText(path.join(bookDir, "优点与可复用机制.md"), renderDeepMechanisms(book, "优点与可复用机制")),
    writeText(path.join(bookDir, "深拆质量审计.md"), renderAudit(book, audit)),
    writeText(path.join(bookDir, "深拆中间数据.json"), JSON.stringify(toJsonBook(book, audit), null, 2))
  ]);
}

function renderDeepReport(book: DeepBook, audit: AuditItem[]): string {
  return `# 深拆总报告：《${book.title}》

## 执行范围

- 章节数：${book.chapterCount}
- 分块数：${book.chunkCount}
- 子 Agent 精读 JSON：${book.agentChunkCount}/${book.chunkCount}
- 主角候选：${book.protagonist ?? "需精读确认"}
- 人物候选：${book.characters.length}
- 关系边候选：${book.relations.length}
- 语义关系候选：${book.semanticRelations.length}
- 势力组织候选：${book.organizations.length}
- 地图地点候选：${book.locations.length}
- 能力/资源/规则候选：${book.systems.length}
- 关键事件候选：${book.events.length}
- 高光洞察：${book.highlights.length}
- 设定洞察：${book.settingInsights.length}
- 机制洞察：${book.mechanisms.length}

## 方法说明

本次深拆不再只读取章节标题或章节开头，而是先把全本正文切成 chunk 精读任务包，再合并子 Agent JSON 与脚本兜底抽取结果。若子 Agent JSON 覆盖率不足，报告会保留兜底结果，但质量审计会标记需补齐精读。

## 审计结果

${audit.map((item) => `- ${item.name}：${item.status}。${item.detail}`).join("\n")}

## 主要入口文件

- \`人物与关系图.md\`
- \`势力与组织图谱.md\`
- \`地图与世界结构.md\`
- \`修炼能力与资源体系.md\`
- \`关键事件链.md\`
- \`深度高光片段.md\`
- \`深度设定沉淀.md\`
- \`深度优点机制.md\`
- \`深拆中间数据.json\`
`;
}

function renderCharacterGraph(book: DeepBook): string {
  const topCharacters = book.characters.slice(0, 100);
  const protagonist = book.protagonist ?? "需精读确认";
  const protagonistRelations = book.protagonist
    ? book.semanticRelations
        .filter((item) => item.confidence !== "低" && (item.source === book.protagonist || item.target === book.protagonist))
        .slice(0, 40)
    : [];
  const conflictRelations = book.semanticRelations.filter((item) => item.confidence !== "低" && item.group === "敌对/矛盾").slice(0, 40);
  const cooperationRelations = book.semanticRelations.filter((item) => item.confidence !== "低" && item.group === "同盟/合作").slice(0, 40);
  const hierarchyRelations = book.semanticRelations
    .filter((item) => item.confidence !== "低" && (item.group === "师徒/上下级" || item.group === "亲属/情感" || item.group === "交易/利用"))
    .slice(0, 40);
  const uncertainRelations = book.semanticRelations.filter((item) => item.confidence === "低").slice(0, 40);
  const graphRelations = [
    ...protagonistRelations.filter((item) => item.confidence !== "低"),
    ...conflictRelations,
    ...cooperationRelations,
    ...hierarchyRelations
  ].slice(0, 35);
  return `# 人物与关系图：《${book.title}》

## 关系图解读

- 主角候选：${protagonist}
- 识别方式：优先采用子 Agent 标注；缺失时按全书出场覆盖、关系网络中心度和关系词线索推断。
- 使用边界：没有子 Agent JSON 的书，敌对/同盟等语义来自正文关键词和共现段落推断，应作为精读索引，不应直接当最终定论。

## 人物功能分层

${renderRoleGroup("主角候选", book.characterRoles)}
${renderRoleGroup("主要对手/反派候选", book.characterRoles)}
${renderRoleGroup("核心同伴/盟友候选", book.characterRoles)}
${renderRoleGroup("导师/上位者/下属候选", book.characterRoles)}
${renderRoleGroup("亲属/情感关系候选", book.characterRoles)}
${renderRoleGroup("交易/利用关系候选", book.characterRoles)}
${renderRoleGroup("重要配角候选", book.characterRoles)}

## 主角关系网

${renderSemanticRelationList(protagonistRelations, "未识别到主角相关关系；需要子 Agent 精读补充。")}

## 主要矛盾和敌对关系

${renderSemanticRelationList(conflictRelations, "未识别到明确敌对关系；当前可能只有普通共现证据。")}

## 合作、同盟和支援关系

${renderSemanticRelationList(cooperationRelations, "未识别到明确合作/同盟关系；需要子 Agent 精读补充。")}

## 师徒、上下级、亲属和交易关系

${renderSemanticRelationList(hierarchyRelations, "未识别到明确身份型关系；需要子 Agent 精读补充。")}

## 待精读确认的高频共现

${renderSemanticRelationList(uncertainRelations, "没有低置信共现关系。")}

## 人物表（证据索引）

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

## Mermaid 关系草图

\`\`\`mermaid
graph TD
${graphRelations.map((item) => `  ${safeMermaidId(item.source)}["${item.source}"] -->|${item.relationType}| ${safeMermaidId(item.target)}["${item.target}"]`).join("\n")}
\`\`\`
`;
}

function renderRoleGroup(role: string, roles: CharacterRoleSummary[]): string {
  const items = roles
    .filter((item) => item.role === role && (role !== "重要配角候选" || item.confidence !== "低"))
    .slice(0, role === "重要配角候选" ? 20 : 12);
  if (items.length === 0) {
    return `### ${role}\n\n- 暂无明确候选。\n`;
  }
  return `### ${role}\n\n${items
    .map(
      (item) =>
        `- ${item.name}：${item.reason} 置信度：${item.confidence}。出场范围：第 ${item.firstChapter}-${item.lastChapter} 章。`
    )
    .join("\n")}\n`;
}

function renderSemanticRelationList(relations: SemanticRelationSummary[], emptyText: string): string {
  if (relations.length === 0) {
    return `- ${emptyText}`;
  }
  return relations
    .map(
      (item) =>
        `- ${item.source} <-> ${item.target}：${item.relationType}（${item.group}，置信度：${item.confidence}）。覆盖第 ${item.firstChapter}-${item.lastChapter} 章；共现 ${item.mentions} 次；证据：${item.markers.join("、") || "需二次精读补充"}`
    )
    .join("\n");
}

function renderEventFile(title: string, events: EventSummary[]): string {
  return `# 关键事件链：《${title}》

## 事件候选

${events.length === 0
  ? "- 当前没有收到子 Agent 事件 JSON；需要补跑 chunk 精读后更新。"
  : events
      .map(
        (item, index) => `### ${index + 1}. ${item.name}

- 位置：${item.range}
- 证据摘要：${item.evidence}
- 后续影响：${item.impact ?? "需二次精读补充"}
`
      )
      .join("\n")}
`;
}

function renderDeepHighlights(book: DeepBook): string {
  const highlights = book.highlights.slice(0, Math.max(determineHighlightTarget(book.chapterCount), book.highlights.length));
  return `# 深度高光片段：《${book.title}》

## 生成口径

本文件只接收子 Agent 基于原文 chunk 精读后的高光洞察，不再用章节标题模板推断。每个条目必须有剧情过程、铺垫、冲突、兑现、后续影响和复用边界。

## 高光片段详拆

${highlights.length === 0
  ? "- 当前没有收到子 Agent 高光洞察；必须补跑 chunk 精读，不能使用模板化高光报告替代。"
  : highlights.map(renderHighlightInsight).join("\n")}
`;
}

function renderHighlightInsight(item: HighlightSummary, index: number): string {
  return `### ${index + 1}. ${item.range}：${item.title}

**剧情概述**：${item.plot}

**剧情拆分**：

- 起点：${item.setup}
- 推进：${item.conflict}
- 结果：${item.payoff}

**前置铺垫**：${item.setup}

**冲突设计**：${item.conflict}

**当场爽点**：${item.payoff}

**后续影响**：${item.impact}

**为什么好**：这一段的价值不只在事件本身，而在它把铺垫、限制、选择和兑现连成了可复用的读者期待链。证据摘要：${item.evidence}

**可复用写法**：${item.reusableMechanism}

**不可复用元素**：${item.reuseBoundary}
`;
}

function renderDeepSettingInsights(book: DeepBook): string {
  return `# 深度设定沉淀：《${book.title}》

## 生成口径

本文件只接收子 Agent 基于原文 chunk 精读后的设定洞察。每个设定都必须能进入后续 Story Bible，不能只保留名词。

## 设定条目

${book.settingInsights.length === 0
  ? "- 当前没有收到子 Agent 设定洞察；必须补跑 chunk 精读，不能使用模板化设定报告替代。"
  : book.settingInsights.map(renderSettingInsight).join("\n")}
`;
}

function renderSettingInsight(item: SettingInsightSummary, index: number): string {
  return `### ${index + 1}. ${item.name}

**设定定义**：${item.definition}

**剧情落点**：${item.range}。证据摘要：${item.evidence}

**运行规则**：${item.rule}

**代价与限制**：${item.cost}

**人物和势力接口**：${item.interfaces}

**阶段变化**：${item.evolution}

**为什么值得借鉴**：${item.reuseValue}

**复用边界**：${item.reuseBoundary}
`;
}

function renderDeepMechanisms(book: DeepBook, fileTitle: string): string {
  return `# ${fileTitle}：《${book.title}》

## 生成口径

本文件只接收子 Agent 基于原文 chunk 精读后的“为什么好看”机制。机制必须能指导新书改写，不能只列标题。

## 机制拆解

${book.mechanisms.length === 0
  ? "- 当前没有收到子 Agent 机制洞察；必须补跑 chunk 精读，不能使用标题级机制列表替代。"
  : book.mechanisms.map(renderMechanismInsight).join("\n")}
`;
}

function renderMechanismInsight(item: MechanismSummary, index: number): string {
  return `### ${index + 1}. ${item.name}

**机制原理**：${item.principle}

**本书中的工作方式**：${item.implementation}（来源：${item.range}；证据摘要：${item.evidence}）

**为什么好看**：${item.appeal}

**适用题材**：男频玄幻、仙侠、都市重生、科幻、高武、历史、西幻或志怪题材均可借用其结构，但必须替换题材包装、资源形态和组织关系。

**改写方法**：${item.rewriteMethod}

**失败风险**：${item.failureRisk}
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
- 子 Agent 精读覆盖率低于 85% 时，当前产物只能作为兜底索引，不能视为最终精读结论。
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
- 子 Agent 精读 JSON：${book.agentChunkCount}/${book.chunkCount}
- 主角候选：${book.protagonist ?? "需精读确认"}
- 人物候选：${book.characters.length}
- 关系边候选：${book.relations.length}
- 语义关系候选：${book.semanticRelations.length}
- 势力组织候选：${book.organizations.length}
- 地图地点候选：${book.locations.length}
- 能力/资源/规则候选：${book.systems.length}
- 关键事件候选：${book.events.length}
- 高光洞察：${book.highlights.length}
- 设定洞察：${book.settingInsights.length}
- 机制洞察：${book.mechanisms.length}

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
          })),
          ...book.highlights.slice(0, 12).map((item) => ({
            title: `${book.title}：高光-${item.title}`,
            summary: `${item.plot}\n\n可复用机制：${item.reusableMechanism}\n\n后续影响：${item.impact}`,
            tags: ["深拆", "高光", "爽点", "可复用桥段"],
            source: `《${book.title}》${item.range} 高光洞察`,
            reuseBoundary: item.reuseBoundary
          })),
          ...book.mechanisms.slice(0, 12).map((item) => ({
            title: `${book.title}：机制-${item.name}`,
            summary: `${item.principle}\n\n本书实现：${item.implementation}\n\n改写方法：${item.rewriteMethod}`,
            tags: ["深拆", "优点机制", "写作方法"],
            source: `《${book.title}》${item.range} 机制洞察`,
            reuseBoundary: item.failureRisk
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

本次生成全本扫描后的深拆总报告、人物与关系图、势力与组织图谱、地图与世界结构、修炼能力与资源体系、关键事件链、深度高光片段、深度设定沉淀、深度优点机制、深拆中间数据和质量审计。
`
  );
}

function toJsonBook(book: DeepBook, audit: AuditItem[]): Record<string, unknown> {
  return {
    title: book.title,
    chapterCount: book.chapterCount,
    chunkCount: book.chunkCount,
    agentChunkCount: book.agentChunkCount,
    protagonist: book.protagonist,
    audit,
    characters: book.characters,
    characterRoles: book.characterRoles,
    relations: book.relations,
    semanticRelations: book.semanticRelations,
    organizations: book.organizations,
    locations: book.locations,
    systems: book.systems,
    events: book.events,
    highlights: book.highlights,
    settingInsights: book.settingInsights,
    mechanisms: book.mechanisms,
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
