import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { config } from "../config.js";

const vault = config.obsidian.vaultPath;

// ─── Zodiac ────────────────────────────────────────────
export interface ZodiacSign {
  name: string;
  nameZh: string;
  nameJa: string;
  dateRange: string;
  element: string;
  elementZh: string;
  mode: string;
  polarity: string;
  rulingPlanet: string;
  keywords: string;
  bodyPart: string;
}

export const ZODIAC_SIGNS: ZodiacSign[] = [
  { name: "Aries", nameZh: "白羊座", nameJa: "牡羊座", dateRange: "3/21-4/19", element: "Fire", elementZh: "火", mode: "Cardinal", polarity: "Yang", rulingPlanet: "Mars", keywords: "开创、勇气、自我", bodyPart: "头面" },
  { name: "Taurus", nameZh: "金牛座", nameJa: "牡牛座", dateRange: "4/20-5/20", element: "Earth", elementZh: "土", mode: "Fixed", polarity: "Yin", rulingPlanet: "Venus", keywords: "稳定、物质、感官", bodyPart: "颈喉" },
  { name: "Gemini", nameZh: "双子座", nameJa: "双子座", dateRange: "5/21-6/21", element: "Air", elementZh: "风", mode: "Mutable", polarity: "Yang", rulingPlanet: "Mercury", keywords: "沟通、好奇、多变", bodyPart: "肩臂手" },
  { name: "Cancer", nameZh: "巨蟹座", nameJa: "蟹座", dateRange: "6/22-7/22", element: "Water", elementZh: "水", mode: "Cardinal", polarity: "Yin", rulingPlanet: "Moon", keywords: "家庭、情感、保护", bodyPart: "胸胃脾肺" },
  { name: "Leo", nameZh: "狮子座", nameJa: "獅子座", dateRange: "7/23-8/22", element: "Fire", elementZh: "火", mode: "Fixed", polarity: "Yang", rulingPlanet: "Sun", keywords: "创造、自信、荣耀", bodyPart: "心背" },
  { name: "Virgo", nameZh: "处女座", nameJa: "乙女座", dateRange: "8/23-9/22", element: "Earth", elementZh: "土", mode: "Mutable", polarity: "Yin", rulingPlanet: "Mercury", keywords: "分析、服务、完美", bodyPart: "腹肠" },
  { name: "Libra", nameZh: "天秤座", nameJa: "天秤座", dateRange: "9/23-10/23", element: "Air", elementZh: "风", mode: "Cardinal", polarity: "Yang", rulingPlanet: "Venus", keywords: "平衡、关系、美感", bodyPart: "腰肾生殖" },
  { name: "Scorpio", nameZh: "天蝎座", nameJa: "蠍座", dateRange: "10/24-11/22", element: "Water", elementZh: "水", mode: "Fixed", polarity: "Yin", rulingPlanet: "Pluto/Mars", keywords: "深度、转化、掌控", bodyPart: "生殖泌尿" },
  { name: "Sagittarius", nameZh: "射手座", nameJa: "射手座", dateRange: "11/23-12/21", element: "Fire", elementZh: "火", mode: "Mutable", polarity: "Yang", rulingPlanet: "Jupiter", keywords: "探索、自由、信念", bodyPart: "大腿" },
  { name: "Capricorn", nameZh: "摩羯座", nameJa: "山羊座", dateRange: "12/22-1/19", element: "Earth", elementZh: "土", mode: "Cardinal", polarity: "Yin", rulingPlanet: "Saturn", keywords: "成就、纪律、野心", bodyPart: "膝" },
  { name: "Aquarius", nameZh: "水瓶座", nameJa: "水瓶座", dateRange: "1/20-2/18", element: "Air", elementZh: "风", mode: "Fixed", polarity: "Yang", rulingPlanet: "Uranus/Saturn", keywords: "革新、社群、独立", bodyPart: "小腿" },
  { name: "Pisces", nameZh: "双鱼座", nameJa: "魚座", dateRange: "2/19-3/20", element: "Water", elementZh: "水", mode: "Mutable", polarity: "Yin", rulingPlanet: "Neptune/Jupiter", keywords: "灵性、慈悲、融合", bodyPart: "足" },
];

export function getZodiacInfo(englishName: string): ZodiacSign | undefined {
  return ZODIAC_SIGNS.find(z => z.name.toLowerCase() === englishName.toLowerCase());
}

// ─── Tarot ─────────────────────────────────────────────
export interface TarotCard {
  name: string;
  nameZh: string;
  isMajor: boolean;
  upright: string;
  reversed: string;
  element?: string;
}

// Major Arcana (from knowledge base)
const MAJOR_ARCANA: { name: string; nameZh: string; upright: string; reversed: string }[] = [
  { name: "The Fool", nameZh: "愚者", upright: "新开始、冒险、天真", reversed: "鲁莽、不成熟、失控" },
  { name: "The Magician", nameZh: "魔术师", upright: "创造力、技能、自信", reversed: "欺骗、滥用能力" },
  { name: "The High Priestess", nameZh: "女祭司", upright: "直觉、秘密、内在智慧", reversed: "隐藏真相、情绪封闭" },
  { name: "The Empress", nameZh: "皇后", upright: "丰饶、母性、感官", reversed: "依赖、缺乏成长" },
  { name: "The Emperor", nameZh: "皇帝", upright: "权威、结构、掌控", reversed: "专制、僵化" },
  { name: "The Hierophant", nameZh: "教皇", upright: "传统、信仰、指导", reversed: "束缚、教条" },
  { name: "The Lovers", nameZh: "恋人", upright: "爱情、选择、和谐", reversed: "分离、错误选择" },
  { name: "The Chariot", nameZh: "战车", upright: "胜利、意志力、前进", reversed: "失控、崩溃" },
  { name: "Strength", nameZh: "力量", upright: "勇气、耐心、以柔克刚", reversed: "软弱、失控" },
  { name: "The Hermit", nameZh: "隐士", upright: "内省、智慧、孤独", reversed: "孤立、逃避" },
  { name: "Wheel of Fortune", nameZh: "命运之轮", upright: "转折、机遇、周期", reversed: "厄运、失控" },
  { name: "Justice", nameZh: "正义", upright: "公正、因果、平衡", reversed: "不公、逃避责任" },
  { name: "The Hanged Man", nameZh: "倒吊人", upright: "牺牲、换个角度看", reversed: "停滞、无意义的牺牲" },
  { name: "Death", nameZh: "死神", upright: "结束、转变、放下", reversed: "抗拒改变、停滞" },
  { name: "Temperance", nameZh: "节制", upright: "平衡、调和、耐心", reversed: "极端、失衡" },
  { name: "The Devil", nameZh: "恶魔", upright: "欲望、束缚、物质", reversed: "解脱、觉醒" },
  { name: "The Tower", nameZh: "高塔", upright: "突变、崩塌、真相", reversed: "侥幸逃过、压抑" },
  { name: "The Star", nameZh: "星星", upright: "希望、治愈、灵感", reversed: "绝望、失去信心" },
  { name: "The Moon", nameZh: "月亮", upright: "幻觉、恐惧、潜意识", reversed: "真相浮现、克服恐惧" },
  { name: "The Sun", nameZh: "太阳", upright: "成功、快乐、活力", reversed: "短暂阴霾、热情消退" },
  { name: "Judgement", nameZh: "审判", upright: "觉醒、召唤、重生", reversed: "拒绝召唤、后悔" },
  { name: "The World", nameZh: "世界", upright: "完成、圆满、整合", reversed: "未完成、停滞不前" },
];

// Minor Arcana suits (from newly created knowledge base)
const MINOR_ARCANA: { suit: string; suitZh: string; element: string; cards: { rank: string; rankZh: string; upright: string; reversed: string }[] }[] = [
  {
    suit: "Wands", suitZh: "权杖", element: "Fire",
    cards: [
      { rank: "Ace", rankZh: "Ace", upright: "新创意、灵感爆发、行动契机", reversed: "延迟启动、缺乏方向、创意受阻" },
      { rank: "2", rankZh: "2", upright: "规划未来、权衡选择、个人力量", reversed: "犹豫不决、恐惧未知、计划中断" },
      { rank: "3", rankZh: "3", upright: "扩展视野、贸易成功、初步成果", reversed: "计划受阻、失望、视野狭隘" },
      { rank: "4", rankZh: "4", upright: "庆祝、稳定、和谐、家庭幸福", reversed: "不稳定、家庭矛盾、短暂快乐" },
      { rank: "5", rankZh: "5", upright: "竞争、冲突、挑战、火花碰撞", reversed: "逃避冲突、内部矛盾、无意义争斗" },
      { rank: "6", rankZh: "6", upright: "胜利、认可、公众赞誉", reversed: "失败、傲慢、不被认可" },
      { rank: "7", rankZh: "7", upright: "坚守立场、捍卫信念、韧性", reversed: "投降、无力感、被压垮" },
      { rank: "8", rankZh: "8", upright: "快速进展、消息到来、旅行", reversed: "延迟、停滞、计划取消" },
      { rank: "9", rankZh: "9", upright: "最后的坚守、韧性、吸取教训", reversed: "偏执、精疲力竭、过度防御" },
      { rank: "10", rankZh: "10", upright: "负担过重、责任压身、最后冲刺", reversed: "卸下重担、逃避责任、透支崩溃" },
      { rank: "Page", rankZh: "侍从", upright: "热情探索、好消息、好奇心", reversed: "坏消息、缺乏计划、拖延" },
      { rank: "Knight", rankZh: "骑士", upright: "行动派、冒险精神、冲劲十足", reversed: "冲动鲁莽、半途而废、急躁" },
      { rank: "Queen", rankZh: "王后", upright: "自信魅力、热情领导、创造力", reversed: "嫉妒控制、情绪失控" },
      { rank: "King", rankZh: "国王", upright: "远见领袖、创业者精神、果断", reversed: "独裁、蛮横、目标过大" },
    ]
  },
  {
    suit: "Cups", suitZh: "圣杯", element: "Water",
    cards: [
      { rank: "Ace", rankZh: "Ace", upright: "新恋情、情感流动、直觉开启", reversed: "情感空虚、爱被拒绝" },
      { rank: "2", rankZh: "2", upright: "两情相悦、合作关系、灵魂联结", reversed: "分手、失衡关系、信任破裂" },
      { rank: "3", rankZh: "3", upright: "欢聚庆祝、友情、共享喜悦", reversed: "过度放纵、孤立、友谊破裂" },
      { rank: "4", rankZh: "4", upright: "沉思、冷漠、不满现状", reversed: "新的动力、觉醒、抓住机会" },
      { rank: "5", rankZh: "5", upright: "失落悲伤、聚焦失去、遗憾", reversed: "接受、疗愈开始、释怀" },
      { rank: "6", rankZh: "6", upright: "回忆、童年、怀旧、纯真", reversed: "沉溺过去、无法前行" },
      { rank: "7", rankZh: "7", upright: "幻想选择、白日梦、多选项", reversed: "清醒选择、目标明确、脚踏实地" },
      { rank: "8", rankZh: "8", upright: "离开、追寻更高意义、放下", reversed: "逃避、恐惧改变" },
      { rank: "9", rankZh: "9", upright: "愿望实现、满足、心想事成", reversed: "不满足、空虚、表面快乐" },
      { rank: "10", rankZh: "10", upright: "终极幸福、家庭圆满、情感和谐", reversed: "家庭破裂、理想幻灭" },
      { rank: "Page", rankZh: "侍从", upright: "创意灵感、情感初开、艺术家气质", reversed: "情绪化、不切实际" },
      { rank: "Knight", rankZh: "骑士", upright: "浪漫追求、魅力、理想主义", reversed: "虚伪、欺骗、情绪操控" },
      { rank: "Queen", rankZh: "王后", upright: "慈悲同理、直觉力强、治愈者", reversed: "过度依赖、情绪绑架" },
      { rank: "King", rankZh: "国王", upright: "情感成熟、宽容智慧、治愈他人", reversed: "情绪操控、冷漠、压抑" },
    ]
  },
  {
    suit: "Swords", suitZh: "宝剑", element: "Air",
    cards: [
      { rank: "Ace", rankZh: "Ace", upright: "新思维、真相突破、清晰判断", reversed: "混乱思维、错误判断" },
      { rank: "2", rankZh: "2", upright: "两难抉择、僵局、平衡", reversed: "信息过载、假选择" },
      { rank: "3", rankZh: "3", upright: "心碎、悲伤、背叛、必要之痛", reversed: "疗愈中、释放痛苦" },
      { rank: "4", rankZh: "4", upright: "休息、冥想、充电、战略暂停", reversed: "躁动、无法休息" },
      { rank: "5", rankZh: "5", upright: "冲突胜利、代价沉重、空赢", reversed: "和解、止损、让步" },
      { rank: "6", rankZh: "6", upright: "过渡、前行、疗伤之旅", reversed: "停滞、无法前进" },
      { rank: "7", rankZh: "7", upright: "策略、智取、独自行动", reversed: "真相暴露、策略失败" },
      { rank: "8", rankZh: "8", upright: "束缚、被困感、自我设限", reversed: "突破、自我解放、找回力量" },
      { rank: "9", rankZh: "9", upright: "焦虑、噩梦、深夜失眠", reversed: "释放恐惧、希望来临" },
      { rank: "10", rankZh: "10", upright: "终结、谷底、痛苦到极点", reversed: "复苏、重生、吸取教训" },
      { rank: "Page", rankZh: "侍从", upright: "求知、警觉、信息收集", reversed: "肤浅、八卦、思维散漫" },
      { rank: "Knight", rankZh: "骑士", upright: "思维敏捷、果断行动、辩论高手", reversed: "鲁莽言论、攻击性" },
      { rank: "Queen", rankZh: "王后", upright: "理性独立、清晰判断、洞见真相", reversed: "冷酷无情、偏见" },
      { rank: "King", rankZh: "国王", upright: "权威判断、公正领导、战略大师", reversed: "暴政、操纵、虚伪权威" },
    ]
  },
  {
    suit: "Pentacles", suitZh: "星币", element: "Earth",
    cards: [
      { rank: "Ace", rankZh: "Ace", upright: "新财源、投资机会、物质丰盛", reversed: "错失机会、财务不稳" },
      { rank: "2", rankZh: "2", upright: "多任务平衡、资金调度、灵活应变", reversed: "失衡、财务混乱、失控" },
      { rank: "3", rankZh: "3", upright: "团队合作、技艺精进、专业认可", reversed: "质量差、缺乏合作、敷衍" },
      { rank: "4", rankZh: "4", upright: "守财、安全感、保守理财", reversed: "挥霍、过度吝啬" },
      { rank: "5", rankZh: "5", upright: "财务困难、匮乏感、精神贫瘠", reversed: "恢复、找到帮助、走出困境" },
      { rank: "6", rankZh: "6", upright: "给予与接受、慈善、资源共享", reversed: "不平等、施舍心态、依赖" },
      { rank: "7", rankZh: "7", upright: "等待收获、评估成果、耐心", reversed: "焦虑等待、回报不如预期" },
      { rank: "8", rankZh: "8", upright: "精进技艺、专注工作、工匠精神", reversed: "倦怠、无意义劳动、混日子" },
      { rank: "9", rankZh: "9", upright: "独立富足、享受成果、优雅自足", reversed: "财务损失、追求表面" },
      { rank: "10", rankZh: "10", upright: "家族财富、传承、终极物质成就", reversed: "家族纠纷、物质富精神空" },
      { rank: "Page", rankZh: "侍从", upright: "学习实践、务实进取、奖学金", reversed: "缺乏专注、浪费潜力" },
      { rank: "Knight", rankZh: "骑士", upright: "踏实可靠、持续努力、务实派", reversed: "停滞不前、懒散、无趣" },
      { rank: "Queen", rankZh: "王后", upright: "理财能手、滋润他人、管家精神", reversed: "物质至上、忽视情感" },
      { rank: "King", rankZh: "国王", upright: "财富大师、事业成功、商业头脑", reversed: "贪婪、腐败、为富不仁" },
    ]
  },
];

export function buildTarotDeck(): TarotCard[] {
  const deck: TarotCard[] = [];
  for (const c of MAJOR_ARCANA) {
    deck.push({ name: c.name, nameZh: c.nameZh, isMajor: true, upright: c.upright, reversed: c.reversed });
  }
  for (const suit of MINOR_ARCANA) {
    for (const c of suit.cards) {
      deck.push({
        name: `${c.rank} of ${suit.suit}`,
        nameZh: `${suit.suitZh}${c.rankZh}`,
        isMajor: false,
        upright: c.upright,
        reversed: c.reversed,
        element: suit.element,
      });
    }
  }
  return deck;
}

// ─── Wuxing (五行) ─────────────────────────────────────
export interface WuxingRelation {
  generates: string;
  generatedBy: string;
  controls: string;
  controlledBy: string;
  season: string;
  organ: string;
  emotion: string;
}

export const WUXING: Record<string, WuxingRelation> = {
  "木": { generates: "火", generatedBy: "水", controls: "土", controlledBy: "金", season: "春", organ: "肝", emotion: "怒" },
  "火": { generates: "土", generatedBy: "木", controls: "金", controlledBy: "水", season: "夏", organ: "心", emotion: "喜" },
  "土": { generates: "金", generatedBy: "火", controls: "水", controlledBy: "木", season: "季末", organ: "脾", emotion: "思" },
  "金": { generates: "水", generatedBy: "土", controls: "木", controlledBy: "火", season: "秋", organ: "肺", emotion: "悲" },
  "水": { generates: "木", generatedBy: "金", controls: "火", controlledBy: "土", season: "冬", organ: "肾", emotion: "恐" },
};

export const ELEMENT_TO_ZODIAC_ELEMENT: Record<string, string> = {
  "木": "Fire",   // 木生火 — 关联 (both are active/yang-ish in chinese theory)
  "火": "Fire",
  "土": "Earth",
  "金": "Air",    // 金对应风 — both are mental/clarity
  "水": "Water",
};

// ─── Health tips (养生) ────────────────────────────────
export function readHealthTips(): string[] {
  const healthPath = resolve(vault, "../养生知识库");
  if (!existsSync(healthPath)) return [];

  const tips: string[] = [];
  const categories = ["食疗", "穴位", "季节", "情志"];

  for (const cat of categories) {
    const catPath = join(healthPath, cat);
    if (!existsSync(catPath)) continue;
    const files = readdirSync(catPath).filter((f: string) => f.endsWith(".md") && !f.includes("MOC"));
    for (const file of files.slice(0, 2)) { // max 2 per category
      try {
        const content = readFileSync(join(catPath, file), "utf-8");
        // Extract first meaningful paragraph after frontmatter
        const lines = content.split("\n");
        let inContent = false;
        let tip = "";
        for (const line of lines) {
          if (line.startsWith("# ")) { inContent = true; continue; }
          if (inContent && line.trim().length > 30) {
            tip = line.trim();
            break;
          }
        }
        if (tip) tips.push(tip);
      } catch {}
    }
  }
  return tips;
}

// ─── Templates ─────────────────────────────────────────
export function readTemplate(name: string): string {
  const templatePath = resolve(vault, `04-解读模板/${name}.md`);
  if (!existsSync(templatePath)) return "";
  return readFileSync(templatePath, "utf-8");
}

// ─── Context builder ───────────────────────────────────
export function buildKnowledgeContext(zodiacs: ZodiacSign[], tarotCards: TarotCard[]): string {
  const healthTips = readHealthTips();
  const randomTips = healthTips.sort(() => Math.random() - 0.5).slice(0, 2);

  let ctx = `## 星座知识库\n\n`;
  for (const z of zodiacs) {
    ctx += `**${z.nameZh} (${z.name})** | 元素:${z.elementZh} | 形态:${z.mode} | 守护星:${z.rulingPlanet} | 关键词:${z.keywords} | 身体:${z.bodyPart}\n`;
  }

  ctx += `\n## 塔罗牌\n\n`;
  for (const c of tarotCards) {
    ctx += `**${c.nameZh} (${c.name})** | 正位:${c.upright} | 逆位:${c.reversed}\n`;
  }

  ctx += `\n## 五行生克\n`;
  ctx += `木生火→火生土→土生金→金生水→水生木\n`;
  ctx += `木克土→土克水→水克火→火克金→金克木\n`;

  if (randomTips.length > 0) {
    ctx += `\n## 养生参考\n`;
    for (const t of randomTips) {
      ctx += `- ${t}\n`;
    }
  }

  return ctx;
}
