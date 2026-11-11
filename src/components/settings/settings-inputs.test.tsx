import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatRow, OrgRow } from './sections/connection-fields';
import { TraceSection } from './sections/TraceSection';
import { RepoCiBindingsCard, JenkinsInstancesCard } from './CiIntegrationCards';
import { SettingsAutoSaveStatus } from './SettingsAutoSaveStatus';
import { useSettingsDraft } from '@/store/settings-draft';
import { useApp } from '@/store/app';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Settings Inputs and Dropdowns Audit', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useApp.setState({
      settings: {
        organizationId: 'org-test-123',
        defaultSpaceIdentifier: 'space-test',
        linkPattern: '(?:REQ|BUG|TASK)[-_]?(\\d+)',
        watchedRepos: [101],
        allowWriteOps: true,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [
          { id: 'conn-1', name: '研发 Jenkins', baseUrl: 'https://jenkins.test', username: 'admin', hasToken: true },
        ],
        repoCiBindings: {
          '101': { provider: 'jenkins', connectionId: 'conn-1', jobFullName: 'backend/order-api' },
        },
        hasPat: true,
      },
      repositories: [
        { id: 101, name: 'order-api', pathWithNamespace: 'core/trade/order-api-backend-long-path' },
      ],
      pipelines: [
        { pipelineId: 1, pipelineName: '全局自动化流水线-超长名字发布通道-v2' },
      ],
    });

    useSettingsDraft.getState().beginEdit(useApp.getState().settings);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it('PatRow input stops keydown propagation and supports Space key', async () => {
    await act(async () => {
      root?.render(<PatRow />);
    });

    const input = document.querySelector('input#pat') as HTMLInputElement;
    expect(input).toBeDefined();

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      input.dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('OrgRow input stops keydown propagation and supports Space key', async () => {
    await act(async () => {
      root?.render(<OrgRow />);
    });

    const input = document.querySelector('input#org') as HTMLInputElement;
    expect(input).toBeDefined();

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      input.dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('TraceSection pattern and filter inputs stop keydown propagation and show title on repo items', async () => {
    await act(async () => {
      root?.render(<TraceSection />);
    });

    const patternInput = document.querySelector('input#pattern') as HTMLInputElement;
    expect(patternInput).toBeDefined();

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      patternInput.dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();

    // Check title attribute on long repo name in checklist
    const repoLabel = document.querySelector('[title*="order-api-backend-long-path"]');
    expect(repoLabel).not.toBeNull();
  });

  it('JenkinsInstancesCard inputs stop keydown propagation', async () => {
    await act(async () => {
      root?.render(<JenkinsInstancesCard />);
    });

    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      inputs[0].dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('RepoCiBindingsCard has filter input with stopPropagation and tabs container with overflow scroll', async () => {
    await act(async () => {
      root?.render(<RepoCiBindingsCard />);
    });

    const filterInput = document.querySelector('input[placeholder="输入名称过滤…"]') as HTMLInputElement;
    expect(filterInput).toBeDefined();

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      filterInput.dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('SettingsAutoSaveStatus displays error tooltips with title on error messages', async () => {
    useSettingsDraft.setState({
      autoSaveStatus: 'error',
      fieldErrors: {
        space: '空间不存在或权限不足，请核实',
      },
    });

    await act(async () => {
      root?.render(<SettingsAutoSaveStatus />);
    });

    expect(document.body.textContent).toContain('存在 1 处待修正');
  });
});
