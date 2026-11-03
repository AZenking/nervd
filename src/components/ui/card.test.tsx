import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe('HeroUI Card Component', () => {
  it('renders card with native HeroUI BEM elements and slots', async () => {
    await act(async () => {
      root.render(
        <Card>
          <Card.Header>
            <Card.Title>卡片标题</Card.Title>
            <Card.Description>卡片描述文本</Card.Description>
          </Card.Header>
          <Card.Content>
            <div>卡片主要内容</div>
          </Card.Content>
          <Card.Footer>
            <button type="button">操作</button>
          </Card.Footer>
        </Card>
      );
    });

    const card = host.querySelector('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('card')).toBe(true);

    const header = host.querySelector('[data-slot="card-header"]');
    expect(header).not.toBeNull();
    expect(header?.classList.contains('card__header')).toBe(true);

    const title = host.querySelector('[data-slot="card-title"]');
    expect(title).not.toBeNull();
    expect(title?.textContent).toBe('卡片标题');

    const desc = host.querySelector('[data-slot="card-description"]');
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe('卡片描述文本');

    const content = host.querySelector('[data-slot="card-content"]');
    expect(content).not.toBeNull();

    const footer = host.querySelector('[data-slot="card-footer"]');
    expect(footer).not.toBeNull();
  });

  it('supports variants default, secondary, tertiary, and transparent', async () => {
    await act(async () => {
      root.render(
        <Card variant="secondary">
          <CardContent>副级内容</CardContent>
        </Card>
      );
    });

    const card = host.querySelector('[data-slot="card"]');
    expect(card?.classList.contains('card--secondary')).toBe(true);
  });

  it('supports named exports CardHeader, CardTitle, CardDescription, CardContent, CardFooter', async () => {
    await act(async () => {
      root.render(
        <Card>
          <CardHeader>
            <CardTitle>命名导出标题</CardTitle>
            <CardDescription>命名导出描述</CardDescription>
          </CardHeader>
          <CardContent>正文</CardContent>
          <CardFooter>页脚</CardFooter>
        </Card>
      );
    });

    const title = host.querySelector('[data-slot="card-title"]');
    expect(title?.textContent).toBe('命名导出标题');
  });
});
