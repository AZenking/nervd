import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from './drawer';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (typeof Element.prototype.getAnimations === 'undefined') {
    Element.prototype.getAnimations = () => [];
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  // Clear any modal overlays injected by react-aria into body
  const overlays = document.querySelectorAll('.drawer__backdrop');
  overlays.forEach((o) => o.remove());
});

describe('HeroUI Drawer Component', () => {
  it('renders closed drawer without mounted backdrop', async () => {
    await act(async () => {
      root.render(
        <Drawer open={false}>
          <DrawerContent>
            <div>抽屉内容</div>
          </DrawerContent>
        </Drawer>
      );
    });

    const backdrop = document.querySelector('.drawer__backdrop');
    expect(backdrop).toBeNull();
  });

  it('renders open drawer with native HeroUI BEM elements and placement', async () => {
    await act(async () => {
      root.render(
        <Drawer open placement="right">
          <DrawerContent className="sm:w-[500px]">
            <DrawerHeader>
              <DrawerTitle>构建日志</DrawerTitle>
              <DrawerDescription>实时运行流</DrawerDescription>
            </DrawerHeader>
            <div data-testid="drawer-inner-body">日志正文内容</div>
            <DrawerFooter>
              <button type="button">关闭</button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      );
    });

    const backdrop = document.querySelector('.drawer__backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains('drawer__backdrop--opaque')).toBe(true);

    const content = document.querySelector('.drawer__content');
    expect(content).not.toBeNull();
    expect(content?.classList.contains('drawer__content--right')).toBe(true);

    const dialog = document.querySelector('.drawer__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains('drawer__dialog--right')).toBe(true);
    expect(dialog?.textContent).toContain('构建日志');
    expect(dialog?.textContent).toContain('日志正文内容');
  });

  it('supports direct HeroUI compound API', async () => {
    await act(async () => {
      root.render(
        <Drawer isOpen>
          <Drawer.Backdrop>
            <Drawer.Content placement="right">
              <Drawer.Dialog className="sm:max-w-lg">
                <Drawer.Header>
                  <Drawer.Heading>原生 Compound 标题</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body>
                  <p>原生 Body</p>
                </Drawer.Body>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      );
    });

    const dialog = document.querySelector('.drawer__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('原生 Compound 标题');
    expect(dialog?.textContent).toContain('原生 Body');
  });
});
