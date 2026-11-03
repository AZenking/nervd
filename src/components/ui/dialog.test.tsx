import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';

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
  const overlays = document.querySelectorAll('.modal__backdrop');
  overlays.forEach((o) => o.remove());
});

describe('HeroUI Dialog Component', () => {
  it('renders closed dialog without mounted backdrop', async () => {
    await act(async () => {
      root.render(
        <Dialog open={false}>
          <DialogContent>
            <div>弹窗内容</div>
          </DialogContent>
        </Dialog>
      );
    });

    const backdrop = document.querySelector('.modal__backdrop');
    expect(backdrop).toBeNull();
  });

  it('renders open dialog with native HeroUI BEM elements and placement', async () => {
    await act(async () => {
      root.render(
        <Dialog open>
          <DialogContent placement="center" size="md">
            <DialogHeader>
              <DialogTitle>新建分支</DialogTitle>
              <DialogDescription>为当前工作项创建特性分支</DialogDescription>
            </DialogHeader>
            <div data-testid="dialog-body">分支内容</div>
            <DialogFooter>
              <button type="button">保存</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    });

    const backdrop = document.querySelector('.modal__backdrop');
    expect(backdrop).not.toBeNull();

    const container = document.querySelector('.modal__container');
    expect(container).not.toBeNull();

    const dialog = document.querySelector('.modal__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('dialog');

    const header = document.querySelector('.modal__header');
    expect(header).not.toBeNull();

    const heading = document.querySelector('.modal__heading');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain('新建分支');

    const closeTrigger = document.querySelector('[data-slot="modal-close-trigger"]');
    expect(closeTrigger).not.toBeNull();
  });

  it('supports compound API Dialog.Root, Dialog.Backdrop, Dialog.Container, Dialog.Dialog', async () => {
    await act(async () => {
      root.render(
        <Dialog.Root open>
          <Dialog.Backdrop>
            <Dialog.Container placement="top" size="lg">
              <Dialog.Dialog>
                <Dialog.Heading>快捷搜索</Dialog.Heading>
                <Dialog.Body>搜索结果</Dialog.Body>
              </Dialog.Dialog>
            </Dialog.Container>
          </Dialog.Backdrop>
        </Dialog.Root>
      );
    });

    const container = document.querySelector('.modal__container');
    expect(container).not.toBeNull();
    expect(container?.getAttribute('data-placement')).toBe('top');

    const dialog = document.querySelector('.modal__dialog');
    expect(dialog).not.toBeNull();
  });
});
