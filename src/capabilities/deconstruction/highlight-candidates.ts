import { readFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

type Chapter = {
  index: number;
  title: string;
  text: string;
};

export type HighlightCandidateRecall = {
  title: string;
  sourceFile?: string;
  chapterCount: number;
  patternSignals: Array<{
    type: string;
    terms: string[];
    occurrences: number;
    chapters: string[];
  }>;
  chapterCandidates: Array<{
    chapter: number;
    title: string;
    signalTypes: string[];
    matchedTerms: string[];
    score: number;
  }>;
  socialSearchHints: Array<{
    source: string;
    query: string;
    purpose: string;
  }>;
  notes: string[];
};

const CHAPTER_TITLE_PATTERN = /^(?:\d+[.、]\s*)?第[一二三四五六七八九十百千万零〇两0-9]+章[^\n\r]*/gm;

const SIGNAL_GROUPS = [
  {
    type: "叙事装置/伪史评",
    terms: ["新验书", "后验书", "史臣曰", "赞曰", "论曰", "后世", "史载", "史书", "本纪", "列传"]
  },
  {
    type: "战役/军事高光",
    terms: ["夜袭", "火烧", "大战", "破", "攻", "守", "围", "救", "骑", "阵", "斩", "军", "兵"]
  },
  {
    type: "政治/治理高光",
    terms: ["诛", "宴", "会盟", "问策", "奏", "朝议", "收权", "治", "郡", "县", "朝廷", "天子"]
  },
  {
    type: "梗/记忆锚点",
    terms: ["黑", "吹", "马屁", "笑", "戏言", "名号", "白马", "铁锅", "断刃", "歌", "酒"]
  }
];

export async function buildHighlightCandidateRecall(params: {
  title: string;
  sourceFile?: string;
}): Promise<HighlightCandidateRecall> {
  if (!params.sourceFile) {
    return emptyRecall(params.title);
  }
  try {
    const content = await readSourceText(params.sourceFile);
    const chapters = parseChapters(content);
    return {
      title: params.title,
      sourceFile: params.sourceFile,
      chapterCount: chapters.length,
      patternSignals: buildPatternSignals(chapters),
      chapterCandidates: buildChapterCandidates(chapters),
      socialSearchHints: buildSocialSearchHints(params.title),
      notes: [
        "本文件只做低判断候选召回，不代表最终高光判断。",
        "子 Agent 必须回到原文确认候选是否成立，并在 highlights.json 写入选用或排除理由。",
        "外部讨论只能作为候选和可信度信号，不能替代正文证据。"
      ]
    };
  } catch {
    return emptyRecall(params.title);
  }
}

export function renderHighlightCandidateRecall(recall: HighlightCandidateRecall): string {
  return `# 亮点候选召回：《${recall.title}》

## 召回口径

本文件由脚本生成，只负责把可能被漏掉的高光、战役、叙事装置和梗召回给专题子 Agent。它不判断这些内容是否真的值得沉淀。

- 原文文件：${recall.sourceFile ?? "未找到"}
- 章节数：${recall.chapterCount}

## 模式信号

${recall.patternSignals.length > 0 ? recall.patternSignals.map((item) => `- **${item.type}**：命中 ${item.occurrences} 次；关键词：${item.terms.join("、")}；代表章节：${item.chapters.join("、")}`).join("\n") : "- 未召回明显模式信号。"}

## 章节候选

${recall.chapterCandidates.length > 0 ? recall.chapterCandidates.map((item) => `- 第 ${item.chapter} 章《${item.title}》：${item.signalTypes.join("、")}；命中词：${item.matchedTerms.join("、")}；召回分 ${item.score}`).join("\n") : "- 未召回章节候选。"}

## 外部讨论检索建议

${recall.socialSearchHints.map((item) => `- **${item.source}**：\`${item.query}\`。目的：${item.purpose}`).join("\n")}

## 注意事项

${recall.notes.map((item) => `- ${item}`).join("\n")}
`;
}

function emptyRecall(title: string): HighlightCandidateRecall {
  return {
    title,
    chapterCount: 0,
    patternSignals: [],
    chapterCandidates: [],
    socialSearchHints: buildSocialSearchHints(title),
    notes: ["未找到原文副本，只能依靠现有产物、外部讨论和子 Agent 精读召回。"]
  };
}

function parseChapters(content: string): Chapter[] {
  const matches = [...content.matchAll(CHAPTER_TITLE_PATTERN)];
  if (matches.length === 0) {
    return [{ index: 1, title: "全文", text: content }];
  }
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const next = index + 1 < matches.length ? matches[index + 1].index ?? content.length : content.length;
    const title = match[0].replace(/^\d+[.、]\s*/, "").trim();
    return {
      index: index + 1,
      title,
      text: content.slice(start, next)
    };
  });
}

function buildPatternSignals(chapters: Chapter[]): HighlightCandidateRecall["patternSignals"] {
  return SIGNAL_GROUPS.map((group) => {
    const chapterHits = chapters
      .map((chapter) => ({
        chapter,
        count: group.terms.reduce((sum, term) => sum + occurrences(chapter.text, term), 0)
      }))
      .filter((item) => item.count > 0);
    const totalOccurrences = chapterHits.reduce((sum, item) => sum + item.count, 0);
    return {
      type: group.type,
      terms: group.terms,
      occurrences: totalOccurrences,
      chapters: chapterHits
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
        .map((item) => `第 ${item.chapter.index} 章《${item.chapter.title}》`)
    };
  }).filter((item) => item.occurrences > 0);
}

function buildChapterCandidates(chapters: Chapter[]): HighlightCandidateRecall["chapterCandidates"] {
  return chapters
    .map((chapter) => {
      const matchedTerms = new Set<string>();
      const signalTypes: string[] = [];
      let score = 0;
      for (const group of SIGNAL_GROUPS) {
        const groupHits = group.terms.filter((term) => chapter.text.includes(term) || chapter.title.includes(term));
        if (groupHits.length === 0) {
          continue;
        }
        signalTypes.push(group.type);
        groupHits.forEach((term) => matchedTerms.add(term));
        score += groupHits.reduce((sum, term) => sum + occurrences(chapter.text, term), 0);
        if (group.type === "叙事装置/伪史评") {
          score += groupHits.length * 8;
        }
      }
      return {
        chapter: chapter.index,
        title: chapter.title,
        signalTypes,
        matchedTerms: [...matchedTerms],
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 80);
}

function buildSocialSearchHints(title: string): HighlightCandidateRecall["socialSearchHints"] {
  const normalizedTitle = path.basename(title).replace(/\.[^.]+$/, "");
  return [
    {
      source: "Sensight 社媒搜索",
      query: `${normalizedTitle} 高光 名场面 书评 为什么好看`,
      purpose: "召回近期微博、小红书、公众号里被读者反复提到的桥段和梗。"
    },
    {
      source: "Sensight 社媒搜索",
      query: `${normalizedTitle} 梗 章末 后世 史评`,
      purpose: "召回叙事装置、文本形式亮点、章末小段和读者记忆点。"
    },
    {
      source: "Sensight 热点/全域搜索",
      query: `${normalizedTitle} 精彩战役 讨论 盘点`,
      purpose: "补充不在近期社媒里的长尾讨论、书评和视频拆解线索。"
    }
  ];
}

function occurrences(text: string, keyword: string): number {
  return text.split(keyword).length - 1;
}

async function readSourceText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const utf8 = new TextDecoder("utf-8").decode(buffer).replace(/\r\n/g, "\n");
  if (hasChapterTitles(utf8)) {
    return utf8;
  }
  try {
    return new TextDecoder("gb18030").decode(buffer).replace(/\r\n/g, "\n");
  } catch {
    return utf8;
  }
}

function hasChapterTitles(text: string): boolean {
  CHAPTER_TITLE_PATTERN.lastIndex = 0;
  return CHAPTER_TITLE_PATTERN.test(text);
}
