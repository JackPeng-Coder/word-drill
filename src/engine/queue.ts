import type { RawWord, Stats, OrderMode, Scope } from '../lib/types';
import { wordKey } from '../lib/types';

export interface QueueOptions {
  scope: Scope;
  roundSize: number | 'all';
  order: OrderMode;
}

interface Args {
  dictId: string;
  words: RawWord[];
  stats: Stats;
  options: QueueOptions;
  rng: () => number;
}

function errorScore(stats: Stats, key: string): number {
  const s = stats[key];
  if (!s) return 0;
  return s.wrong + s.missed + s.over + s.unknown + s.timeouts;
}

export function buildQueue({ dictId, words, stats, options, rng }: Args): string[] {
  const usable = words.filter((w) => (w[1]?.length ?? 0) > 0 && typeof w[0] === 'string');
  let list = usable;

  switch (options.scope) {
    case 'unmastered':
      list = usable.filter((w) => {
        const s = stats[wordKey(dictId, w[0])];
        return Boolean(s && s.seen > 0 && !s.mastered);
      });
      break;
    case 'new':
      list = usable.filter((w) => {
        const s = stats[wordKey(dictId, w[0])];
        return !s || s.seen === 0;
      });
      break;
    case 'wrongFirst':
      list = usable
        .map((w, i) => ({ w, i, score: errorScore(stats, wordKey(dictId, w[0])) }))
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map((x) => x.w);
      break;
    default:
      list = usable;
      break;
  }

  let queue = list.map((w) => w[0]);

  if (options.order === 'random') {
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }

  if (options.roundSize !== 'all') {
    queue = queue.slice(0, Math.max(0, options.roundSize));
  }
  return queue;
}
