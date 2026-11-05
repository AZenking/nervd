import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog';

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
  const overlays = document.querySelectorAll('.alert-dialog__backdrop');
  overlays.forEach((o) => o.remove());
});

describe('HeroUI AlertDialog Component', () => {
  it('renders closed alert dialog without mounted backdrop', async () => {
    await act(async () => {
      root.render(
        <AlertDialog open={false}>
          <AlertDialogContent>
            <div>确认操作</div>
          </AlertDialogContent>
        </AlertDialog>
      );
    });

    const backdrop = document.querySelector('.alert-dialog__backdrop');
    expect(backdrop).toBeNull();
  });

  it('renders open alert dialog with native HeroUI BEM elements and role="alertdialog"', async () => {
    await act(async () => {
      root.render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除分支</AlertDialogTitle>
              <AlertDialogDescription>删除后将无法恢复，确定继续吗？</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction>确认删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    });

    const backdrop = document.querySelector('.alert-dialog__backdrop');
    expect(backdrop).not.toBeNull();

    const container = document.querySelector('.alert-dialog__container');
    expect(container).not.toBeNull();

    const dialog = document.querySelector('.alert-dialog__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('alertdialog');

    const heading = document.querySelector('.alert-dialog__heading');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain('确认删除分支');
  });

  it('supports compound API AlertDialog.Root, AlertDialog.Backdrop, AlertDialog.Container, AlertDialog.Dialog', async () => {
    await act(async () => {
      root.render(
        <AlertDialog.Root open>
          <AlertDialog.Backdrop>
            <AlertDialog.Container placement="center" size="sm">
              <AlertDialog.Dialog>
                <AlertDialog.Heading>危险操作</AlertDialog.Heading>
                <AlertDialog.Body>请谨慎操作</AlertDialog.Body>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog.Root>
      );
    });

    const dialog = document.querySelector('.alert-dialog__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
  });
});
