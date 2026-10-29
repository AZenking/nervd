import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { RecentsView } from './RecentsView';
import { useRecentWorkitems } from '@/store/recent-workitems';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd, args) => {
    console.log('invoke called:', cmd, args);
    if (cmd === 'get_workitem') {
      return Promise.resolve({
        workitemId: 'w-101',
        identifier: 'REQ-101',
        subject: '测试需求',
        category: 'Req',
        status: { id: 's-1', name: '进行中' },
      });
    }
    if (cmd === 'list_workitem_comments') {
      return Promise.resolve([]);
    }
    if (cmd === 'list_workitem_children') {
      return Promise.resolve({ items: [] });
    }
    return Promise.resolve({});
  }),
}));

describe('RecentsView test', () => {
  it('renders recents and clicks on item without crashing', async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    useRecentWorkitems.getState().clear();
    useRecentWorkitems.getState().record({
      workitemId: 'w-101',
      identifier: 'REQ-101',
      subject: '测试需求',
      category: 'Req',
      status: '进行中',
    });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <TooltipProvider>
            <SidebarProvider>
              <RecentsView />
            </SidebarProvider>
          </TooltipProvider>
        );
      });

      const row = host.querySelector('#recent-row-0') as HTMLElement;
      expect(row).toBeTruthy();

      await act(async () => {
        row.click();
      });

      // Wait for any async promises to resolve
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Also test clicking the external workbench open button
      const openWorkbenchBtn = host.querySelector('button[title="在工作台中全屏打开"]') as HTMLElement;
      if (openWorkbenchBtn) {
        await act(async () => {
          openWorkbenchBtn.click();
        });
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

