/**
 * 词库构建：qwerty-dicts/*.json → public/data/{manifest.json,pool.json,dict/*.json}
 *
 * 用法：
 *   node scripts/build-data.mjs            # 已有 manifest 则跳过
 *   node scripts/build-data.mjs --force    # 强制重建
 *
 * 设计要点：
 * - 只收英汉词表，剔除日语/哈萨克/德语/印尼/编程术语/词根等
 * - 「词性.」前缀切分 + 变形噪声清洗 + 跨词典词性对齐
 * - 重复词表按单词序列 SHA-1 去重，manifest 保留 alias 条目
 * - pool 只收锚定语料中出现的单字英文词，用于生成形态相似但语义无关的干扰项
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'qwerty-dicts');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const DICT_OUT = path.join(OUT_DIR, 'dict');
const REPORT_DIR = path.join(ROOT, 'reports');

const FORCE = process.argv.includes('--force');

const CJK = /[\u4e00-\u9fff]/;
const POS_ALT = 'n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|abbr|det|a|ad';
const POS_MARKER_SRC = `(?<![A-Za-z])((?:${POS_ALT})\\s*[.．](?:\\s*&\\s*(?:${POS_ALT})\\s*[.．])?)`;
const NOISE_RE =
  /(时态|比较级|最高级|过去式|过去分词|现在分词|第三人称单数|名\s*词|动\s*词|副\s*词|形\s*容\s*词)\s*[:：][^|]*/g;

const MAX_SENSES = 4;
const MAX_POOL_SENSES = 3;

/* ------------------------------------------------------------------ *
 * 基础清洗
 * ------------------------------------------------------------------ */

function normalizePos(raw) {
  const p = String(raw || '').replace(/\s/g, '');
  if (!p) return '';
  if (p.includes('&')) {
    return p
      .split('&')
      .map((part) => normalizePos(part))
      .filter(Boolean)
      .join('& ');
  }
  const bare = p.replace(/[.．。]/g, '');
  if (!bare) return '';
  if (bare === 'a' || bare === 'adj') return 'adj.';
  if (bare === 'ad' || bare === 'adv') return 'adv.';
  return `${bare}.`;
}

function cleanGloss(input) {
  let s = String(input || '');
  s = s.replace(NOISE_RE, ' ');
  s = s.replace(/[（(][^（）()]{0,40}[）)]/g, ' ');
  s = s.replace(/[【】\[\]〈〉《》]/g, ' ');
  s = s.replace(/^[\s,，;；:：.。、\-—]+/, '');
  s = s.replace(/[\s,，;；:：、\-—]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** 释义串 → [[pos, text], ...] */
export function splitSenses(trans) {
  const arr = Array.isArray(trans)
    ? trans
    : trans == null
      ? []
      : [typeof trans === 'string' ? trans : String(trans)];
  const segments = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const text = raw.replace(NOISE_RE, ' ');
    const re = new RegExp(POS_MARKER_SRC, 'g');
    let pendingPos = '';
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      const cleaned = cleanGloss(before);
      if (cleaned && CJK.test(cleaned)) segments.push([pendingPos, cleaned]);
      pendingPos = normalizePos(match[1]);
      lastIndex = re.lastIndex;
    }
    const tail = cleanGloss(text.slice(lastIndex));
    if (tail && CJK.test(tail)) segments.push([pendingPos, tail]);
  }
  const seen = new Set();
  const out = [];
  for (const [pos, text] of segments) {
    const key = `${pos}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([pos, text]);
    if (out.length >= MAX_SENSES) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 词性对齐
 * ------------------------------------------------------------------ */

function grams(text) {
  const clean = text.replace(/[^\u4e00-\u9fff]/g, '');
  const set = new Set();
  for (let i = 0; i + 2 <= clean.length; i += 1) set.add(clean.slice(i, i + 2));
  return set;
}

function overlapScore(a, b) {
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  return inter / Math.min(ga.size, gb.size);
}

function guessPos(text) {
  if (/的$/.test(text)) return 'adj.';
  if (/地$/.test(text)) return 'adv.';
  if (/^(使|把|对|向|进行|加以)/.test(text)) return 'v.';
  return '';
}

function alignSenses(senses, refs) {
  if (!refs || !refs.length) return senses.map(([pos, text]) => [pos || guessPos(text), text]);
  return senses.map(([pos, text]) => {
    if (pos) return [pos, text];
    let bestPos = '';
    let best = 0;
    for (const [rpos, rtext] of refs) {
      if (!rpos) continue;
      const score = overlapScore(text, rtext);
      if (score > best) {
        best = score;
        bestPos = rpos;
      }
    }
    return [bestPos || guessPos(text), text];
  });
}

function posRate(entries) {
  let total = 0;
  let tagged = 0;
  for (const entry of entries) {
    const senses = splitSenses(entry.trans);
    for (const [pos] of senses) {
      total += 1;
      if (pos) tagged += 1;
    }
  }
  return total ? tagged / total : 0;
}

/* ------------------------------------------------------------------ *
 * 标题 / 分类
 * ------------------------------------------------------------------ */

const FEATURED = [
  'coca20000',
  'Oxford3000',
  'Oxford5000',
  'Macmillan7000',
  'Longman_Communication_3000',
  '4000_Essential_English_Words-meaning',
  'CET4_T',
  'CET6_T',
  'Level4luan_2_T',
  'Level8luan_2_T',
  'KaoYan_2024',
  '2025KaoYanHongBaoShu',
  'kaoyanshanguo2025',
  'GaoKao_3500',
  'TOEFL_3_T',
  'IELTS_3_T',
  'IELTS_XDF_7000',
  'GRE_3_T',
  'GRE3000_3_T',
  'GMAT_3_T',
  'SAT_3_T',
  'TOEIC',
  'BEC_2_T',
  'BEC_3_T',
  'PTE_senior',
  'PETS_3',
  'NCE_1',
  'NCE_2',
  'NCE_3',
  'NCE_4',
  'PEPGaoZhong_1_T',
  'PEPChuZhong7_1_T',
  'raz-all',
  'Duolingo_Vocabulary_B1',
  'Duolingo_Vocabulary_B2',
  'Duolingo_Vocabulary_C1',
  'top2000words',
  'frequently_used_word01',
  'frequently_used_word02',
  'frequently_used_word03',
  'self-study_English3',
];

const TITLE_MAP = {
  coca20000: 'COCA 20000 词频',
  Oxford3000: '牛津 3000 核心',
  Oxford5000: '牛津 5000',
  Macmillan7000: '麦克米伦 7000',
  Longman_Communication_3000: '朗文交际 3000',
  '4000_Essential_English_Words-meaning': '4000 基础英语词（释义）',
  CET4_T: 'CET-4 核心',
  CET6_T: 'CET-6 核心',
  Level4luan_2_T: '专四乱序',
  Level8luan_2_T: '专八乱序',
  KaoYan_2024: '考研 2024',
  '2025KaoYanHongBaoShu': '考研红宝书 2025',
  kaoyanshanguo2025: '考研闪果 2025',
  GaoKao_3500: '高考 3500',
  TOEFL_3_T: 'TOEFL 核心',
  IELTS_3_T: 'IELTS 核心',
  IELTS_XDF_7000: 'IELTS 新东方 7000',
  GRE_3_T: 'GRE 核心',
  GRE3000_3_T: 'GRE 3000',
  GMAT_3_T: 'GMAT 核心',
  SAT_3_T: 'SAT 核心',
  TOEIC: '托业 TOEIC',
  BEC_2_T: 'BEC 中级',
  BEC_3_T: 'BEC 高级',
  PTE_senior: 'PTE 高级',
  PETS_3: 'PETS 三级',
  NCE_1: '新概念 1',
  NCE_2: '新概念 2',
  NCE_3: '新概念 3',
  NCE_4: '新概念 4',
  PEPGaoZhong_1_T: '人教高中 必修 1',
  PEPChuZhong7_1_T: '人教初中 七上',
  'raz-all': 'RAZ 全级别',
  Duolingo_Vocabulary_B1: 'Duolingo B1',
  Duolingo_Vocabulary_B2: 'Duolingo B2',
  Duolingo_Vocabulary_C1: 'Duolingo C1',
  top2000words: '高频 2000 词',
  frequently_used_word01: '常用词 01',
  frequently_used_word02: '常用词 02',
  frequently_used_word03: '常用词 03',
  'self-study_English3': '自考英语（三）',
};

const CATEGORY_ORDER = ['考试', '教材', '词频', '分级', '其它'];

function categorize(base) {
  const b = base.toLowerCase();
  if (
    /(coca|top\d|frequently|oxford3000|oxford5000|macmillan|longman|duolingo|ef_level|4000_essential|3000_classroom|top2000|top1000|top1500|top500|top250|top50|top60)/.test(
      b,
    )
  ) {
    return '词频';
  }
  if (
    /(cet|gre|toefl|ielts|gmat|sat|toeic|bec|pte|pets|kaoyan|gaokao|zhongkao|level4|level8|adult-self|self-study|hongbao|shanguo|tingshuo|ket|pet-|ielts-real|gre-ciyi)/.test(
      b,
    )
  ) {
    return '考试';
  }
  if (
    /(pep|waiyanshe|beishi|beijing|nce|newwaiyan|waiyan|join|cambridge|oxfordvocabulary|readingexplorer|jijiao|yilin|shanghai|zhuan-cha-ben|raz|danci|mimi|jianfa|xinghuoqiaoji|english_ii)/.test(
      b,
    )
  ) {
    return '教材';
  }
  if (/(raz|grade|level|ef_|essential|duolingo)/.test(b)) return '分级';
  return '其它';
}

function slugify(base) {
  return base
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'dict';
}

function prettifyTitle(base) {
  if (TITLE_MAP[base]) return TITLE_MAP[base];
  let s = base
    .replace(/_T$/i, '')
    .replace(/-T$/i, '')
    .replace(/\.json$/i, '');
  s = s.replace(/[_]+/g, ' ');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/\s+/g, ' ').trim();
  const abbr =
    /^(cet|gre|toefl|ielts|gmat|sat|toeic|bec|pte|pets|nce|pep|raz|coca|voa|ket|sat)\b/i;
  return s.replace(abbr, (m) => m.toUpperCase());
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const SKIP_FILE_RE =
  /(japanese|japvocab|jap_|kazakh|indonesian|german|hiragana|katakana|chinese_test|^rust-|^go_|^js-|^java-|^python-|csharp|^node-|^sql_|linux-command|arduino|^child_|suffix_word|word_roots|audiokey|^926\.json|^oi_xcpc|^it-words|^itvocabulary)/i;

function readJson(file) {
  const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('顶层不是数组');
  return data;
}

function cjkRate(entries) {
  let total = 0;
  let cjk = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string') continue;
    const trans = entry.trans;
    const text = Array.isArray(trans) ? trans.join(' ') : String(trans ?? '');
    total += 1;
    if (CJK.test(text)) cjk += 1;
  }
  return total ? cjk / total : 0;
}

function main() {
  const started = Date.now();
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (!FORCE && fs.existsSync(manifestPath)) {
    console.log('public/data/manifest.json 已存在，跳过（--force 可强制重建）');
    return;
  }

  if (!fs.existsSync(SRC_DIR)) {
    console.error(`找不到词库目录：${SRC_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(DICT_OUT, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.json'));
  const included = [];
  const skipped = [];

  // 第一遍：解析与筛选
  const parsed = [];
  for (const file of files) {
    const base = file.replace(/\.json$/i, '');
    if (SKIP_FILE_RE.test(base)) {
      skipped.push({ file, reason: '多语种/非词汇类词表' });
      continue;
    }
    let entries;
    try {
      entries = readJson(file);
    } catch (err) {
      skipped.push({ file, reason: `解析失败：${err.message}` });
      continue;
    }
    const valid = entries.filter(
      (e) => e && typeof e.name === 'string' && e.name.trim().length > 0,
    );
    if (valid.length < 10) {
      skipped.push({ file, reason: `有效词条过少（${valid.length}）` });
      continue;
    }
    if (cjkRate(valid) < 0.5) {
      skipped.push({ file, reason: '缺少中文释义' });
      continue;
    }
    parsed.push({ file, base, entries: valid });
  }

  // 词性参考表：只取词性标记率高的词典
  const posIndex = new Map();
  for (const { entries } of parsed) {
    if (posRate(entries) < 0.3) continue;
    for (const entry of entries) {
      const word = entry.name.trim().toLowerCase();
      const senses = splitSenses(entry.trans);
      if (!senses.length) continue;
      const list = posIndex.get(word) ?? [];
      for (const sense of senses) {
        if (!list.some((x) => x[0] === sense[0] && x[1] === sense[1])) list.push(sense);
      }
      posIndex.set(word, list.slice(0, 6));
    }
  }

  // 第二遍：规范化每本词表
  const dicts = [];
  const hashToId = new Map();
  const usedIds = new Set();

  for (const { file, base, entries } of parsed) {
    const words = [];
    const seenWords = new Set();
    for (const entry of entries) {
      const display = entry.name.trim();
      const key = display.toLowerCase();
      if (seenWords.has(key)) continue;
      seenWords.add(key);
      let senses = splitSenses(entry.trans);
      if (!senses.length) continue;
      senses = alignSenses(senses, posIndex.get(key));
      const phone = String(entry.usphone || entry.ukphone || '')
        .replace(/^[\s'"]+|[\s'"]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      words.push(phone ? [display, senses, phone] : [display, senses]);
    }
    if (words.length < 10) {
      skipped.push({ file, reason: `规范化后有效词条过少（${words.length}）` });
      continue;
    }

    const seqHash = crypto
      .createHash('sha1')
      .update(words.map((w) => w[0].toLowerCase()).join('\u0001'))
      .digest('hex');

    let id = slugify(base);
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    usedIds.add(id);

    const sensesCount = words.reduce((sum, w) => sum + w[1].length, 0);
    const tagged = words.reduce(
      (sum, w) => sum + w[1].filter(([pos]) => pos).length,
      0,
    );

    const dict = {
      id,
      base,
      title: prettifyTitle(base),
      category: categorize(base),
      featured: FEATURED.includes(base),
      words,
      count: words.length,
      senses: sensesCount,
      posRate: sensesCount ? tagged / sensesCount : 0,
      aliasOf: null,
      file: `dict/${id}.json`,
      seqHash,
      entryCount: entries.length,
    };

    const existing = hashToId.get(seqHash);
    if (existing) {
      dict.aliasOf = existing.id;
      dict.file = null;
      dict.words = [];
      dict.count = words.length;
    } else {
      hashToId.set(seqHash, dict);
      fs.writeFileSync(path.join(DICT_OUT, `${id}.json`), JSON.stringify({ id, words }));
    }

    included.push(dict);
    dicts.push(dict);
  }

  // 排序：featured 按给定顺序在前（alias 条目紧跟目标），其余按分类 + 标题
  const featuredIndex = new Map(FEATURED.map((b, i) => [b, i]));
  const catIndex = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  const primary = dicts.filter((d) => !d.aliasOf);
  primary.sort((a, b) => {
    const fa = a.featured ? featuredIndex.get(a.base) ?? 999 : 999;
    const fb = b.featured ? featuredIndex.get(b.base) ?? 999 : 999;
    if (fa !== fb) return fa - fb;
    const ca = catIndex.get(a.category) ?? 9;
    const cb = catIndex.get(b.category) ?? 9;
    if (ca !== cb) return ca - cb;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });

  const ordered = [];
  for (const dict of primary) {
    ordered.push(dict);
    for (const alias of dicts.filter((d) => d.aliasOf === dict.id)) ordered.push(alias);
  }

  // 干扰词池
  const anchorBases = [
    'coca20000',
    'Oxford5000',
    'Oxford3000',
    'GaoKao_3500',
    'KaoYan_2024',
    'CET4_T',
    'CET6_T',
    'TOEFL_3_T',
    'IELTS_3_T',
    'GRE_3_T',
    'TOEIC',
    'Macmillan7000',
    'Level8luan_2_T',
    '2025KaoYanHongBaoShu',
    'SAT_3_T',
    'GRE3000_3_T',
  ];
  const anchorWords = new Set();
  for (const dict of dicts) {
    if (dict.aliasOf || !anchorBases.includes(dict.base)) continue;
    for (const [word] of dict.words) anchorWords.add(word.toLowerCase());
  }

  const poolMap = new Map();
  for (const dict of dicts) {
    if (dict.aliasOf) continue;
    for (const [word, senses] of dict.words) {
      const key = word.toLowerCase();
      if (!anchorWords.has(key)) continue;
      if (!/^[a-z][a-z'-]{1,20}$/.test(key)) continue;
      const list = poolMap.get(key) ?? [];
      for (const sense of senses) {
        if (!list.some((x) => x[0] === sense[0] && x[1] === sense[1])) list.push(sense);
      }
      poolMap.set(key, list.slice(0, MAX_POOL_SENSES));
    }
  }
  const poolWords = [...poolMap.entries()]
    .filter(([, senses]) => senses.length > 0)
    .map(([word, senses]) => [word, senses]);

  const manifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    dicts: ordered.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      featured: d.featured,
      count: d.count,
      senses: d.senses,
      posRate: Number(d.posRate.toFixed(3)),
      aliasOf: d.aliasOf,
      file: d.file,
    })),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(OUT_DIR, 'pool.json'),
    JSON.stringify({ version: 1, words: poolWords }),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    ms: Date.now() - started,
    totals: {
      inputFiles: files.length,
      includedDicts: included.length,
      aliasDicts: included.filter((d) => d.aliasOf).length,
      words: included.reduce((sum, d) => sum + (d.count || 0), 0),
      senses: included.reduce((sum, d) => sum + (d.senses || 0), 0),
      poolWords: poolWords.length,
    },
    included: included.map((d) => ({
      file: `${d.base}.json`,
      id: d.id,
      title: d.title,
      category: d.category,
      featured: d.featured,
      count: d.count,
      senses: d.senses,
      posRate: Number(d.posRate.toFixed(3)),
      aliasOf: d.aliasOf,
    })),
    skipped,
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'build-report.json'), JSON.stringify(report, null, 2));

  console.log(
    `词表 ${report.totals.includedDicts} 本（其中重复 ${report.totals.aliasDicts} 本）· 词条 ${report.totals.words} · pool ${report.totals.poolWords} 词 · 用时 ${report.ms}ms`,
  );
  console.log(`已输出：${OUT_DIR}`);
}

const IS_MAIN =
  process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) main();
