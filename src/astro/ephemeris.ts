import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ZODIAC_SIGNS } from "../data/knowledge-base.js";

const EPHEMERIS_MCP_URL = "https://ephemeris.fyi/mcp";

export interface PlanetaryPosition {
  planet: string;
  sign: string;
  signZh: string;
  degree: number;
  retrograde: boolean;
}

export interface MoonPhase {
  phase: string;
  illumination: number;
}

export interface AstroSnapshot {
  timestamp: string;
  positions: PlanetaryPosition[];
  moonPhase: MoonPhase;
}

// ─── MCP Client ────────────────────────────────────────
async function withMCPClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new SSEClientTransport(new URL(EPHEMERIS_MCP_URL));
  const client = new Client(
    { name: "horoscope-bot", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    // close transport
    await transport.close();
  }
}

// ─── Simple fallback positions (approximate) ───────────
// Used when MCP connection fails
function getApproximatePositions(): PlanetaryPosition[] {
  const now = new Date();
  // Very rough approximation based on known 2024-2026 ephemeris
  // This is a fallback; real data from MCP is preferred
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

  // Approximate zodiac sign per planet (2026 baseline, ~1° per day for Sun)
  const sunSignIdx = Math.floor((dayOfYear + 10) / 30.44) % 12;
  const moonSignIdx = (sunSignIdx + Math.floor(dayOfYear * 13.37) % 12) % 12;

  const planetSpeeds: Record<string, number> = {
    sun: 0.9856, moon: 13.176, mercury: 1.383, venus: 1.2,
    mars: 0.524, jupiter: 0.083, saturn: 0.033,
    uranus: 0.0117, neptune: 0.006, pluto: 0.0041,
  };

  const result: PlanetaryPosition[] = [];
  for (const [planet, speed] of Object.entries(planetSpeeds)) {
    const baseOffset = planet === "sun" ? 10 :
                       planet === "moon" ? 180 :
                       planet === "mercury" ? 8 :
                       planet === "venus" ? 15 :
                       planet === "mars" ? 120 :
                       planet === "jupiter" ? 45 :
                       planet === "saturn" ? 330 :
                       planet === "uranus" ? 34 :
                       planet === "neptune" ? 358 :
                       planet === "pluto" ? 300 : 0;

    const degree = (baseOffset + dayOfYear * speed) % 360;
    const signIdx = Math.floor(degree / 30) % 12;
    const sign = ZODIAC_SIGNS[signIdx];
    const degInSign = degree % 30;

    result.push({
      planet,
      sign: sign?.name || "Unknown",
      signZh: sign?.nameZh || "未知",
      degree: degInSign,
      retrograde: false,
    });
  }

  return result;
}

function getApproximateMoonPhase(): MoonPhase {
  const now = new Date();
  // Approximate moon phase calculation
  const lp = 2551443; // lunar period in seconds
  const newMoon = new Date("2026-01-01T00:00:00Z").getTime() / 1000;
  const phase = ((now.getTime() / 1000 - newMoon) % lp) / lp;
  const illumination = Math.round(50 * (1 - Math.cos(2 * Math.PI * phase)));

  let phaseName = "New Moon";
  if (illumination < 5) phaseName = "New Moon";
  else if (illumination < 45) phaseName = "Waxing Crescent";
  else if (illumination < 55) phaseName = "First Quarter";
  else if (illumination < 95) phaseName = "Waxing Gibbous";
  else if (illumination < 100) phaseName = "Full Moon";
  else if (illumination > 95) phaseName = "Waning Gibbous";
  else if (illumination > 55) phaseName = "Last Quarter";
  else if (illumination > 5) phaseName = "Waning Crescent";

  return { phase: phaseName, illumination };
}

// ─── Public API ────────────────────────────────────────
export async function getCurrentAstroSnapshot(dateStr?: string): Promise<AstroSnapshot> {
  try {
    // Try MCP connection first
    const snapshot = await withMCPClient(async (client) => {
      // Call get_current_sky tool
      const skyResult = await client.callTool({
        name: "get_current_sky",
        arguments: {},
      });

      // Call get_moon_phase tool
      const moonResult = await client.callTool({
        name: "get_moon_phase",
        arguments: {},
      });

      if (dateStr) { return { timestamp: new Date(dateStr + "T12:00:00Z").toISOString(), positions: getApproximatePositionsForDate(dateStr), moonPhase: getApproximateMoonPhase() }; }
    return { skyResult, moonResult };
    });

    // Parse MCP results
    const positions = parseMCPSkyData(snapshot.skyResult);
    const moonPhase = parseMCPMoonData(snapshot.moonResult);

    if (dateStr) { return { timestamp: new Date(dateStr + "T12:00:00Z").toISOString(), positions: getApproximatePositionsForDate(dateStr), moonPhase: getApproximateMoonPhase() }; }
    return {
      timestamp: new Date().toISOString(),
      positions,
      moonPhase,
    };
  } catch (err) {
    console.warn("⚠️  MCP connection failed, using approximate positions:", (err as Error).message);
    if (dateStr) { return { timestamp: new Date(dateStr + "T12:00:00Z").toISOString(), positions: getApproximatePositionsForDate(dateStr), moonPhase: getApproximateMoonPhase() }; }
    return {
      timestamp: new Date().toISOString(),
      positions: getApproximatePositions(),
      moonPhase: getApproximateMoonPhase(),
    };
  }
}

function parseMCPSkyData(result: any): PlanetaryPosition[] {
  try {
    const content = result?.content || result;
    const text = Array.isArray(content) ? content[0]?.text : content?.text;
    if (!text) throw new Error("No content in MCP response");

    // MCP returns text content, try parsing as JSON
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Might be plain text format
      return getApproximatePositions();
    }

    const positions: PlanetaryPosition[] = [];
    const planets = data.positions || data.bodies || data;

    for (const [name, info] of Object.entries(planets)) {
      if (name === "earth") continue;
      const planetData = info as any;
      const signName = planetData.sign || planetData.zodiac_sign || "";
      const zodiac = ZODIAC_SIGNS.find(z =>
        z.name.toLowerCase() === signName.toLowerCase()
      );

      positions.push({
        planet: name,
        sign: zodiac?.name || signName,
        signZh: zodiac?.nameZh || signName,
        degree: planetData.degree || planetData.longitude || 0,
        retrograde: !!(planetData.retrograde || planetData.is_retrograde),
      });
    }

    return positions.length > 0 ? positions : getApproximatePositions();
  } catch {
    return getApproximatePositions();
  }
}

function parseMCPMoonData(result: any): MoonPhase {
  try {
    const content = result?.content || result;
    const text = Array.isArray(content) ? content[0]?.text : content?.text;
    if (!text) throw new Error("No content");

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return getApproximateMoonPhase();
    }

    return {
      phase: data.phase_name || data.phase || "unknown",
      illumination: data.illumination || data.percent || 0,
    };
  } catch {
    return getApproximateMoonPhase();
  }
}

export function selectNotableZodiacs(
  positions: PlanetaryPosition[],
  count: number = 3
): { zodiacName: string; reason: string; }[] {
  const selected: { zodiacName: string; reason: string; }[] = [];
  const usedZodiacs = new Set<string>();

  const moon = positions.find(p => p.planet === "moon");
  if (moon && !usedZodiacs.has(moon.sign)) {
    selected.push({ zodiacName: moon.sign, reason: `月亮位于${moon.signZh}，情绪能量聚焦于此` });
    usedZodiacs.add(moon.sign);
  }

  const sun = positions.find(p => p.planet === "sun");
  if (sun && !usedZodiacs.has(sun.sign)) {
    selected.push({ zodiacName: sun.sign, reason: `太阳当前过境${sun.signZh}，核心能量活跃` });
    usedZodiacs.add(sun.sign);
  }

  for (const p of positions) {
    if (selected.length >= count) break;
    if (p.retrograde && !usedZodiacs.has(p.sign)) {
      selected.push({ zodiacName: p.sign, reason: `${p.planet}在${p.signZh}逆行，业力议题浮现` });
      usedZodiacs.add(p.sign);
    }
  }

  if (selected.length < count) {
    const remaining = ZODIAC_SIGNS.filter(z => !usedZodiacs.has(z.name));
    for (let i = selected.length; i < count && remaining.length > 0; i++) {
      const idx = Math.floor(Math.random() * remaining.length);
      const z = remaining[idx];
      if (!z) continue;
      const p = positions.find(pos => pos.sign === z.name);
      const planetInfo = p ? `，${p.planet}当前经过` : "";
      selected.push({ zodiacName: z.name, reason: `今日天象为${z.nameZh}带来特别能量${planetInfo}` });
      remaining.splice(idx, 1);
      usedZodiacs.add(z.name);
    }
  }

  return selected;
}

export function buildAstroContext(snapshot: AstroSnapshot): string {
  let ctx = `## 当前真实天象 (${snapshot.timestamp})\n\n`;
  ctx += `### 月相：${snapshot.moonPhase.phase}（光照${snapshot.moonPhase.illumination}%）\n\n`;
  ctx += `### 行星位置：\n`;
  for (const p of snapshot.positions) {
    const rxFlag = p.retrograde ? "【逆行】" : "";
    ctx += `- ${p.planet}: ${p.signZh}(${p.sign}) ${p.degree.toFixed(1)}° ${rxFlag}\n`;
  }
  ctx += `\n### 重要天象：\n`;
  const retrogrades = snapshot.positions.filter(p => p.retrograde);
  if (retrogrades.length > 0) {
    for (const r of retrogrades) {
      ctx += `- ${r.planet}正在${r.signZh}逆行 → 该领域宜内省、回顾，不宜开新局\n`;
    }
  } else {
    ctx += `- 当前无行星逆行\n`;
  }
  return ctx;
}

export function getHourEnergy(hour: number): string {
  const shichenMap: Record<number, { name: string; zh: string; element: string; description: string }> = {
    0:  { name: "Zi", zh: "子时", element: "水", description: "夜深人静，水旺之时，宜内省深思，不宜重大决策" },
    1:  { name: "Chou", zh: "丑时", element: "土", description: "丑土润物，万物蓄力，适合沉淀与规划" },
    2:  { name: "Chou", zh: "丑时", element: "土", description: "丑土润物，万物蓄力，适合沉淀与规划" },
    3:  { name: "Yin", zh: "寅时", element: "木", description: "寅木初生，阳气萌动，创意灵感最旺盛" },
    4:  { name: "Yin", zh: "寅时", element: "木", description: "寅木初生，阳气萌动，创意灵感最旺盛" },
    5:  { name: "Mao", zh: "卯时", element: "木", description: "卯木舒展，日出东方，精力充沛行动力强" },
    6:  { name: "Mao", zh: "卯时", element: "木", description: "卯木舒展，日出东方，精力充沛行动力强" },
    7:  { name: "Chen", zh: "辰时", element: "土", description: "辰土湿暖，食神当令，适合社交与商务洽谈" },
    8:  { name: "Chen", zh: "辰时", element: "土", description: "辰土湿暖，食神当令，适合社交与商务洽谈" },
    9:  { name: "Si", zh: "巳时", element: "火", description: "巳火正旺，热情高涨，执行力与创造力俱佳" },
    10: { name: "Si", zh: "巳时", element: "火", description: "巳火正旺，热情高涨，执行力与创造力俱佳" },
    11: { name: "Wu", zh: "午时", element: "火", description: "午火极盛，阳光直射，宜小憩调心，避冲动" },
    12: { name: "Wu", zh: "午时", element: "火", description: "午火极盛，阳光直射，宜小憩调心，避冲动" },
    13: { name: "Wei", zh: "未时", element: "土", description: "未土燥热，消化吸收之时，适合学习与内化" },
    14: { name: "Wei", zh: "未时", element: "土", description: "未土燥热，消化吸收之时，适合学习与内化" },
    15: { name: "Shen", zh: "申时", element: "金", description: "申金刚健，思维清晰，辩论决策的黄金时段" },
    16: { name: "Shen", zh: "申时", element: "金", description: "申金刚健，思维清晰，辩论决策的黄金时段" },
    17: { name: "You", zh: "酉时", element: "金", description: "酉金敛藏，日落收敛，宜总结复盘和关系维护" },
    18: { name: "You", zh: "酉时", element: "金", description: "酉金敛藏，日落收敛，宜总结复盘和关系维护" },
    19: { name: "Xu", zh: "戌时", element: "土", description: "戌土火库，夜幕降临，适合深度谈话和情感连接" },
    20: { name: "Xu", zh: "戌时", element: "土", description: "戌土火库，夜幕降临，适合深度谈话和情感连接" },
    21: { name: "Hai", zh: "亥时", element: "水", description: "亥水归元，放松疗愈之时，音乐艺术灵感涌现" },
    22: { name: "Hai", zh: "亥时", element: "水", description: "亥水归元，放松疗愈之时，音乐艺术灵感涌现" },
    23: { name: "Zi", zh: "子时", element: "水", description: "子水至阴，新旧交替，适合放下与冥想" },
  };

  const sc = shichenMap[hour];
  if (!sc) return `**时辰**：未知\n**时辰解读**：时辰信息缺失`;
  return `**时辰**：${sc.zh}（${sc.element}气当令）\n**时辰解读**：${sc.description}`;
}

function getApproximatePositionsForDate(dateStr: string): PlanetaryPosition[] {
  const d = new Date(dateStr + "T12:00:00Z");
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const planetSpeeds: Record<string, number> = {
    sun: 0.9856, moon: 13.176, mercury: 1.383, venus: 1.2,
    mars: 0.524, jupiter: 0.083, saturn: 0.033,
    uranus: 0.0117, neptune: 0.006, pluto: 0.0041,
  };
  const result: PlanetaryPosition[] = [];
  for (const [planet, speed] of Object.entries(planetSpeeds)) {
    const baseOffset: Record<string, number> = { sun: 10, moon: 180, mercury: 8, venus: 15, mars: 120, jupiter: 45, saturn: 330, uranus: 34, neptune: 358, pluto: 300 };
    const degree = ((baseOffset[planet] || 0) + dayOfYear * speed) % 360;
    const signIdx = Math.floor(degree / 30) % 12;
    const sign = ZODIAC_SIGNS[signIdx];
    result.push({ planet, sign: sign?.name || "Unknown", signZh: sign?.nameZh || "未知", degree: degree % 30, retrograde: false });
  }
  return result;
}
