import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

export type CharacterRecallCandidate = {
  name: string;
  aliases: string[];
  category: string;
  reason: string;
  mentions: number;
  aliasMentions: Record<string, number>;
  firstHits: string[];
  mustReview: boolean;
};

export type CharacterRecallReport = {
  title: string;
  sourceFile?: string;
  detectedContext: string[];
  candidates: CharacterRecallCandidate[];
};

type CanonicalCharacter = {
  name: string;
  aliases?: string[];
  reason: string;
};

type GenericRecord = {
  name: string;
  mentions: number;
};

const HAN_THREE_KINGDOMS_CONTEXT = ["汉末", "三国", "东汉", "灵帝", "熹平", "光和", "中平", "黄巾", "董卓", "袁绍", "曹操", "刘备", "公孙瓒"];

const HAN_THREE_KINGDOMS_CHARACTERS: CanonicalCharacter[] = [
  { name: "刘备", aliases: ["玄德"], reason: "汉末三国核心诸侯，若原文高频出现，通常牵动主角盟友/竞争者关系。" },
  { name: "关羽", aliases: ["云长"], reason: "刘备集团核心人物，常承担义气、武力和阵营绑定功能。" },
  { name: "张飞", aliases: ["益德", "翼德"], reason: "刘备集团核心人物，常承担武力、兄弟关系和喜剧/冲突功能。" },
  { name: "赵云", aliases: ["赵子龙", "子龙"], reason: "三国高辨识度武将，常承担名将收拢、护卫、青年豪杰和读者期待兑现功能。" },
  { name: "诸葛亮", aliases: ["孔明"], reason: "三国核心谋臣，若原文出现需要核对是否进入长期谋略线。" },
  { name: "曹操", aliases: ["孟德"], reason: "汉末三国核心诸侯，通常是主角政治关系网和天下格局关键节点。" },
  { name: "孙坚", aliases: ["文台"], reason: "江东线早期核心人物，影响讨董、江东势力和孙氏继承。" },
  { name: "孙策", aliases: ["伯符"], reason: "江东扩张核心人物，常承担少年英主和势力外延功能。" },
  { name: "孙权", aliases: ["仲谋"], reason: "江东后期核心人物，关系网常涉及联盟、制衡和天下分割。" },
  { name: "周瑜", aliases: ["公瑾"], reason: "江东核心谋将，常承担军事智谋、江东魅力和联盟博弈功能。" },
  { name: "鲁肃", aliases: ["子敬"], reason: "江东战略人物，常承担联盟、外交和格局判断功能。" },
  { name: "吕蒙", aliases: ["子明"], reason: "江东后期名将，常承担成长型将领和战略反转功能。" },
  { name: "陆逊", aliases: ["伯言"], reason: "江东后期核心将领，常承担后起智将和大规模战役功能。" },
  { name: "袁绍", aliases: ["本初"], reason: "河北争霸核心诸侯，常承担门阀、盟主和主角北方格局关系。" },
  { name: "袁术", aliases: ["公路"], reason: "汉末诸侯和称帝线关键节点，常承担野心、正统和资源错配功能。" },
  { name: "董卓", aliases: ["仲颖"], reason: "汉末乱局关键人物，常承担朝廷崩坏和关西军权功能。" },
  { name: "吕布", aliases: ["奉先"], reason: "汉末高辨识度武将，常承担武力天花板、背叛和阵营流动功能。" },
  { name: "貂蝉", aliases: [], reason: "三国演义高辨识度人物，出现时需要核对是否属于演义改写线。" },
  { name: "公孙瓒", aliases: ["伯圭"], reason: "幽州和白马义从关键人物，历史改写中常与主角早期边军关系绑定。" },
  { name: "刘虞", aliases: [], reason: "幽州政治核心人物，常承担温和治理、边政和公孙氏矛盾功能。" },
  { name: "刘焉", aliases: [], reason: "东汉宗室州牧关键人物，常承担地方割据制度变化功能。" },
  { name: "刘表", aliases: ["景升"], reason: "荆州核心人物，常承担南方州牧、士族和守成格局功能。" },
  { name: "马腾", aliases: ["寿成"], reason: "凉州军政人物，常承担西北边军和关中关系功能。" },
  { name: "韩遂", aliases: ["文约"], reason: "凉州军政人物，常承担西北叛乱、边军和交易关系功能。" },
  { name: "张角", aliases: [], reason: "黄巾线核心人物，常承担宗教动员和时代崩坏功能。" },
  { name: "张宝", aliases: [], reason: "黄巾线重要人物，出现时需要进入黄巾势力关系。" },
  { name: "张梁", aliases: [], reason: "黄巾线重要人物，出现时需要进入黄巾势力关系。" },
  { name: "皇甫嵩", aliases: [], reason: "东汉平乱名将，常承担朝廷军事能力和名将评价功能。" },
  { name: "朱儁", aliases: ["朱俊"], reason: "东汉平乱名将，常承担朝廷军事能力和黄巾线功能。" },
  { name: "卢植", aliases: [], reason: "东汉名臣名师，常承担士人、师承和政治声望功能。" },
  { name: "贾诩", aliases: ["文和"], reason: "汉末核心谋士，常承担乱世自保和毒士策略功能。" },
  { name: "郭嘉", aliases: ["奉孝"], reason: "曹魏核心谋士，常承担早期战略判断和天才谋士功能。" },
  { name: "荀彧", aliases: ["文若"], reason: "曹魏核心谋臣，常承担士族、正统和制度建设功能。" },
  { name: "荀攸", aliases: ["公达"], reason: "曹魏核心谋臣，常承担战术谋划功能。" },
  { name: "程昱", aliases: ["仲德"], reason: "曹魏谋臣，常承担地方士人和硬派策略功能。" },
  { name: "司马懿", aliases: ["仲达"], reason: "曹魏后期核心人物，常承担终局权力转移功能。" },
  { name: "张辽", aliases: ["文远"], reason: "曹魏名将，常承担降将、合肥和武将高光功能。" },
  { name: "夏侯惇", aliases: ["元让"], reason: "曹魏宗族将领，常承担亲族武将和军政骨干功能。" },
  { name: "夏侯渊", aliases: ["妙才"], reason: "曹魏宗族将领，常承担西线战事和机动将领功能。" },
  { name: "许褚", aliases: ["仲康"], reason: "曹魏护卫型猛将，常承担近身护主和武力威慑功能。" },
  { name: "典韦", aliases: [], reason: "曹魏早期护卫型猛将，常承担护主牺牲和武力高光功能。" },
  { name: "徐晃", aliases: ["公明"], reason: "曹魏名将，常承担稳健统兵和后期战役功能。" },
  { name: "张郃", aliases: ["张颌", "儁乂", "俊乂"], reason: "河北/曹魏名将，常承担名将收拢和阵营转化功能。" }
];

const COMPOUND_SURNAMES = [
  "司马",
  "上官",
  "欧阳",
  "夏侯",
  "诸葛",
  "东方",
  "皇甫",
  "尉迟",
  "公孙",
  "轩辕",
  "令狐",
  "宇文",
  "长孙",
  "慕容",
  "司徒",
  "司空",
  "南宫",
  "西门",
  "拓跋"
];

const SINGLE_SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏窦章云苏潘葛范彭郎鲁韦昌马苗方任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝安常乐于时傅齐康伍余顾孟黄和穆萧尹姚邵汪祁毛米贝明成戴宋庞熊纪舒屈项祝董梁杜阮蓝季贾路江童颜郭梅林钟徐骆高夏蔡田胡凌霍虞万柯管卢莫房解应宗丁宣邓洪包左石崔吉龚程邢裴陆荣翁荀封靳松井段富焦巴车侯全甘厉祖武符刘景叶黎薄白怀蒲索赖卓蔺蒙池乔翟谭姬申桑桂牛燕尚温庄晏柴瞿阎连习易廖衡步耿匡文寇";

const NAME_NOISE = new Set([
  "一个",
  "这个",
  "那个",
  "自己",
  "他们",
  "我们",
  "你们",
  "众人",
  "有人",
  "夫人",
  "先生",
  "将军",
  "太守",
  "天子",
  "皇帝",
  "朝廷",
  "天下",
  "中原",
  "河北",
  "幽州",
  "辽西",
  "赵国",
  "赵王",
  "汉军",
  "鲜卑",
  "乌桓"
]);

const NON_PERSON_SUFFIX = ["国", "郡", "县", "州", "军", "兵", "城", "塞", "山", "河", "道", "门", "营", "官", "帝", "王", "令", "史", "守"];

export async function findBookSourceFile(bookDir: string): Promise<string | undefined> {
  const sourceDir = path.join(bookDir, "source");
  try {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    const source = entries.find((entry) => entry.isFile());
    return source ? path.join(sourceDir, source.name) : undefined;
  } catch {
    return undefined;
  }
}

export async function buildCharacterRecallForBookDir(bookDir: string, title = path.basename(bookDir)): Promise<CharacterRecallReport | undefined> {
  const sourceFile = await findBookSourceFile(bookDir);
  if (!sourceFile) {
    return undefined;
  }
  return buildCharacterRecallFromSourceFile(sourceFile, title);
}

export async function buildCharacterRecallFromSourceFile(sourceFile: string, title: string): Promise<CharacterRecallReport> {
  const text = decodeSource(await readFile(sourceFile));
  const detectedContext = detectContext(title, text);
  const canonical = detectedContext.includes("汉末/三国") ? buildCanonicalCandidates(text) : [];
  const canonicalNames = new Set(canonical.flatMap((item) => [item.name, ...item.aliases]));
  const generic = buildGenericCandidates(text, canonicalNames);
  return {
    title,
    sourceFile,
    detectedContext,
    candidates: [...canonical, ...generic]
      .sort((a, b) => Number(b.mustReview) - Number(a.mustReview) || b.mentions - a.mentions || a.name.localeCompare(b.name, "zh-Hans-CN"))
      .slice(0, 160)
  };
}

export function parseCharacterRecallReport(content: string): CharacterRecallReport | undefined {
  if (!content.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as { characterRecall?: unknown; candidates?: unknown };
    const value = parsed.characterRecall ?? (Array.isArray(parsed.candidates) ? parsed : undefined);
    if (!value) {
      return undefined;
    }
    return normalizeCharacterRecallReport(value);
  } catch {
    return undefined;
  }
}

export function normalizeCharacterRecallReport(value: unknown): CharacterRecallReport | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const report = value as Partial<CharacterRecallReport>;
  const candidates = Array.isArray(report.candidates)
    ? report.candidates.map(normalizeCandidate).filter((item): item is CharacterRecallCandidate => Boolean(item))
    : [];
  return {
    title: typeof report.title === "string" && report.title.trim() ? report.title.trim() : "未命名",
    sourceFile: typeof report.sourceFile === "string" ? report.sourceFile : undefined,
    detectedContext: Array.isArray(report.detectedContext) ? report.detectedContext.filter((item): item is string => typeof item === "string") : [],
    candidates
  };
}

export function characterRecallCandidateTerms(candidate: CharacterRecallCandidate): string[] {
  return [candidate.name, ...candidate.aliases.filter((alias) => alias.length >= 3)].filter(Boolean);
}

function normalizeCandidate(value: unknown): CharacterRecallCandidate | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const item = value as Partial<CharacterRecallCandidate>;
  if (typeof item.name !== "string" || !item.name.trim()) {
    return undefined;
  }
  const aliasMentions =
    item.aliasMentions && typeof item.aliasMentions === "object" && !Array.isArray(item.aliasMentions)
      ? Object.fromEntries(Object.entries(item.aliasMentions).filter(([, count]) => typeof count === "number"))
      : {};
  return {
    name: item.name.trim(),
    aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0) : [],
    category: typeof item.category === "string" ? item.category : "角色召回候选",
    reason: typeof item.reason === "string" ? item.reason : "原文命中，需要核对是否进入人物关系图。",
    mentions: typeof item.mentions === "number" ? item.mentions : 0,
    aliasMentions,
    firstHits: Array.isArray(item.firstHits) ? item.firstHits.filter((hit): hit is string => typeof hit === "string") : [],
    mustReview: Boolean(item.mustReview)
  };
}

function decodeSource(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  let gb18030 = utf8;
  try {
    gb18030 = new TextDecoder("gb18030").decode(buffer);
  } catch {
    return utf8;
  }
  return replacementCount(gb18030) < replacementCount(utf8) ? gb18030 : utf8;
}

function replacementCount(text: string): number {
  return (text.match(/�/g) ?? []).length;
}

function detectContext(title: string, text: string): string[] {
  const sample = `${title}\n${text.slice(0, 300000)}`;
  const matched = HAN_THREE_KINGDOMS_CONTEXT.filter((keyword) => sample.includes(keyword));
  return matched.length >= 3 ? ["汉末/三国"] : [];
}

function buildCanonicalCandidates(text: string): CharacterRecallCandidate[] {
  return HAN_THREE_KINGDOMS_CHARACTERS.map((character) => {
    const aliases = character.aliases ?? [];
    const terms = [character.name, ...aliases];
    const aliasMentions = Object.fromEntries(terms.map((term) => [term, countTerm(text, term)]));
    const mentions = terms.reduce((sum, term) => sum + (aliasMentions[term] ?? 0), 0);
    return {
      name: character.name,
      aliases,
      category: "汉末/三国历史人物",
      reason: character.reason,
      mentions,
      aliasMentions,
      firstHits: firstHits(text, terms),
      mustReview: mentions >= 8
    };
  }).filter((item) => item.mentions > 0);
}

function buildGenericCandidates(text: string, canonicalNames: Set<string>): CharacterRecallCandidate[] {
  const records = new Map<string, GenericRecord>();
  collectPatternNames(text, /(?:名叫|名为|叫做|唤做|唤作|自称|称为)([\p{Script=Han}]{2,4})/gu, records);
  collectPatternNames(text, /([\p{Script=Han}]{2,4})(?:说道|问道|笑道|冷笑道|沉声道|低声道|喊道|叫道|答道|叹道|皱眉道|开口道)/gu, records);
  for (const surname of COMPOUND_SURNAMES) {
    collectPatternNames(text, new RegExp(`(${surname}[\\p{Script=Han}]{1,2})`, "gu"), records);
  }
  collectPatternNames(text, new RegExp(`([${SINGLE_SURNAMES}][\\p{Script=Han}]{1,2})`, "gu"), records);

  return [...records.values()]
    .filter((item) => item.mentions >= 30 && !canonicalNames.has(item.name))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 80)
    .map((item) => ({
      name: item.name,
      aliases: [],
      category: "原文高频姓名候选",
      reason: "脚本从原文姓名模式和出现次数召回；供子 Agent 核对是否为人物、是否进入关系图。",
      mentions: item.mentions,
      aliasMentions: { [item.name]: item.mentions },
      firstHits: firstHits(text, [item.name]),
      mustReview: false
    }));
}

function collectPatternNames(text: string, pattern: RegExp, records: Map<string, GenericRecord>): void {
  for (const match of text.matchAll(pattern)) {
    const name = normalizeName(match[1] ?? match[0]);
    if (!isUsefulGenericName(name)) {
      continue;
    }
    const record = records.get(name) ?? { name, mentions: 0 };
    record.mentions += 1;
    records.set(name, record);
  }
}

function normalizeName(name: string): string {
  return name.replace(/[^\p{Script=Han}A-Za-z·]/gu, "").trim();
}

function isUsefulGenericName(name: string): boolean {
  if (name.length < 2 || name.length > 4) {
    return false;
  }
  if (NAME_NOISE.has(name)) {
    return false;
  }
  if (/[的是了不着过里上中下这那和都很又再才就把被给从到向为与于]/.test(name)) {
    return false;
  }
  if (name.length === 2 && NON_PERSON_SUFFIX.some((suffix) => name.endsWith(suffix))) {
    return false;
  }
  return true;
}

function countTerm(text: string, term: string): number {
  if (!term) {
    return 0;
  }
  return text.split(term).length - 1;
}

function firstHits(text: string, terms: string[]): string[] {
  const hits: string[] = [];
  for (const term of terms) {
    let from = 0;
    while (hits.length < 6) {
      const index = text.indexOf(term, from);
      if (index < 0) {
        break;
      }
      hits.push(`${term}@${index}`);
      from = index + term.length;
    }
  }
  return hits.slice(0, 6);
}
