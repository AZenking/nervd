import { describe, it, expect } from 'vitest';
import { fuzzyScore, isFuzzyMatch, fuzzyFilter } from './fuzzy';

describe('fuzzy search engine', () => {
  describe('fuzzyScore & isFuzzyMatch', () => {
    it('完全相等应获得最高分', () => {
      const score = fuzzyScore('build-mobile', 'build-mobile');
      expect(score).toBe(1000);
      expect(isFuzzyMatch('build-mobile', 'build-mobile')).toBe(true);
    });

    it('前缀匹配得分应高于普通包含', () => {
      const prefixScore = fuzzyScore('order-service', 'order');
      const middleScore = fuzzyScore('user-order-service', 'order');
      expect(prefixScore).toBeGreaterThan(middleScore);
    });

    it('多词空格分词应支持无序/多段包含', () => {
      const text = 'frontend/order-service-deploy-prod';
      expect(isFuzzyMatch(text, 'order prod')).toBe(true);
      expect(isFuzzyMatch(text, 'deploy frontend')).toBe(true);
    });

    it('符号容错匹配应忽略连字符与下划线差异', () => {
      expect(isFuzzyMatch('order-service', 'orderservice')).toBe(true);
      expect(isFuzzyMatch('h5_checkout_page', 'h5checkout')).toBe(true);
    });

    it('首字母缩写 (Acronym) 匹配', () => {
      expect(isFuzzyMatch('mobile-view-pipeline', 'mvp')).toBe(true);
      expect(isFuzzyMatch('order-service-deploy', 'osd')).toBe(true);
    });

    it('子序列模糊匹配', () => {
      expect(isFuzzyMatch('frontend/order-service-deploy-prod', 'ordersvc')).toBe(true);
    });

    it('完全不相关的关键词应返回 0 且 isFuzzyMatch 为 false', () => {
      expect(fuzzyScore('frontend/order-service', 'payment')).toBe(0);
      expect(isFuzzyMatch('frontend/order-service', 'xyz123')).toBe(false);
    });

    it('空查询词应返回 1 (全部匹配)', () => {
      expect(fuzzyScore('anything', '')).toBe(1);
      expect(fuzzyScore('anything', '   ')).toBe(1);
    });
  });

  describe('fuzzyFilter 排序与过滤', () => {
    const list = [
      { id: 1, name: 'other/some-task' },
      { id: 2, name: 'frontend/order-service-deploy-prod' },
      { id: 3, name: 'order' },
      { id: 4, name: 'api-order-service' },
    ];

    it('应按匹配得分由高到低降序排序', () => {
      const filtered = fuzzyFilter(list, 'order', (item) => item.name);

      expect(filtered.map((x) => x.id)).toEqual([3, 2, 4]);
      // 完全匹配 'order' (id: 3) 排在第一位
      expect(filtered[0].name).toBe('order');
    });

    it('当输入多词时应过滤并保留所有命中的项', () => {
      const filtered = fuzzyFilter(list, 'order prod', (item) => item.name);
      expect(filtered.map((x) => x.id)).toEqual([2]);
      expect(filtered[0].name).toBe('frontend/order-service-deploy-prod');
    });

    it('空查询词应保留原列表全部项', () => {
      const filtered = fuzzyFilter(list, '', (item) => item.name);
      expect(filtered).toHaveLength(4);
    });
  });
});
