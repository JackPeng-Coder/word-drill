import type {
  GeneratedItem,
  ItemKind,
  Option,
  PoolFile,
  RawWord,
  SenseTuple,
  Settings,
} from '../lib/types';
import { createRng } from './rng';

/* ------------------------------------------------------------------ *
 * 文本工具
 * ------------------------------------------------------------------ */

/** 判义无关时可以忽略的通用词 */
const STOP = new Set([
  '的',
  '了',
  '地',
  '得',
  '使',
  '人',
  '事',
  '物',
  '某',
  '者',
  '等',
  '与',
  '和',
  '或',
  '而',
  '是',
  '有',
  '在',
  '为',
  '将',
  '把',
  '被',
  '从',
  '到',
  '对',
  '于',
  '上',
  '下',
  '中',
  '之',
  '其',
  '这',
  '那',
  '一个',
  '一种',
  '用于',
  '用来',
  '表示',
  '进行',
  '某种',
  '方面',
  '状态',
  '情况',
  '行为',
  '动作',
  '过程',
  '结果',
  '方式',
  '方法',
  '东西',
  '事情',
  '地方',
  '时候',
  '某人',
  '某物',
  '等等',
]);

function clausesOf(gloss: string): string[] {
  const out: string[] = [];
  for (const part of gloss.split(/[，,；;、/|·…\s]+/)) {
    const clean = part.replace(/[^\u4e00-\u9fff]/g, '');
    if (clean.length < 2) continue;
    if (STOP.has(clean)) continue;
    out.push(clean);
  }
  return out;
}

interface Profile {
  clauses: Set<string>;
  grams: Set<string>;
}

function profileOf(senses: SenseTuple[]): Profile {
  const clauses = new Set<string>();
  for (const sense of senses) {
    for (const clause of clausesOf(sense[1] ?? '')) clauses.add(clause);
  }
  const grams = new Set<string>();
  for (const clause of clauses) {
    for (let i = 0; i + 2 <= clause.length; i += 1) grams.add(clause.slice(i, i + 2));
  }
  return { clauses, grams };
}

/** 两个词的中文释义是否有语义关联：完全相同 / 互为子串 / 二字组包含率过高 */
function isRelated(a: Profile, b: Profile): boolean {
  for (const x of a.clauses) {
    for (const y of b.clauses) {
      if (x === y) return true;
      if (x.includes(y) || y.includes(x)) return true;
    }
  }
  if (!a.grams.size || !b.grams.size) return false;
  const [small, large] = a.grams.size <= b.grams.size ? [a.grams, b.grams] : [b.grams, a.grams];
  let inter = 0;
  for (const g of small) if (large.has(g)) inter += 1;
  return inter / small.size > 0.34;
}

/** 派生后缀，用于排除同词干变形（confuse / confusedly、consider / considerable 等） */
const STEM_SUFFIXES = [
  'ational',
  'ations',
  'ation',
  'ition',
  'ingly',
  'edly',
  'ally',
  'ness',
  'ments',
  'ment',
  'ances',
  'ance',
  'ences',
  'ence',
  'ables',
  'able',
  'ible',
  'ities',
  'ity',
  'ives',
  'ive',
  'ous',
  'ful',
  'less',
  'ing',
  'est',
  'ers',
  'er',
  'ies',
  'ied',
  'ate',
  'ed',
  'ly',
  'es',
  'is',
  'al',
  'ic',
  's',
  'e',
].sort((a, b) => b.length - a.length);

function stemOf(word: string): string {
  let w = word.toLowerCase();
  for (let round = 0; round < 3; round += 1) {
    let stripped = false;
    for (const suffix of STEM_SUFFIXES) {
      if (w.length - suffix.length >= 4 && w.endsWith(suffix)) {
        w = w.slice(0, -suffix.length);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  return w;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

function spellScore(target: string, candidate: string): number {
  const cp = commonPrefix(target, candidate);
  const cs = commonSuffix(target, candidate);
  if (cp < 3 && cs < 3) return 0;
  const lenDiff = Math.abs(target.length - candidate.length);
  if (lenDiff > 5) return 0;
  const maxLen = Math.max(target.length, candidate.length);
  let score = cp * 0.3 + cs * 0.25 + (1 - lenDiff / maxLen) * 0.1;
  if (cp >= 4) score += 0.2;
  if (cs >= 3) score += 0.1;
  return score;
}

/** 选项展示文本：取前 3 个分句，最长 24 字 */
function displayText(gloss: string): string {
  const parts = gloss
    .split(/[；;，,、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  let text = parts.join('，');
  if (text.length > 24) text = `${text.slice(0, 24)}…`;
  return text;
}

/* ------------------------------------------------------------------ *
 * 词池索引（同一 PoolFile 只建一次）
 * ------------------------------------------------------------------ */

const poolIndexCache = new WeakMap<PoolFile, Map<string, RawWord[]>>();

function poolIndex(pool: PoolFile): Map<string, RawWord[]> {
  const cached = poolIndexCache.get(pool);
  if (cached) return cached;
  const map = new Map<string, RawWord[]>();
  for (const entry of pool.words) {
    const word = typeof entry?.[0] === 'string' ? entry[0].toLowerCase() : '';
    if (!word) continue;
    const key = word.slice(0, 3);
    const bucket = map.get(key);
    if (bucket) bucket.push(entry);
    else map.set(key, [entry]);
  }
  poolIndexCache.set(pool, map);
  return map;
}

interface Draft {
  pos: string;
  text: string;
  correct: boolean;
  tier: number;
  profile?: Profile;
}

function freshDraft(entry: RawWord, tier: number): Draft | null {
  const senses = entry[1] ?? [];
  if (!senses.length) return null;
  const sense = senses.find((s) => s[0]) ?? senses[0];
  const text = displayText(sense[1] ?? '');
  if (!text) return null;
  return { pos: sense[0] ?? '', text, correct: false, tier, profile: profileOf(senses) };
}

/* ------------------------------------------------------------------ *
 * 出题
 * ------------------------------------------------------------------ */

interface GenerateArgs {
  word: string;
  phonetic?: string;
  senses: SenseTuple[];
  pool: PoolFile;
  settings: Settings;
  prevKind: ItemKind | null;
  seed: number;
}

export function generateItem({
  word,
  phonetic = '',
  senses,
  pool,
  settings,
  prevKind,
  seed,
}: GenerateArgs): GeneratedItem {
  const rng = createRng(seed);
  const target = word.toLowerCase();
  const usableSenses = senses.filter((s) => (s[1] ?? '').trim().length > 0).slice(0, 4);
  if (!usableSenses.length) throw new Error(`单词「${word}」没有可用的中文义项`);

  const positive = !(
    settings.noneRate > 0 &&
    prevKind !== 'negative' &&
    rng() < settings.noneRate
  );

  const targetStem = stemOf(target);
  const targetProfile = profileOf(usableSenses);

  // 1) 正确项
  const correctSenses: SenseTuple[] = !positive
    ? []
    : settings.multiSense && usableSenses.length >= 2
      ? usableSenses.slice(0, 3)
      : [usableSenses[0]];

  const correctDrafts: Draft[] = correctSenses.map((sense) => ({
    pos: sense[0] ?? '',
    text: displayText(sense[1] ?? ''),
    correct: true,
    tier: 0,
  }));

  const need = 4 - correctDrafts.length;
  const chosen: Draft[] = [];
  const usedText = new Set(correctDrafts.map((d) => d.text));
  const usedWords = new Set<string>([target]);
  const chosenProfiles: Profile[] = correctSenses.map((s) => profileOf([s]));

  /** 干扰项之间也不要撞义，避免出现两个「癌症」这种观感问题 */
  const conflictsWithChosen = (draft: Draft): boolean => {
    if (!draft.profile) return false;
    return chosenProfiles.some((p) => isRelated(p, draft.profile as Profile));
  };

  const buckets = poolIndex(pool);
  const bucket =
    buckets.get(target.slice(0, 3)) ?? buckets.get(target.slice(0, 2)) ?? [];

  // 2) 候选打分并分档
  const tiers: Array<Array<{ draft: Draft; score: number }>> = [[], [], []];
  for (const entry of bucket) {
    const candidate = entry[0].toLowerCase();
    if (candidate.length < 2 || usedWords.has(candidate)) continue;
    usedWords.add(candidate);
    if (stemOf(candidate) === targetStem) continue;
    const profile = profileOf(entry[1] ?? []);
    if (isRelated(targetProfile, profile)) continue;
    const score = spellScore(target, candidate);
    if (score <= 0) continue;
    const draft = freshDraft(entry, 0);
    if (!draft || usedText.has(draft.text)) continue;
    if (conflictsWithChosen(draft)) continue;
    const cp = commonPrefix(target, candidate);
    const cs = commonSuffix(target, candidate);
    const tier = cp >= 4 ? 0 : cp >= 3 || cs >= 3 ? 1 : 2;
    tiers[tier].push({ draft, score });
  }
  for (const tier of tiers) tier.sort((a, b) => b.score - a.score);

  for (const tier of tiers) {
    for (const item of tier) {
      if (chosen.length >= need) break;
      if (usedText.has(item.draft.text)) continue;
      if (conflictsWithChosen(item.draft)) continue;
      usedText.add(item.draft.text);
      chosen.push({ ...item.draft, tier: item.draft.tier + 1 });
      if (item.draft.profile) chosenProfiles.push(item.draft.profile);
    }
    if (chosen.length >= need) break;
  }

  // 3) 兜底：词池内随机补齐（仍保证语义无关）
  let fallback = chosen.some((d) => d.tier >= 3);
  if (chosen.length < need) {
    const rest = pool.words.filter((entry) => {
      const candidate = typeof entry?.[0] === 'string' ? entry[0].toLowerCase() : '';
      if (!candidate || usedWords.has(candidate)) return false;
      return true;
    });
    const start = Math.floor(rng() * Math.max(1, rest.length));
    for (let i = 0; i < rest.length && chosen.length < need; i += 1) {
      const entry = rest[(start + i) % rest.length];
      const candidate = entry[0].toLowerCase();
      if (stemOf(candidate) === targetStem) continue;
      if (isRelated(targetProfile, profileOf(entry[1] ?? []))) continue;
      const draft = freshDraft(entry, 3);
      if (!draft || usedText.has(draft.text)) continue;
      if (conflictsWithChosen(draft)) continue;
      usedText.add(draft.text);
      usedWords.add(candidate);
      chosen.push(draft);
      if (draft.profile) chosenProfiles.push(draft.profile);
      fallback = true;
    }
  }

  if (correctDrafts.length + chosen.length < 4) {
    throw new Error(`干扰词池不足以给「${word}」出题`);
  }

  // 4) 装配：4 个释义项洗牌 + 固定追加两个元选项
  const drafts = [...correctDrafts, ...chosen.slice(0, need)];
  for (let i = drafts.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [drafts[i], drafts[j]] = [drafts[j], drafts[i]];
  }

  const options: Option[] = drafts.map((draft, i) => ({
    id: `s${i}`,
    kind: 'sense' as const,
    pos: draft.pos,
    text: draft.text,
    correct: draft.correct,
  }));

  const negative = !positive;
  options.push({
    id: 'none',
    kind: 'none',
    pos: '',
    text: '以上都不对',
    correct: negative,
  });
  options.push({
    id: 'unknown',
    kind: 'unknown',
    pos: '',
    text: '不知道',
    correct: false,
  });

  const correctIds = options.filter((o) => o.correct).map((o) => o.id);

  return {
    word: word.trim(),
    phonetic,
    kind: negative ? 'negative' : 'positive',
    options,
    correctIds,
    multi: negative ? false : correctIds.length > 1,
    fallback,
  };
}
