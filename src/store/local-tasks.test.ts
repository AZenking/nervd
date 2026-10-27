import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { NEXT_STATUS_MAP, useLocalTasksStore } from './local-tasks';
import type { LocalTask } from '@/types/local-task';

vi.mock('@/lib/api', () => ({
  listLocalTasks: vi.fn(),
  createLocalTask: vi.fn(),
  updateLocalTask: vi.fn(),
  deleteLocalTask: vi.fn(),
}));

describe('useLocalTasksStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLocalTasksStore.setState({
      tasks: [],
      loading: false,
      error: null,
      searchQuery: '',
      statusFilter: 'all',
      activeTaskId: null,
    });
  });

  it('NEXT_STATUS_MAP 状态循环流转测试', () => {
    expect(NEXT_STATUS_MAP.todo).toBe('in_progress');
    expect(NEXT_STATUS_MAP.in_progress).toBe('done');
    expect(NEXT_STATUS_MAP.done).toBe('todo');
    expect(NEXT_STATUS_MAP.canceled).toBe('todo');
  });

  it('loadTasks 成功加载并更新列表', async () => {
    const mockTasks: LocalTask[] = [
      {
        id: 'lt-1',
        title: '测试任务 1',
        status: 'todo',
        priority: 'none',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    vi.mocked(api.listLocalTasks).mockResolvedValueOnce(mockTasks);

    await useLocalTasksStore.getState().loadTasks();

    expect(useLocalTasksStore.getState().tasks).toEqual(mockTasks);
    expect(useLocalTasksStore.getState().loading).toBe(false);
  });

  it('createTask 乐观插入并成功替换为持久化记录', async () => {
    const createdTask: LocalTask = {
      id: 'lt-100',
      title: '优化性能',
      status: 'todo',
      priority: 'none',
      createdAt: 2000,
      updatedAt: 2000,
    };
    vi.mocked(api.createLocalTask).mockResolvedValueOnce(createdTask);

    const promise = useLocalTasksStore.getState().createTask('优化性能');
    // 乐观插入立即生效
    expect(useLocalTasksStore.getState().tasks[0].title).toBe('优化性能');

    const res = await promise;
    expect(res).toEqual(createdTask);
    expect(useLocalTasksStore.getState().tasks[0].id).toBe('lt-100');
  });

  it('cycleTaskStatus 循环切换任务状态', async () => {
    const initialTask: LocalTask = {
      id: 'lt-1',
      title: '流转任务',
      status: 'todo',
      priority: 'none',
      createdAt: 1000,
      updatedAt: 1000,
    };
    useLocalTasksStore.setState({ tasks: [initialTask] });

    vi.mocked(api.updateLocalTask).mockResolvedValueOnce({
      ...initialTask,
      status: 'in_progress',
    });

    await useLocalTasksStore.getState().cycleTaskStatus('lt-1');
    expect(useLocalTasksStore.getState().tasks[0].status).toBe('in_progress');
  });

  it('deleteTask 乐观删除并在异常时回滚', async () => {
    const initialTask: LocalTask = {
      id: 'lt-del',
      title: '删除任务',
      status: 'todo',
      priority: 'none',
      createdAt: 1000,
      updatedAt: 1000,
    };
    useLocalTasksStore.setState({ tasks: [initialTask] });

    vi.mocked(api.deleteLocalTask).mockRejectedValueOnce(new Error('删除失败'));

    const success = await useLocalTasksStore.getState().deleteTask('lt-del');
    expect(success).toBe(false);
    // 回滚恢复
    expect(useLocalTasksStore.getState().tasks.length).toBe(1);
    expect(useLocalTasksStore.getState().tasks[0].id).toBe('lt-del');
  });
});
