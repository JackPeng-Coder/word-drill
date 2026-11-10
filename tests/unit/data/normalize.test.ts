import { describe, expect, it } from 'vitest';
import { splitSenses } from '../../../scripts/build-data.mjs';

describe('splitSenses（词库规范化）', () => {
  it('切分一段里塞了多个词性的 coca 风格释义', () => {
    const senses = splitSenses(['vt.得到,抓住vt.& vi.到达，来vi.成为n.生殖，幼兽']);
    expect(senses.map((s) => s[0])).toEqual(['vt.', 'vt.& vi.', 'vi.', 'n.']);
    expect(senses[0][1]).toContain('得到');
    expect(senses[3][1]).toContain('生殖');
  });

  it('a. / ad. 归一为 adj. / adv.', () => {
    const senses = splitSenses(['a. 能够的', 'ad. 在上面']);
    expect(senses[0][0]).toBe('adj.');
    expect(senses[1][0]).toBe('adv.');
  });

  it('全角句点也能识别词性', () => {
    const senses = splitSenses(['v．倾诉；信赖']);
    expect(senses[0][0]).toBe('v.');
    expect(senses[0][1]).toContain('倾诉');
  });

  it('清除 Oxford 风格的变形噪声', () => {
    const senses = splitSenses(['v. 放弃，抛弃|时态:abandoned, abandoning名 词:abandonment']);
    const text = senses.map((s) => s[1]).join('|');
    expect(text).toContain('放弃');
    expect(text).not.toContain('时态');
    expect(text).not.toContain('abandonment');
  });

  it('丢弃没有中文的片段，最多保留 4 个义项', () => {
    expect(splitSenses(['vt. take, get'])).toEqual([]);
    const many = splitSenses(['n. 一；二；三；四；五；六']);
    expect(many.length).toBeLessThanOrEqual(4);
  });

  it('空输入安全', () => {
    expect(splitSenses([])).toEqual([]);
    expect(splitSenses(null)).toEqual([]);
    expect(splitSenses(undefined)).toEqual([]);
  });

  it('去重相同词性+释义', () => {
    const senses = splitSenses(['n. 苹果', 'n. 苹果']);
    expect(senses).toHaveLength(1);
  });
});
