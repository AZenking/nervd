import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JenkinsConnectionView, PipelineSummary, RepoCiBinding } from '@/types';
import { RepoCiBindingFields } from './repo-ci-binding-fields';

describe('RepoCiBindingFields', () => {
  let host: HTMLDivElement;
  let root: Root;

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
    expect(host.textContent).toContain('不关联 CI');
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

    expect(host.textContent).toContain('云效 Flow 流水线');
    expect(host.textContent).toContain('智能匹配');
    expect(host.textContent).toContain('trade-service-build');
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

    expect(host.textContent).toContain('Jenkins 实例');
    expect(host.textContent).toContain('Job 全路径');
    const trigger = host.querySelector('[aria-label="Jenkins Job 全路径"]');
    expect(trigger).not.toBeNull();
    expect(host.textContent).toContain('frontend/nervd');
  });
});
