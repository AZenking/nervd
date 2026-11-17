import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JenkinsConnectionView, PipelineSummary, RepoCiBinding } from '@/types';
import { RepoCiBindingFields } from './repo-ci-binding-fields';

describe('RepoCiBindingFields', () => {
  let host: HTMLDivElement;
  let root: Root;

  /** HeroUI ComboBox 把选中值渲染在输入框 value 上（不在 textContent 里），按 aria-label 取输入框值 */
  const comboValue = (label: string): string =>
    host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)?.value ?? '';

  const mockPipelines: PipelineSummary[] = [
    { pipelineId: 101, pipelineName: 'trade-service-build' },
    { pipelineId: 102, pipelineName: 'nervd-desktop-release' },
  ];

  const mockJenkins: JenkinsConnectionView[] = [
    {
      id: 'jk-1',
      name: '生产 Jenkins',
      baseUrl: 'https://jenkins.example.com',
      username: 'ci-bot',
      hasToken: true,
    },
  ];

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

  it('默认未绑定时显示关联 CI 流水线标题和提供方下拉', async () => {
    const onChange = vi.fn();
    await act(() => {
      root.render(
        <RepoCiBindingFields
          repoName="trade-service"
          binding={null}
          onChange={onChange}
          pipelines={mockPipelines}
          jenkinsConnections={mockJenkins}
        />,
      );
    });

    expect(host.textContent).toContain('关联 CI 流水线 (可选)');
    expect(host.textContent).toContain('CI 提供方');
    expect(comboValue('CI 提供方')).toBe('不关联 CI');
  });

  it('绑定为 Flow 时展示云效流水线并提示推荐', async () => {
    const onChange = vi.fn();
    const binding: RepoCiBinding = {
      provider: 'flow',
      pipelineId: 101,
      pipelineName: 'trade-service-build',
    };

    await act(() => {
      root.render(
        <RepoCiBindingFields
          repoName="trade-service"
          binding={binding}
          onChange={onChange}
          pipelines={mockPipelines}
          jenkinsConnections={mockJenkins}
          recommendedPipeline={mockPipelines[0]}
          recommendReason="流水线包含完整仓库标识「trade-service」"
        />,
      );
    });

    expect(comboValue('CI 提供方')).toBe('云效 Flow 流水线');
    expect(host.textContent).toContain('智能匹配');
    expect(comboValue('云效流水线')).toBe('★ trade-service-build (推荐)');
    expect(host.textContent).toContain('流水线包含完整仓库标识');
  });

  it('绑定为 Jenkins 时展示实例选择与 Job 下拉选择框', async () => {
    const onChange = vi.fn();
    const binding: RepoCiBinding = {
      provider: 'jenkins',
      connectionId: 'jk-1',
      jobFullName: 'frontend/nervd',
    };

    await act(() => {
      root.render(
        <RepoCiBindingFields
          repoName="trade-service"
          binding={binding}
          onChange={onChange}
          pipelines={mockPipelines}
          jenkinsConnections={mockJenkins}
        />,
      );
    });

    expect(comboValue('Jenkins 实例')).toBe('生产 Jenkins');
    expect(host.textContent).toContain('Job 全路径');
    const trigger = host.querySelector('[aria-label="Jenkins Job 全路径"]');
    expect(trigger).not.toBeNull();
    expect(comboValue('Jenkins Job 全路径')).toBe('frontend/nervd');
  });
});
