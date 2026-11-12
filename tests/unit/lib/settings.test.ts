import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  limitForQuestion,
  normalizeSettings,
  type Settings,
} from '../../../src/lib/types';

describe('限时设置', () => {
  it('默认单选 10s、多选 15s', () => {
    expect(DEFAULT_SETTINGS.timeLimitSingleSec).toBe(10);
    expect(DEFAULT_SETTINGS.timeLimitMultiSec).toBe(15);
  });

  it('按题型取对应限时', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, timeLimitSingleSec: 8, timeLimitMultiSec: 25 };
    expect(limitForQuestion(settings, false)).toBe(8);
    expect(limitForQuestion(settings, true)).toBe(25);
  });

  it('0 表示不限时', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, timeLimitSingleSec: 0, timeLimitMultiSec: 0 };
    expect(limitForQuestion(settings, false)).toBe(0);
    expect(limitForQuestion(settings, true)).toBe(0);
  });

  it('旧存档的 timeLimitSec 迁移到单选与多选', () => {
    const legacy = { ...DEFAULT_SETTINGS, timeLimitSec: 30 } as unknown as Settings;
    delete (legacy as unknown as Record<string, unknown>).timeLimitSingleSec;
    delete (legacy as unknown as Record<string, unknown>).timeLimitMultiSec;
    const settings = normalizeSettings(legacy);
    expect(settings.timeLimitSingleSec).toBe(30);
    expect(settings.timeLimitMultiSec).toBe(30);
  });

  it('新字段存在时不再被旧字段覆盖', () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      timeLimitSec: 30,
      timeLimitSingleSec: 6,
      timeLimitMultiSec: 12,
    });
    expect(settings.timeLimitSingleSec).toBe(6);
    expect(settings.timeLimitMultiSec).toBe(12);
  });

  it('非法值夹紧到 0..300，缺失字段回落默认值', () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      timeLimitSingleSec: -5,
      timeLimitMultiSec: 9999,
    });
    expect(settings.timeLimitSingleSec).toBe(0);
    expect(settings.timeLimitMultiSec).toBe(300);

    const empty = normalizeSettings(undefined);
    expect(empty.timeLimitSingleSec).toBe(DEFAULT_SETTINGS.timeLimitSingleSec);
    expect(empty.timeLimitMultiSec).toBe(DEFAULT_SETTINGS.timeLimitMultiSec);

    const junk = normalizeSettings({ timeLimitSingleSec: 'abc', timeLimitMultiSec: Number.NaN });
    expect(junk.timeLimitSingleSec).toBe(DEFAULT_SETTINGS.timeLimitSingleSec);
    expect(junk.timeLimitMultiSec).toBe(DEFAULT_SETTINGS.timeLimitMultiSec);
  });
});
