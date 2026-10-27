import { create } from 'zustand';
import * as api from '@/lib/api';
import type {
  CreateLocalTaskPayload,
  LocalTask,
  LocalTaskStatus,
  UpdateLocalTaskPayload,
} from '@/types/local-task';

interface LocalTasksState {
  tasks: LocalTask[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  statusFilter: 'all' | LocalTaskStatus;
  activeTaskId: string | null;

  loadTasks: (status?: string, search?: string) => Promise<void>;
  createTask: (title: string, options?: Partial<CreateLocalTaskPayload>) => Promise<LocalTask | null>;
  updateTask: (id: string, payload: UpdateLocalTaskPayload) => Promise<boolean>;
  cycleTaskStatus: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<boolean>;
  setSearchQuery: (q: string) => void;
  setStatusFilter: (filter: 'all' | LocalTaskStatus) => void;
  setActiveTaskId: (id: string | null) => void;
}

export const NEXT_STATUS_MAP: Record<LocalTaskStatus, LocalTaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
  canceled: 'todo',
};

export const useLocalTasksStore = create<LocalTasksState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  searchQuery: '',
  statusFilter: 'all',
  activeTaskId: null,

  loadTasks: async (status, search) => {
    set({ loading: true, error: null });
    try {
      const tasks = await api.listLocalTasks(status, search);
      set({ tasks, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  createTask: async (title: string, options) => {
    const trimmed = title.trim();
    if (!trimmed) return null;

    const tempId = `temp-${Date.now()}`;
    const optimisticTask: LocalTask = {
      id: tempId,
      title: trimmed,
      status: options?.status || 'todo',
      repos: options?.repos || [],
      repoId: options?.repoId ?? null,
      repoName: options?.repoName ?? null,
      branchName: options?.branchName ?? null,
      description: options?.description ?? null,
      priority: options?.priority || 'none',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 乐观立即插入前部
    set((state) => ({
      tasks: [optimisticTask, ...state.tasks],
    }));

    try {
      const created = await api.createLocalTask({
        title: trimmed,
        ...options,
      });
      // 替换临时任务
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === tempId ? created : t)),
      }));
      return created;
    } catch (err) {
      // 回滚
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== tempId),
        error: err instanceof Error ? err.message : String(err),
      }));
      return null;
    }
  },

  updateTask: async (id: string, payload: UpdateLocalTaskPayload) => {
    const prevTasks = get().tasks;
    const target = prevTasks.find((t) => t.id === id);
    if (!target) return false;

    // 乐观更新
    const now = Date.now();
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              title: payload.title ?? t.title,
              status: payload.status ?? t.status,
              repoId: payload.repoId !== undefined ? payload.repoId : t.repoId,
              repoName: payload.repoName !== undefined ? payload.repoName : t.repoName,
              branchName: payload.branchName !== undefined ? payload.branchName : t.branchName,
              description: payload.description !== undefined ? payload.description : t.description,
              priority: payload.priority ?? t.priority,
              updatedAt: now,
            }
          : t,
      ),
    }));

    try {
      const updated = await api.updateLocalTask(id, payload);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
      }));
      return true;
    } catch (err) {
      // 回滚
      set({ tasks: prevTasks, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  cycleTaskStatus: async (id: string) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const nextStatus = NEXT_STATUS_MAP[task.status] || 'todo';
    await get().updateTask(id, { status: nextStatus });
  },

  deleteTask: async (id: string) => {
    const prevTasks = get().tasks;
    // 乐观删除
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
    }));

    try {
      await api.deleteLocalTask(id);
      return true;
    } catch (err) {
      // 回滚
      set({ tasks: prevTasks, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setActiveTaskId: (activeTaskId) => set({ activeTaskId }),
}));
