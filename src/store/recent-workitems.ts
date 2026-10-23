import { create } from 'zustand';

export interface RecentWorkitem {
  workitemId: string;
  identifier: string;
  subject: string;
  category?: string;
  status?: string;
  spaceName?: string;
  viewedAt: number;
  stayedSeconds: number;
}

const STORAGE_KEY = 'nervd:recent_workitems';
const MAX_RECENTS = 50;

export function loadStoredRecents(): RecentWorkitem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item === 'object' && typeof item.workitemId === 'string' && typeof item.identifier === 'string',
    );
  } catch {
    return [];
  }
}

export function saveStoredRecents(items: RecentWorkitem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 忽略存储异常
  }
}

interface RecentStore {
  items: RecentWorkitem[];
  record: (item: {
    workitemId: string;
    identifier: string;
    subject: string;
    category?: string;
    status?: string;
    spaceName?: string;
    stayedSeconds?: number;
  }) => void;
  remove: (workitemId: string) => void;
  clear: () => void;
}

export const useRecentWorkitems = create<RecentStore>((set, get) => ({
  items: loadStoredRecents(),

  record: (item) => {
    const { workitemId, identifier, subject, category, status, spaceName, stayedSeconds = 30 } = item;
    if (!workitemId || !identifier) return;

    const prev = get().items;
    const now = Date.now();
    const existingIndex = prev.findIndex((i) => i.workitemId === workitemId);

    let next: RecentWorkitem[];
    if (existingIndex >= 0) {
      const updatedItem: RecentWorkitem = {
        ...prev[existingIndex],
        identifier,
        subject: subject || prev[existingIndex].subject,
        category: category || prev[existingIndex].category,
        status: status || prev[existingIndex].status,
        spaceName: spaceName || prev[existingIndex].spaceName,
        viewedAt: now,
        stayedSeconds: Math.max(prev[existingIndex].stayedSeconds || 30, stayedSeconds),
      };
      next = [updatedItem, ...prev.filter((_, idx) => idx !== existingIndex)];
    } else {
      const newItem: RecentWorkitem = {
        workitemId,
        identifier,
        subject,
        category,
        status,
        spaceName,
        viewedAt: now,
        stayedSeconds,
      };
      next = [newItem, ...prev].slice(0, MAX_RECENTS);
    }

    saveStoredRecents(next);
    set({ items: next });
  },

  remove: (workitemId) => {
    const next = get().items.filter((i) => i.workitemId !== workitemId);
    saveStoredRecents(next);
    set({ items: next });
  },

  clear: () => {
    saveStoredRecents([]);
    set({ items: [] });
  },
}));
