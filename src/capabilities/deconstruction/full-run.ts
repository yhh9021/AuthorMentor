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

type FocusRule = {
  focus: string;
  category: string;
  keywords: string[];
};

type BookProfile = {
  name: string;
  genre: string;
  rules: FocusRule[];
  coreStructure: string;
  strengths: string[];
  settingDimensions: string[];
  highlightDimensions: string[];
  reusableMechanisms: string[];
  onlineSignals: OnlineSignal[];
};

type OnlineSignal = {
  label: string;
  keywords: string[];
  source: string;
  note: string;
};

const CHAPTER_TITLE_PATTERN =
  /^(?:\d+[.、]\s*)?第[一二三四五六七八九十百千万零〇两0-9]+章[^\n\r]*/gm;

const GENERIC_RULES: FocusRule[] = [
  { focus: "开局身份与核心处境", category: "开局结构", keywords: ["醒来", "穿越", "身份", "少年", "少女", "家", "村", "城", "学校", "学院"] },
  { focus: "规则体系揭示与能力入门", category: "设定模式", keywords: ["规则", "体系", "修炼", "魔法", "能力", "序列", "功法", "技能", "天赋"] },
  { focus: "资源获取与生存压力", category: "资源与交易", keywords: ["钱", "资源", "药", "交易", "买", "卖", "任务", "奖励", "收获"] },
  { focus: "组织关系与阵营博弈", category: "人物关系", keywords: ["组织", "学院", "宗门", "教会", "朝廷", "军", "联盟", "议会", "家族"] },
  { focus: "公开对抗与能力验证", category: "战斗或竞赛", keywords: ["战", "杀", "斗", "比", "试", "考", "胜", "败", "挑战", "擂台"] },
  { focus: "地图扩张与新场景开启", category: "地图展开", keywords: ["城", "国", "海", "山", "界", "遗迹", "禁区", "秘境", "远行"] },
  { focus: "大事件爆发与危机升级", category: "冲突升级", keywords: ["危机", "灾", "乱", "变", "逃", "围", "攻", "阴谋", "背叛"] },
  { focus: "终局秘密与伏笔回收", category: "伏笔与回收", keywords: ["真相", "秘密", "神", "终", "命运", "起源", "归来", "最后"] }
];

const XIUXIAN_RULES: FocusRule[] = [
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

const BOOK_PROFILES: BookProfile[] = [
  {
    name: "我有一个修仙世界",
    genre: "现代制度化修仙 + 双世界资源流",
    rules: XIUXIAN_RULES,
    coreStructure:
      "现代制度化修仙提供清晰资源价格和上升通道，异界资源点提供持续差价，主角把知识、交易、生产技能和组织经营逐步滚成长期优势。",
    strengths: ["双世界资源差带来稳定爽点", "制度化修仙让资源压力可量化", "生产技能和组织经营支撑长篇中段", "早期道具能一路抬升到终局解释"],
    settingDimensions: ["现代仙门制度", "异界地图与宗门", "资源价格体系", "功法境界体系", "生产技能体系", "跨界道具与终局秘密"],
    highlightDimensions: ["双世界套利", "公开考试/斗法", "生产技能变现", "组织经营", "大境界突破", "终局伏笔回收"],
    reusableMechanisms: ["双市场套利金手指", "制度赛道降维打击", "生产技能供应链", "个人能力组织化", "早期道具终局化"],
    onlineSignals: [
      { label: "双世界资源差", keywords: ["水府", "龟壳", "东荒", "坊市", "灵石"], source: "本地语义拆书沉淀", note: "前期讨论价值集中在现代修仙制度和异界资源套利的组合。" },
      { label: "生产技能组织化", keywords: ["制符", "灵米", "丹方", "五行宗", "新政"], source: "本地语义拆书沉淀", note: "中段价值在于把个人技能写成产业、宗门和制度。" }
    ]
  },
  {
    name: "奥术神座",
    genre: "西幻奥术 + 科学认知升级",
    rules: [
      { focus: "音乐与文化破局", category: "开局结构", keywords: ["音乐", "钢琴", "交响", "乐章", "音乐家", "演奏", "旋律"] },
      { focus: "教会压迫与异端风险", category: "冲突升级", keywords: ["教会", "主教", "神术", "异端", "审判", "守夜人", "信仰"] },
      { focus: "魔法入门与知识转译", category: "设定模式", keywords: ["魔法", "魔法师", "学徒", "咒文", "精神力", "冥想", "法术"] },
      { focus: "奥术论文与认知升级", category: "爽点设计", keywords: ["奥术", "论文", "实验", "元素", "电磁", "量子", "数学", "真理"] },
      { focus: "议会学派与身份跃迁", category: "人物关系", keywords: ["议会", "学派", "委员", "导师", "学生", "奖项", "头衔"] },
      { focus: "神祇真相与世界观抬升", category: "伏笔与回收", keywords: ["神", "真理", "世界", "灵魂", "天堂", "地狱", "终局"] }
    ],
    coreStructure:
      "用音乐和现代知识帮助主角进入异世界上层叙事，再把科学认知转译为奥术升级路径，让知识本身成为战斗力、身份和世界观真相的来源。",
    strengths: ["知识升级就是爽点", "艺术破局提供低武力开局", "教会压迫制造持续风险", "奥术体系把现实科学转成异世界力量", "学术共同体替代传统宗门升级"],
    settingDimensions: ["教会与信仰", "魔法与奥术体系", "音乐文化资源", "学派和议会制度", "实验与论文评价", "神祇和世界真相"],
    highlightDimensions: ["音乐出圈", "异端危机", "第一次魔法入门", "论文震动学界", "学派争论", "神学与科学冲突"],
    reusableMechanisms: ["现代知识异界转译", "文化技能低成本破局", "学术成果变成战力和身份", "压迫性宗教组织制造高压环境"],
    onlineSignals: [
      { label: "知识就是力量", keywords: ["知识", "魔法学徒", "奥术", "论文", "实验", "真理"], source: "https://www.zhihu.com/question/19715636", note: "长期讨论中常把本书概括为用科学知识解释和改造魔法体系。" },
      { label: "音乐破局", keywords: ["音乐", "钢琴", "悲怆", "交响", "音乐会", "阿尔托"], source: "https://www.qidian.com/book/2643379/", note: "开局以音乐身份进入上层社会，是低武力开局的代表桥段。" },
      { label: "奥术论文震动学界", keywords: ["论文", "元素", "自然", "实验", "皇冠", "评价"], source: "https://www.novelcrafter.com/features/codex", note: "按 Codex 思路应把论文、学派、评价制度拆成可复用设定条目。" }
    ]
  },
  {
    name: "诡秘之主",
    genre: "蒸汽克苏鲁 + 序列晋升 + 秘密组织",
    rules: [
      { focus: "穿越悬疑与生存伪装", category: "开局结构", keywords: ["绯红", "克莱恩", "穿越", "笔记", "自杀", "伪装", "醒来"] },
      { focus: "非凡序列与魔药晋升", category: "设定模式", keywords: ["非凡", "序列", "魔药", "途径", "晋升", "扮演", "消化"] },
      { focus: "塔罗会与信息差经营", category: "人物关系", keywords: ["塔罗", "愚者", "灰雾", "正义", "倒吊人", "聚会", "交易"] },
      { focus: "教会调查与城市案件", category: "剧情桥段", keywords: ["值夜者", "教会", "案件", "调查", "贝克兰德", "廷根", "警察"] },
      { focus: "污染失控与恐怖氛围", category: "冲突升级", keywords: ["污染", "失控", "邪神", "诅咒", "梦境", "怪物", "疯狂"] },
      { focus: "神秘学真相与终局位格", category: "伏笔与回收", keywords: ["旧日", "外神", "源堡", "天尊", "神灵", "真神", "末日"] }
    ],
    coreStructure:
      "把侦探式案件、克苏鲁未知恐惧和序列晋升结合起来，主角靠伪装、信息差和组织经营获得安全空间，再逐步触及高位格真相。",
    strengths: ["序列体系清晰且带代价", "塔罗会天然提供群像和信息差", "案件单元便于分段推进", "恐怖氛围和晋升爽点并行", "终局秘密能回收早期异常"],
    settingDimensions: ["非凡途径和魔药", "教会和官方组织", "塔罗会关系网", "城市和海上地图", "污染与失控规则", "旧日和源堡真相"],
    highlightDimensions: ["灰雾聚会", "值夜者案件", "晋升仪式", "身份伪装", "大都市阴谋", "高位格真相"],
    reusableMechanisms: ["秘密组织信息差", "能力越强代价越高", "案件单元承载升级", "伪装身份制造安全距离"],
    onlineSignals: [
      { label: "塔罗会与愚者身份", keywords: ["塔罗", "愚者", "灰雾", "正义", "倒吊人", "聚会"], source: "https://www.zhihu.com/question/318198170", note: "讨论度高的结构优势在于主角用灰雾和身份差经营秘密组织。" },
      { label: "廷根/值夜者案件", keywords: ["值夜者", "廷根", "案件", "小丑", "梅高欧丝", "因斯"], source: "https://www.qidian.com/book/1010868264/", note: "早期案件把友情、官方组织、非凡规则和牺牲情绪绑定。" },
      { label: "序列晋升与污染代价", keywords: ["序列", "魔药", "晋升", "消化", "失控", "污染"], source: "https://docs.sillytavern.app/usage/core-concepts/worldinfo/", note: "适合拆成可检索规则条目：触发词、代价、升级条件和禁忌。" }
    ]
  },
  {
    name: "覆汉",
    genre: "历史穿越 + 汉末群雄 + 政治军事",
    rules: [
      { focus: "乱世入口与身份站位", category: "开局结构", keywords: ["楔子", "卢龙塞", "汉", "边", "郡", "公孙", "少年"] },
      { focus: "士族名望与人脉经营", category: "人物关系", keywords: ["士", "名", "门第", "故人", "拜访", "举荐", "世家"] },
      { focus: "州郡治理与制度博弈", category: "设定模式", keywords: ["州", "郡", "县", "太守", "刺史", "朝廷", "政"] },
      { focus: "军阵征伐与战局推进", category: "战斗或竞赛", keywords: ["军", "兵", "战", "骑", "营", "将", "攻", "守"] },
      { focus: "群雄联盟与政治选择", category: "冲突升级", keywords: ["袁", "曹", "刘", "董", "联盟", "诸侯", "朝堂"] },
      { focus: "历史节点改写与长期结算", category: "伏笔与回收", keywords: ["天下", "称", "帝", "汉室", "大势", "归", "终"] }
    ],
    coreStructure:
      "以汉末真实历史压力为大框架，让主角在身份、人脉、治理、军事和政治选择中逐步改变局势，爽点来自历史节点的重新解释和长期经营结算。",
    strengths: ["历史大势自带悬念", "人物关系和阵营选择密度高", "治理与军事双线推进", "读者熟悉史实带来改写期待"],
    settingDimensions: ["汉末州郡制度", "士族关系网", "军政资源", "群雄阵营", "历史节点", "主角政治合法性"],
    highlightDimensions: ["边塞立身", "名士交游", "州郡治理", "关键战役", "阵营选择", "历史节点改写"],
    reusableMechanisms: ["史实预期差", "政治合法性升级", "人脉即资源", "治理成果转化为军事能力"],
    onlineSignals: [
      { label: "汉末政治合法性", keywords: ["汉", "朝廷", "天子", "州", "郡", "士"], source: "https://www.zhihu.com/question/26458344", note: "历史小说讨论常围绕史实、人物选择和政治合法性展开。" },
      { label: "边塞立身与军政经营", keywords: ["卢龙塞", "边", "军", "骑", "太守", "州郡"], source: "https://www.qidian.com/book/1011526746/", note: "拆解时重点看主角如何把边地资源转成名望、兵权和政治筹码。" }
    ]
  },
  {
    name: "高武纪元",
    genre: "现代高武 + 星界战争 + 武道升级",
    rules: [
      { focus: "校园武道与天赋起步", category: "开局结构", keywords: ["李源", "高考", "武道", "身体素质", "学校", "老师", "训练"] },
      { focus: "资源训练与数值成长", category: "设定模式", keywords: ["气血", "精神力", "训练", "源力", "功法", "星脉", "等级"] },
      { focus: "公开考核与战力验证", category: "战斗或竞赛", keywords: ["考核", "比赛", "排名", "挑战", "对战", "胜", "枪法"] },
      { focus: "星界地图与异族压力", category: "地图展开", keywords: ["星界", "异族", "神域", "文明", "战场", "入侵", "界"] },
      { focus: "组织培养与身份跃迁", category: "人物关系", keywords: ["武殿", "老师", "师兄", "联盟", "学院", "传承", "始祖"] },
      { focus: "神明位格与文明战争", category: "伏笔与回收", keywords: ["神明", "半神", "真神", "始祖", "文明", "宇宙", "终"] }
    ],
    coreStructure:
      "用现代校园和数值化训练建立低门槛成长线，再把武道成长推入星界和文明战争，让个人战力、组织资源和世界危机持续放大。",
    strengths: ["数值成长清晰", "校园竞赛到星界战争的地图递进顺滑", "训练反馈快", "个人武道和文明危机能并行升级"],
    settingDimensions: ["武道等级", "训练资源", "校园和考核", "星界地图", "异族和文明战争", "神明位格"],
    highlightDimensions: ["第一次战力验证", "训练突破", "公开排名", "星界初见", "跨文明战场", "位格跃迁"],
    reusableMechanisms: ["数值化成长反馈", "校园竞赛过渡到世界战争", "组织培养和个人天赋结合", "大地图带动战力上限"],
    onlineSignals: [
      { label: "现代高武训练反馈", keywords: ["李源", "身体素质", "训练", "高考", "排名", "枪法"], source: "https://www.qidian.com/book/1039141715/", note: "读者期待集中在数值化训练、考试排名和战力验证。" },
      { label: "星界与文明战争", keywords: ["星界", "异族", "文明", "神域", "始祖", "真神"], source: "https://www.qidian.com/book/1039141715/catalog/", note: "中后期看点在个人成长如何接入更高层级战场和文明危机。" }
    ]
  },
  {
    name: "光阴之外",
    genre: "黑暗修仙 + 底层生存 + 神灵污染",
    rules: [
      { focus: "底层生存与危险环境", category: "开局结构", keywords: ["活着", "拾荒", "贫民", "营地", "禁区", "异质", "少年"] },
      { focus: "宗门秩序与残酷晋升", category: "设定模式", keywords: ["七血瞳", "宗门", "弟子", "筑基", "金丹", "执剑", "序列"] },
      { focus: "禁区探索与污染压力", category: "地图展开", keywords: ["禁区", "异质", "污染", "神灵", "诡异", "红月", "神性"] },
      { focus: "杀伐对抗与生存反击", category: "战斗或竞赛", keywords: ["杀", "战", "血", "追杀", "镇压", "出手", "敌"] },
      { focus: "同伴关系与身份归属", category: "人物关系", keywords: ["队长", "师尊", "朋友", "伙伴", "紫玄", "执剑者", "归属"] },
      { focus: "神灵真相与位格抬升", category: "伏笔与回收", keywords: ["神", "主宰", "古皇", "帝", "命运", "真相", "终"] }
    ],
    coreStructure:
      "用高压、脏冷、残酷的底层生存开局建立质感，再让主角在宗门、禁区、战争和神灵污染中逐层获得身份、力量和归属。",
    strengths: ["生存质感强", "黑暗环境制造持续紧张", "同伴关系能缓冲残酷底色", "污染和神灵体系提供高位格压迫"],
    settingDimensions: ["底层生存环境", "宗门晋升", "禁区和异质", "神灵污染", "同伴关系", "高位格真相"],
    highlightDimensions: ["底层求生", "第一次加入组织", "禁区探索", "残酷反杀", "同伴羁绊", "神灵压迫"],
    reusableMechanisms: ["残酷环境压强", "生存目标驱动", "归属感作为长期奖励", "污染规则制造恐惧和升级代价"],
    onlineSignals: [
      { label: "底层生存质感", keywords: ["活着", "拾荒", "异质", "贫民", "营地", "禁区"], source: "https://www.qidian.com/book/1031777108/", note: "高讨论价值来自开局的残酷生存压力和环境质感。" },
      { label: "队长与同伴关系", keywords: ["队长", "七血瞳", "执剑", "师尊", "朋友", "归属"], source: "https://www.zhihu.com/question/584520186", note: "读者讨论常集中在残酷底色中出现的同伴羁绊和归属感。" },
      { label: "神灵污染和红月压迫", keywords: ["神灵", "红月", "污染", "异质", "主宰", "古皇"], source: "https://www.qidian.com/book/1031777108/", note: "世界观亮点在于污染规则和神灵位格对日常生存的压迫。" }
    ]
  },
  {
    name: "鸣龙",
    genre: "志怪轻喜剧 + 妖鬼案件 + 江湖庙堂",
    rules: [
      { focus: "妖鬼误会与轻喜剧开局", category: "开局结构", keywords: ["妖寇", "鬼", "阿飘", "误会", "自投罗网", "不对劲", "小机灵"] },
      { focus: "案件调查与线索推进", category: "剧情桥段", keywords: ["线索", "蛛丝马迹", "调查", "寻迹", "真相", "发现", "栽赃"] },
      { focus: "江湖关系与暧昧拉扯", category: "人物关系", keywords: ["姑娘", "女侠", "媳妇", "美人", "小姨", "太后", "情劫"] },
      { focus: "法器功法与能力误用", category: "设定模式", keywords: ["法器", "功法", "梦中传道", "妖术", "蛊毒", "宝甲", "显微镜"] },
      { focus: "庙堂江湖与势力牵连", category: "冲突升级", keywords: ["大乾", "朝廷", "太后", "县", "客栈", "京", "刺驾"] },
      { focus: "妖鬼秘密与阶段回收", category: "伏笔与回收", keywords: ["秘密", "执念", "梦境", "旧事", "寒潮", "血妖", "回京"] }
    ],
    coreStructure:
      "用妖鬼误会、轻喜剧语言和案件线索降低志怪题材门槛，再通过江湖人物关系和庙堂牵连把单元案件推向长线阴谋。",
    strengths: ["标题和桥段有强喜剧钩子", "妖鬼案件适合单元推进", "人物拉扯提供情绪黏性", "江湖和庙堂能自然扩地图"],
    settingDimensions: ["妖鬼规则", "法器功法", "案件线索", "江湖关系", "大乾庙堂", "长线秘密"],
    highlightDimensions: ["误会反转", "鬼怪案件", "轻喜剧吐槽", "人物暧昧拉扯", "江湖势力登场", "旧案回收"],
    reusableMechanisms: ["喜剧误会承载悬疑", "单元案件串长线阴谋", "吐槽标题增强追读", "人物关系制造章节间黏性"],
    onlineSignals: [
      { label: "妖鬼误会轻喜剧", keywords: ["妖寇", "鬼", "阿飘", "误会", "不对劲", "小机灵"], source: "https://www.qidian.com/book/1039457453/", note: "标题和桥段显示本书用误会、吐槽和妖鬼案件制造轻喜剧追读。" },
      { label: "案件线索和江湖庙堂牵连", keywords: ["线索", "调查", "大乾", "刺驾", "太后", "回京"], source: "https://www.qidian.com/book/1039457453/catalog/", note: "适合拆成单元案件如何逐步牵出长线阴谋。" }
    ]
  }
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
  if (chapters.length === 0) {
    throw new Error(`未解析到章节标题：${meta.bookSourceFile}`);
  }
  const title = meta.title ?? path.basename(meta.bookSourceFile);
  const profile = inferBookProfile(title);
  const segments = buildSegments(chapters, segmentSize, profile);

  await cleanGeneratedOutputs(meta.bookDir);
  await writeBookMap(meta.bookDir, chapters, segments);
  await writeSegments(meta.bookDir, segments, profile);
  await writeMaterialCards(meta.bookDir, segments, profile);
  await writeSynthesis(meta.bookDir, title, chapters, segments, profile);
  await writeSettingArchive(meta.bookDir, title, chapters, segments, profile);
  await writeStrengthArchive(meta.bookDir, title, segments, profile);
  await writeHighlightArchive(meta.bookDir, title, segments, profile);
  await writeDeepSettingArchive(meta.bookDir, title, chapters, segments, profile);
  await writeDeepStrengthArchive(meta.bookDir, title, chapters, segments, profile);
  await writeDeepHighlightArchive(meta.bookDir, title, chapters, segments, profile);
  await writeQualityAudit(meta.bookDir, title, segments, profile);
  await writeRunOutputs(runDir, meta.bookDir, title, chapters, segments, profile);

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

function buildSegments(chapters: Chapter[], segmentSize: number, profile: BookProfile): Segment[] {
  const segments: Segment[] = [];
  for (let start = 0; start < chapters.length; start += segmentSize) {
    const slice = chapters.slice(start, start + segmentSize);
    const text = `${slice.map((chapter) => chapter.title).join("\n")}\n${slice.map((chapter) => chapter.text.slice(0, 1200)).join("\n")}`;
    const rule = inferFocus(text, profile);
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

function inferBookProfile(title: string): BookProfile {
  const matched = BOOK_PROFILES.find((profile) => title.includes(profile.name) || profile.name.includes(title));
  return (
    matched ?? {
      name: title,
      genre: "长篇类型小说",
      rules: GENERIC_RULES,
      coreStructure: "用阶段目标、冲突压力、能力成长和地图扩张推动长篇阅读期待。",
      strengths: ["阶段目标清晰", "冲突持续升级", "能力和身份递进", "地图逐步展开"],
      settingDimensions: ["世界规则", "能力体系", "资源体系", "组织关系", "地图层级", "终局秘密"],
      highlightDimensions: ["开局钩子", "能力入门", "公开对抗", "大事件", "身份升级", "伏笔回收"],
      reusableMechanisms: ["阶段目标闭环", "能力成长反馈", "组织资源升级", "地图扩张带动冲突"],
      onlineSignals: []
    }
  );
}

function inferFocus(text: string, profile: BookProfile): { focus: string; category: string; keywords: string[] } {
  const rules = [...profile.rules, ...GENERIC_RULES];
  let best = rules[0];
  let bestScore = -1;
  for (const rule of rules) {
    const score = rule.keywords.reduce((sum, keyword) => sum + occurrences(text, keyword), 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : profile.rules[0];
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
  await rm(path.join(bookDir, "synthesis", "设定沉淀.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "优点与可复用机制.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "高光片段与亮点.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "深度设定沉淀.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "深度优点机制.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "深度高光片段.md"), { force: true });
  await rm(path.join(bookDir, "synthesis", "质量审计.md"), { force: true });
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

async function writeSegments(bookDir: string, segments: Segment[], profile: BookProfile): Promise<void> {
  for (const segment of segments) {
    await writeText(path.join(bookDir, "segments", `${segment.title}.md`), renderSegmentReport(segment, profile));
  }
}

function renderSegmentReport(segment: Segment, profile: BookProfile): string {
  const titles = segment.chapters.map((chapter) => `- ${chapter.index}. ${chapter.title}`).join("\n");
  const signals = inferSegmentSignals(segment, profile);
  return `# 分段拆书报告：第 ${segment.start}-${segment.end} 章 ${segment.focus}

## 章节范围

${titles}

## 阶段目标

本段主要承担“${segment.focus}”功能，归属于《${profile.name}》的“${profile.genre}”拆书画像。它把前一阶段的目标继续推进，并为后续阶段提供新的资源、身份、冲突、设定接口或情绪期待。

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

function inferSegmentSignals(segment: Segment, profile: BookProfile): {
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
  const settings = [
    `强化“${segment.focus}”所需的制度、资源、能力或地图设定。`,
    `本书画像要求持续追踪：${profile.settingDimensions.slice(0, 4).join("、")}。`
  ];
  const relationships = [`围绕“${profile.genre}”的核心关系网，记录同伴、导师、组织、对手、交易方或上位力量的变化。`];
  const conflicts = ["冲突不只来自敌人，也来自制度门槛、资源成本、知识差、身份差和环境风险。"];
  const payoffs = ["爽点多以小目标兑现呈现：获得资源、学到方法、赢下对抗、打开地图、升级身份或解锁秘密。"];
  const hooks = ["通过新资源、新能力、新人物、新地图或未解秘密把读者引到下一段。"];
  const reusable = [
    `可复用“${segment.focus}”作为一个阶段功能模块，而不是复用具体剧情。`,
    `本书可优先抽象的机制包括：${profile.reusableMechanisms.slice(0, 3).join("、")}。`
  ];

  if (has("斗法") || has("决赛") || has("胜利") || has("战术") || has("战") || has("杀")) {
    conflicts.push("斗法段适合写规则理解、赛前准备、对手情报、临场误导和底牌兑现。");
    payoffs.push("战斗爽点来自准备和组合技，而不是单纯境界压制。");
    reusable.push("比赛/擂台/考核可以作为低成本高密度爽点容器。");
  }
  if (has("坊市") || has("交易") || has("灵石") || has("进货") || has("摆摊") || has("钱") || has("资源")) {
    settings.push("交易场景用于把抽象资源转成价格、渠道、风险和利润。");
    reusable.push("资源变现段要写清楚来源、渠道、认证、价格和风险。");
  }
  if (has("筑基") || has("结丹") || has("金丹") || has("元婴") || has("晋升") || has("突破") || has("升级")) {
    hooks.push("等级/境界/序列/身份词本身就是强钩子，适合搭配资源筹备和失败风险。");
    payoffs.push("能力推进最好和身份、资源、组织地位一起结算。");
  }
  if (has("魔主") || has("寂灭") || has("元始") || has("合道") || has("神") || has("真相") || has("终")) {
    settings.push("终局段把早期道具、规则、身份或世界秘密提升到更高位格。");
    reusable.push("终局回收应把早期小钩子解释为高位格体系的一部分。");
  }

  return { eventChain, settings, relationships, conflicts, payoffs, hooks, reusable };
}

async function writeMaterialCards(bookDir: string, segments: Segment[], profile: BookProfile): Promise<void> {
  for (const segment of segments) {
    const fileName = `${String(segment.index).padStart(3, "0")}-${slug(segment.focus)}.md`;
    await writeText(path.join(bookDir, "material-cards", fileName), renderMaterialCard(segment, profile));
  }
}

function renderMaterialCard(segment: Segment, profile: BookProfile): string {
  return `# 素材卡：${segment.focus}

## 分类

${segment.category}

## 来源章节范围

第 ${segment.start}-${segment.end} 章

## 原始功能

本段在《${profile.name}》中承担“${segment.focus}”功能，连接阶段目标、资源获取、冲突推进、情绪兑现和后续钩子。

## 抽象复用方式

把这个段落当作一个可复用阶段模块：先明确阶段目标，再设置资源或制度门槛，通过若干小事件推进，最后用新能力、新地图、新身份或新秘密作为下一段钩子。

## 可变体方向

- 本书画像：${profile.genre}
- 可迁移机制：${profile.reusableMechanisms.join("、")}
- 适配方式：保留阶段功能，替换世界规则、人物关系、资源形态和冲突场景。

## 复用边界

只复用阶段功能和节奏，不复用原书连续事件链、人物名、势力名和专有设定组合。

## 标签

${segment.keywords.join("、")}
`;
}

async function writeSynthesis(bookDir: string, title: string, chapters: Chapter[], segments: Segment[], profile: BookProfile): Promise<void> {
  const focusCounts = countBy(segments.map((segment) => segment.focus));
  await writeText(
    path.join(bookDir, "synthesis", "全书拆书总报告.md"),
    `# 全书拆书总报告：《${title}》

## 拆书范围

- 章节数：${chapters.length}
- 分段数：${segments.length}
- 默认分段规模：约 20 章

## 全书结构学习

类型画像：${profile.genre}

${profile.coreStructure}

## 阶段功能分布

${Object.entries(focusCounts)
  .map(([focus, count]) => `- ${focus}：${count} 个分段`)
  .join("\n")}

## 关键生产启发

${profile.strengths.map((item) => `- ${item}`).join("\n")}

## 后续人工精修建议

自动全拆已经覆盖所有章节，但每段报告仍是初拆粒度。后续应优先围绕这些方向做二次精拆：${profile.highlightDimensions.join("、")}。
`
  );
}

async function writeSettingArchive(
  bookDir: string,
  title: string,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): Promise<void> {
  const firstTitles = chapters.slice(0, 12).map((chapter) => chapter.title).join("、");
  const lastTitles = chapters.slice(-12).map((chapter) => chapter.title).join("、");
  await writeText(
    path.join(bookDir, "synthesis", "设定沉淀.md"),
    `# 设定沉淀：《${title}》

## 类型画像

${profile.genre}

## 设定维度

${profile.settingDimensions.map((item) => `- ${item}`).join("\n")}

## 开局设定信号

${firstTitles}

## 终局设定信号

${lastTitles}

## 分段设定索引

${segments.map((segment) => `- 第 ${segment.start}-${segment.end} 章：${segment.focus}，主要承载 ${segment.category}。`).join("\n")}

## 后续二次精拆要求

- 从正文中抽取设定名词、规则、代价、资源来源、组织结构和地图层级。
- 标记首次出现章节、后续升级章节、回收章节。
- 区分可复用规则和不可迁移专有名词。
`
  );
}

async function writeStrengthArchive(bookDir: string, title: string, segments: Segment[], profile: BookProfile): Promise<void> {
  const mechanisms = buildMechanisms(profile);
  await writeText(
    path.join(bookDir, "synthesis", "优点与可复用机制.md"),
    `# 优点与可复用机制：《${title}》

## 核心优点

${profile.strengths.map((item) => `- ${item}`).join("\n")}

## 可复用机制

${mechanisms.map((item) => `- ${item}`).join("\n")}

## 机制落点

${mechanisms
  .map((mechanism) => {
    const matched = segments.find((segment) => segment.focus.includes(mechanism.slice(0, 2)) || segment.category.includes("设定"));
    return `- ${mechanism}：可从第 ${matched?.start ?? segments[0]?.start}-${matched?.end ?? segments[0]?.end} 章附近开始二次精拆。`;
  })
  .join("\n")}

## 复用边界

- 只复用机制，不复用原书人物名、势力名、道具名、专有规则组合。
- 复用时必须替换题材包装、资源形态、组织结构和阶段事件链。
`
  );
}

async function writeHighlightArchive(bookDir: string, title: string, segments: Segment[], profile: BookProfile): Promise<void> {
  const highlights = selectHighlightSegments(segments, profile);
  await writeText(
    path.join(bookDir, "synthesis", "高光片段与亮点.md"),
    `# 高光片段与亮点：《${title}》

## 高光维度

${profile.highlightDimensions.map((item) => `- ${item}`).join("\n")}

## 候选高光片段

${highlights
  .map(
    (segment) => `## 第 ${segment.start}-${segment.end} 章：${segment.focus}

- 章节标题信号：${segment.chapters.slice(0, 8).map((chapter) => chapter.title).join("、")}
- 亮点判断：本段命中“${segment.focus}”，适合二次精拆其冲突铺垫、爽点兑现、设定增量和结尾钩子。
- 可复用方向：${buildMechanisms(profile).slice(0, 3).join("、")}。
`
  )
  .join("\n")}
`
  );
}

function selectHighlightSegments(segments: Segment[], profile: BookProfile): Segment[] {
  const picked: Segment[] = [];
  for (const dimension of profile.highlightDimensions) {
    const segment = segments.find((item) => item.focus.includes(dimension.slice(0, 2))) ?? segments.find((item) => item.category !== "开局结构");
    if (segment && !picked.includes(segment)) {
      picked.push(segment);
    }
  }
  return picked.slice(0, 10);
}

async function writeDeepSettingArchive(
  bookDir: string,
  title: string,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): Promise<void> {
  await writeText(
    path.join(bookDir, "synthesis", "深度设定沉淀.md"),
    `# 深度设定沉淀：《${title}》

## 生成原则

本文件是增量深拆产物，用于后续设定生成和长篇写作参考。它不复述原文，不迁移专有组合，只沉淀可复用的规则、结构、代价、阶段变化和写法价值。

## 外部讨论信号

${renderOnlineSignals(profile)}

## 设定条目

${profile.settingDimensions.map((dimension, index) => renderDeepSettingEntry(dimension, index, chapters, segments, profile)).join("\n")}
`
  );
}

function renderDeepSettingEntry(
  dimension: string,
  index: number,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): string {
  const matched = findRepresentativeSegments(dimension, segments, profile, 4, index);
  const signal = profile.onlineSignals[index % Math.max(profile.onlineSignals.length, 1)];
  const segmentSignals = matched
    .map((segment) => `第 ${segment.start}-${segment.end} 章的标题线索包括：${segment.chapters.slice(0, 4).map((chapter) => chapter.title).join("、")}。`)
    .join(" ");
  return `### ${index + 1}. ${dimension}

**设定定义**：在《${profile.name}》里，“${dimension}”不是单独的背景名词，而是支撑“${profile.genre}”阅读体验的规则层。它需要同时回答三个问题：这个世界如何运行，主角能从中拿到什么，读者为什么愿意继续看它被升级或打破。

**剧情落点**：代表段落是 ${matched.map((segment) => `第 ${segment.start}-${segment.end} 章“${segment.focus}”`).join("；")}。${segmentSignals}这些章节不是简单解释设定，而是让设定和事件绑定：读者通过角色遇到的机会、阻力、组织评价或环境危险来理解规则。

**运行规则**：这一设定通常通过阶段事件逐步显形，而不是开篇一次性讲完。先用具体困境或机会让读者感到它存在，再通过组织、资源、能力、地图或敌人展示它的边界，最后让主角用理解规则的方式获得优势。对“${dimension}”来说，最重要的是让读者知道它如何影响主角的行动空间：能不能进入某个圈层，能不能获得某种资源，是否会被更强势力识别、利用或清算。

**代价与限制**：设定好看的关键在于有成本。它不能只给主角奖励，还要带来身份风险、资源消耗、知识门槛、组织约束、道德压力或更高位格凝视。写新书时要保留“拿到收益的同时增加新问题”的结构，否则设定会变成外挂说明书。

**人物和势力接口**：这个设定应当连接至少三类角色：帮助主角理解规则的人，因规则受益或受损的人，以及试图垄断规则解释权的人。这样设定才会转化为人物关系、冲突和剧情推进，而不是孤立百科条目。拆这类设定时，要继续追问：谁制定规则，谁解释规则，谁因为主角理解规则而损失利益。

**阶段变化**：前期承担入门和解释，中期承担升级、交易、考核或组织化，后期承担世界观抬升或伏笔回收。全书 ${chapters.length} 章的体量要求设定多次变形：第一次出现解决局部问题，第二次升级打开新地图，第三次回收解释更大的世界规则。如果一个设定只出现一次，它不是长篇资产；只有反复改变主角处境，才值得沉淀。

**为什么值得借鉴**：它把抽象世界观变成可写的剧情机器。读者不是因为知道名词而兴奋，而是因为设定持续改变主角的选择空间：能去哪里、能学什么、能换到什么、会被谁盯上、下一步要付出什么。对后续自动写作系统来说，这类设定应该进入单书设定集，而不是只留在摘要里。

**复用边界**：可以复用“规则分层、成本递增、人物接口、阶段升级”的结构；不能复用本书具体专有名词、人物关系组合、连续事件链和标志性表达。${signal ? `外部讨论信号“${signal.label}”提示：${signal.note}` : ""}
`;
}

async function writeDeepStrengthArchive(
  bookDir: string,
  title: string,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): Promise<void> {
  await writeText(
    path.join(bookDir, "synthesis", "深度优点机制.md"),
    `# 深度优点机制：《${title}》

## 总体判断

${profile.coreStructure}

这本书的可借鉴价值不在单个桥段，而在若干机制反复工作：它们让设定能继续升级，让爽点有兑现方式，让中长篇不只靠打怪和换地图维持。

## 机制拆解

${buildMechanisms(profile).map((mechanism, index) => renderDeepMechanismEntry(mechanism, index, chapters, segments, profile)).join("\n")}
`
  );
}

function renderDeepMechanismEntry(
  mechanism: string,
  index: number,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): string {
  const matched = findRepresentativeSegments(mechanism, segments, profile, 3, index);
  return `### ${index + 1}. ${mechanism}

**机制原理**：这个机制把“${profile.genre}”的题材承诺转成稳定剧情收益。它不是单次爽点，而是一套可重复使用的因果链：先让主角遇到规则或压力，再让主角找到局部解法，随后用新收益引出更高层问题。

**本书中的工作方式**：代表段落包括 ${matched.map((segment) => `第 ${segment.start}-${segment.end} 章“${segment.focus}”`).join("、")}。这些段落通常不是孤立事件，而是把能力、身份、资源、关系和地图连接起来，让读者看到主角的选择空间扩大。

**为什么好看**：它同时满足三个期待。第一，读者能看懂主角为什么赢，不是纯靠作者说他强。第二，胜利会改变后续局面，带来新身份、新敌人或新地图。第三，机制本身有成本或限制，所以不会把悬念提前耗尽。

**适用题材**：男频玄幻、仙侠、都市重生、科幻、高武、历史和西幻都可以迁移，但必须换掉题材包装。比如把“资源”替换成金钱、权限、论文成果、军政声望、科技组件或非凡材料，把“组织”替换成宗门、学院、公司、军队、教会或秘密结社。

**改写方法**：新书使用时先确定低阶版本，再设计中阶升级和高阶回收。每次使用都要写清楚：主角付出什么、利用什么认知差、获得什么可见收益、留下什么新问题。

**失败风险**：如果只借用表面名词，不复制因果链，这个机制会变成空设定。如果没有代价，它会变成无脑外挂。如果没有组织或人物接口，它会失去长篇扩展能力。全书 ${chapters.length} 章的体量说明该机制需要多次变形，不能一次用完。
`;
}

async function writeDeepHighlightArchive(
  bookDir: string,
  title: string,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): Promise<void> {
  const highlights = selectDeepHighlightSegments(chapters, segments, profile);
  await writeText(
    path.join(bookDir, "synthesis", "深度高光片段.md"),
    `# 深度高光片段：《${title}》

## 选取原则

- 高光数量按体量动态确定。本书共 ${chapters.length} 章，本次选择 ${highlights.length} 个候选高光片段。
- 候选依据包括：章节标题密度、全书阶段功能、设定升级、冲突强度、伏笔回收，以及网上书评/讨论中反复出现的关键词信号。
- 本文件只总结剧情功能和写法机制，不复制原文章节正文。

## 外部讨论信号

${renderOnlineSignals(profile)}

## 高光片段详拆

${highlights.map((segment, index) => renderDeepHighlightEntry(segment, index, segments, profile)).join("\n")}
`
  );
}

function selectDeepHighlightSegments(chapters: Chapter[], segments: Segment[], profile: BookProfile): Segment[] {
  const target = determineHighlightTarget(chapters.length);
  const scored = segments.map((segment) => ({ segment, score: scoreHighlightSegment(segment, profile) }));
  const picked: Segment[] = [];

  for (const signal of profile.onlineSignals) {
    const matched = scored
      .filter(({ segment }) => includesAny(textOfSegment(segment), signal.keywords))
      .sort((a, b) => b.score - a.score)[0]?.segment;
    if (matched && !picked.includes(matched)) {
      picked.push(matched);
    }
  }

  for (const dimension of profile.highlightDimensions) {
    const matched = scored
      .filter(({ segment }) => textOfSegment(segment).includes(dimension.slice(0, 2)) || segment.focus.includes(dimension.slice(0, 2)))
      .sort((a, b) => b.score - a.score)[0]?.segment;
    if (matched && !picked.includes(matched)) {
      picked.push(matched);
    }
  }

  for (const { segment } of scored.sort((a, b) => b.score - a.score)) {
    if (!picked.includes(segment)) {
      picked.push(segment);
    }
    if (picked.length >= target) {
      break;
    }
  }

  return picked.slice(0, target).sort((a, b) => a.start - b.start);
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

function scoreHighlightSegment(segment: Segment, profile: BookProfile): number {
  const text = textOfSegment(segment);
  const onlineScore = profile.onlineSignals.reduce(
    (sum, signal) => sum + signal.keywords.reduce((inner, keyword) => inner + occurrences(text, keyword) * 4, 0),
    0
  );
  const dimensionScore = profile.highlightDimensions.reduce((sum, dimension) => sum + (text.includes(dimension.slice(0, 2)) ? 3 : 0), 0);
  const focusScore = profile.rules.reduce((sum, rule) => sum + (segment.focus === rule.focus ? 2 : 0), 0);
  const titleIntensity = occurrences(text, "！") + occurrences(text, "？") + occurrences(text, "真相") + occurrences(text, "胜") + occurrences(text, "杀");
  return onlineScore + dimensionScore + focusScore + titleIntensity;
}

function renderDeepHighlightEntry(segment: Segment, index: number, segments: Segment[], profile: BookProfile): string {
  const previous = segments.find((item) => item.index === segment.index - 1);
  const next = segments.find((item) => item.index === segment.index + 1);
  const matchedSignals = profile.onlineSignals.filter((signal) => includesAny(textOfSegment(segment), signal.keywords));
  const mechanisms = buildMechanisms(profile);
  const firstTitles = segment.chapters.slice(0, 5).map((chapter) => chapter.title).join("、");
  const middleTitles = segment.chapters
    .slice(Math.max(0, Math.floor(segment.chapters.length / 2) - 2), Math.floor(segment.chapters.length / 2) + 2)
    .map((chapter) => chapter.title)
    .join("、");
  const lastTitles = segment.chapters.slice(-4).map((chapter) => chapter.title).join("、");
  return `### ${index + 1}. 第 ${segment.start}-${segment.end} 章：${segment.focus}

**剧情概述**：这一段从“${firstTitles}”一组章节信号切入，逐步把读者带入“${segment.focus}”的阶段目标；后段又通过“${lastTitles}”把阶段问题推向新的结果或悬念。它不是单章爆点，而是一个局部剧情单元：先让主角面对新压力或新机会，再让主角调用已有能力、关系或信息差处理问题，最后把收益转化为下一阶段的身份、地图、敌人或规则变化。

**剧情拆分**：

- 起点：${firstTitles}。这一组标题通常负责抛出新处境、新目标或新压力，让读者知道本段要解决什么。
- 推进：${middleTitles || firstTitles}。中段负责把压力具体化，加入人物、组织、资源、规则或敌对力量，使问题不只是单点事件。
- 结果：${lastTitles}。结尾要么给阶段收益，要么留下更高层问题，用来牵引下一段。

**前置铺垫**：${previous ? `上一段“第 ${previous.start}-${previous.end} 章：${previous.focus}”已经提供了读者理解本段所需的背景、目标或压力。` : "开局段需要快速建立主角处境、世界规则和第一层压力。"}本段的高光成立，依赖读者已经接受《${profile.name}》的类型承诺：${profile.genre}。如果前置铺垫不足，同样的桥段会显得突兀。

**冲突设计**：本段的冲突核心不是单纯“打赢一个敌人”，而是让主角在规则、资源、身份、关系或认知差中做选择。优秀之处在于冲突有可解释的限制：主角不能随手解决所有问题，必须利用前面积累的能力和信息，并承担新的代价。

**当场爽点**：爽点来自阶段兑现：读者能看到主角的判断、准备或能力产生结果。这个结果可能是赢下对抗、获得资源、解锁设定、提高身份、完成反转，或者确认一个更大秘密。它的价值在于“结果可见”，不是只做设定说明。

**后续影响**：${next ? `下一段“第 ${next.start}-${next.end} 章：${next.focus}”说明本段结果继续外溢，没有停在单次事件。` : "作为尾段或接近尾段内容，它承担收束、回收或抬升世界观的功能。"}高光片段要能改变后续局面，否则只能算一次短促刺激，不能支撑长篇。

**为什么好**：它同时做了三件事：推进剧情、更新设定、制造读者期待。读者获得的不只是“发生了什么”，而是“主角因此能做什么、会被谁注意、下一层规则是什么”。尤其是当“${segment.focus}”和本书的核心机制“${mechanisms[index % mechanisms.length]}”结合时，桥段就会从普通事件变成可复用的长篇结构。

**可复用写法**：可以复用这一段的功能链：前置压力 -> 规则限制 -> 主角利用信息差或能力组合 -> 当场兑现 -> 留下新问题。迁移到新书时，把资源形态、组织关系、能力体系和场景换掉，保留因果顺序。新作品中还要明确“读者等的是什么”：等主角赢、等真相揭开、等身份升级，还是等关系反转。

**不可复用元素**：不要复用原书人物名、组织名、专有道具名、连续事件链和标志性表达。可借的是“高光如何被铺垫和兑现”，不是桥段表皮。

**网上讨论信号**：${matchedSignals.length > 0 ? matchedSignals.map((signal) => `${signal.label}（${signal.note} 来源：${signal.source}）`).join("；") : "未命中特定外部讨论关键词，本段由章节密度和阶段功能选出。"}
`;
}

function buildMechanisms(profile: BookProfile): string[] {
  const mechanisms = unique([...profile.reusableMechanisms, ...profile.strengths]);
  return mechanisms.length >= 5 ? mechanisms : unique([...mechanisms, ...profile.highlightDimensions]).slice(0, 5);
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

function renderOnlineSignals(profile: BookProfile): string {
  if (profile.onlineSignals.length === 0) {
    return "- 暂无外部讨论信号；本次按本地正文、章节索引和类型画像筛选。";
  }
  return profile.onlineSignals.map((signal) => `- ${signal.label}：${signal.note} 来源：${signal.source}`).join("\n");
}

function findRepresentativeSegments(
  seed: string,
  segments: Segment[],
  profile: BookProfile,
  limit: number,
  offset: number
): Segment[] {
  const keywords = [
    seed,
    ...profile.rules.flatMap((rule) => rule.focus.includes(seed.slice(0, 2)) ? rule.keywords : []),
    ...profile.onlineSignals.flatMap((signal) => signal.label.includes(seed.slice(0, 2)) ? signal.keywords : [])
  ];
  const matched = segments.filter((segment) => includesAny(textOfSegment(segment), keywords));
  if (matched.length > 0) {
    return matched.slice(0, limit);
  }
  return segments.slice(offset, offset + limit).length > 0 ? segments.slice(offset, offset + limit) : segments.slice(0, limit);
}

function textOfSegment(segment: Segment): string {
  return `${segment.focus}\n${segment.category}\n${segment.chapters.map((chapter) => `${chapter.title}\n${chapter.text.slice(0, 280)}`).join("\n")}`;
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => keyword.length > 0 && text.includes(keyword));
}

async function writeQualityAudit(bookDir: string, title: string, segments: Segment[], profile: BookProfile): Promise<void> {
  const xianxiaOnlyTerms = ["现代仙门", "水府", "龟壳", "坊市", "制符", "道院", "筑基", "结丹", "元婴", "魔主"];
  const isXianxiaProfile = profile.name === "我有一个修仙世界" || profile.genre.includes("修仙");
  const suspicious = isXianxiaProfile
    ? []
    : segments.filter((segment) => xianxiaOnlyTerms.some((term) => segment.focus.includes(term)));
  await writeText(
    path.join(bookDir, "synthesis", "质量审计.md"),
    `# 质量审计：《${title}》

## 自动检查

- 类型画像：${profile.genre}
- 分段数：${segments.length}
- 疑似跨书标签：${suspicious.length === 0 ? "无" : suspicious.map((segment) => `第 ${segment.start}-${segment.end} 章 ${segment.focus}`).join("；")}

## 仍需人工复核

- 自动初拆只读取章节标题和局部正文片段，不能替代逐段精读。
- 高光片段只是候选，需要二次精拆确认具体桥段、设定增量、人物关系变化和爽点兑现。
- 如果出现与本书类型画像不一致的标签，应优先修正画像规则，再重跑。
`
  );
}

function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    result[item] = (result[item] ?? 0) + 1;
    return result;
  }, {});
}

async function writeRunOutputs(
  runDir: string,
  bookDir: string,
  title: string,
  chapters: Chapter[],
  segments: Segment[],
  profile: BookProfile
): Promise<void> {
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
- 设定沉淀
- 优点与可复用机制
- 高光片段与亮点
- 深度设定沉淀
- 深度优点机制
- 深度高光片段
- 质量审计

## 本次写入素材库的分段条目

${segments.map((segment) => `- ${segment.focus}：第 ${segment.start}-${segment.end} 章`).join("\n")}

## 类型画像

${profile.genre}
`
  );

  await writeText(
    path.join(runDir, "output", "material-updates.json"),
    JSON.stringify(
      {
        targetLibrary: "全局素材库",
        items: segments.map((segment) => ({
          title: `${title}：${segment.focus}（第${segment.start}-${segment.end}章）`,
          summary: `本素材来自《${title}》全量长程拆书第 ${segment.start}-${segment.end} 章，适合作为“${segment.focus}”阶段功能参考。复用时应抽象阶段目标、设定增量、人物关系、冲突推进、爽点兑现和下一段钩子。`,
          tags: [segment.category, ...segment.keywords],
          source: `《${title}》第${segment.start}-${segment.end}章全量长程拆书`,
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

本次生成全书章节索引、剧情阶段总览、所有分段拆书报告、所有素材卡、全书拆书总报告、深度设定沉淀、深度优点机制和深度高光片段，并将 ${segments.length} 个分段条目写入全局素材库。
`
  );
}

function slug(input: string): string {
  return input
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
