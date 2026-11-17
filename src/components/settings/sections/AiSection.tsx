import { useEffect, useRef, useState } from 'react';
import {
  CheckIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon,
  Trash2Icon, ZapIcon,
} from 'lucide-react';
import {
  deleteAiApiKey, getAiSettings, saveAiApiKey, saveAiSettings, testAiConnection,
} from '@/lib/ai-api';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { ConfirmButton } from '@/components/ConfirmButton';
import type { AiBreakdownMode, AiCustomPrompts, AiProvider, AiSettingsView, AiTestConnectionResult } from '@/types/ai';
import { SettingsGroup, SettingsRow } from '../settings-group';
import { Accordion } from '@/components/ui/accordion';
import { useSettingsDraft } from '@/store/settings-draft';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PROVIDER_PRESETS: Record<AiProvider, { name: string; baseUrl: string; defaultModel: string; hint: string }> = {
  dashscope: {
    name: '阿里云百炼 (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    hint: '推荐用于云效工作台，支持通义千问系列（qwen-plus、qwen-turbo、qwen-max）及百炼托管的 DeepSeek。',
  },
  deepseek: {
    name: 'DeepSeek 开放平台',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    hint: '官方 DeepSeek API，性价比极高，推荐 deepseek-chat 或 deepseek-reasoner。',
  },
  openai: {
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    hint: 'OpenAI 官方或兼容 API 端点，支持 gpt-4o-mini、gpt-4o 等。',
  },
  zhipu: {
    name: '智谱 AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    hint: '智谱开放平台，支持 GLM 系列模型（如 glm-4-flash、glm-4-plus 等）。',
  },
  custom: {
    name: '自定义 / 企业网关 / 本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    hint: '兼容 OpenAI 格式的企业内部大模型网关、OneAPI、vLLM 或本地 Ollama 服务。',
  },
};


/** 场景提示词：默认收起，按使用场景逐条展开编辑 */
const PROMPT_FIELDS: ReadonlyArray<{
  key: keyof AiCustomPrompts;
  id: string;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: 'breakdown',
    id: 'ai-prompt-breakdown',
    label: '子任务拆解工程规范 (Breakdown Rules)',
    description: '定义拆解子任务时的团队约束。例如：必须包含自测任务、后端需注明 RPC 接口、标题动宾结构等。',
    placeholder: '例如：每个需求必须包含一个自测任务；后端任务注明涉及的 RPC 接口；标题严格在 25 字以内。',
  },
  {
    key: 'commentSummary',
    id: 'ai-prompt-comment-summary',
    label: '评论讨论纪要规则 (Discussion Summary)',
    description: '提炼需求讨论历史时的侧重偏好。例如：重点关注交付时间变更、明确阻塞项责任人等。',
    placeholder: '例如：关注技术方案共识与对上线排期的影响，必须明确标出每个阻塞项的责任人。',
  },
  {
    key: 'commentDraft',
    id: 'ai-prompt-comment-draft',
    label: '评论与提测/进度生成偏好 (Comment Generation)',
    description: '定制自动生成研发进度同步、提测交付说明或评论润色时的语言风格与标准段落格式。',
    placeholder: '例如：提测说明必须包含部署环境和测试账号说明；研发进度汇报按「已完成、进行中、风险项」排版。',
  },
  {
    key: 'repoRecommendation',
    id: 'ai-prompt-repo-recommendation',
    label: '代码仓库架构背景说明 (Repo Recommendation Rules)',
    description: '向 AI 提供团队组织的代码仓库命名习惯与业务域归属，帮助 AI 更精准推荐需求应关联的仓库。',
    placeholder: '例如：trade-* 为交易履约核心服务，fed-* 为前端应用，crm-* 为客户中心，common-* 为公共底层库。',
  },
  {
    key: 'mergeRequest',
    id: 'ai-prompt-merge-request',
    label: 'Merge Request 描述规范 (MR Rules)',
    description: '生成 MR 标题与描述时的规范要求。例如：强制遵循 Conventional Commits、包含自测验证清单等。',
    placeholder: '例如：标题强制遵循 Conventional Commits 规范；描述必须包含自测用例清单与回归检查点；跳过 WIP 提交。',
  },
];


export function AiSection() {
  const [settings, setSettings] = useState<AiSettingsView>({
    provider: 'dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    temperature: 0.3,
    breakdownMode: 'review',
    defaultBreakdownTags: ['前端', '后端', '自测'],
    hasApiKey: false,
  });

  const [loading, setLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestConnectionResult | null>(null);

  // 端点/模型为「逐字符输入」字段：直接每次按键保存会在半截 URL（如 https://a）时
  // 命中后端校验并弹错误 Toast。这里改为本地草稿 + 800ms 防抖 / 失焦立即提交。
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const draftsRef = useRef({ baseUrl: '', model: '' });
  const saveTimerRef = useRef<number | null>(null);
  // Prompt 规则为逐字符输入：合并到同一 800ms 防抖窗口，避免每按键一次 store 写盘
  const promptTimerRef = useRef<number | null>(null);
  const pendingPromptsRef = useRef<AiCustomPrompts | null>(null);
  // AI 设置走独立后端通道；串行化提交，避免端点与 Prompt 两次保存互相覆盖旧快照
  const aiSaveChainRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => () => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    if (promptTimerRef.current != null) {
      window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
      // 离开设置页时冲刷尚未到期的 Prompt 防抖窗口，避免丢配置
      const pending = pendingPromptsRef.current;
      pendingPromptsRef.current = null;
      if (pending) {
        const current = settingsRef.current;
        void saveAiSettings({
          provider: current.provider,
          baseUrl: current.baseUrl,
          model: current.model,
          temperature: current.temperature,
          breakdownMode: current.breakdownMode,
          defaultBreakdownTags: current.defaultBreakdownTags,
          customPrompts: pending,
        }).catch(() => undefined);
      }
    }
  }, []);

  // 窗口失焦（切到其他 App）时立即冲刷端点/模型与 Prompt 的防抖窗口，避免关窗前丢改动
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void commitAiDrafts();
      }
      if (promptTimerRef.current != null) {
        window.clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
        void commitPrompts();
      }
    };
    window.addEventListener('blur', flush);
    return () => window.removeEventListener('blur', flush);
    // 两个提交函数只读取 refs 与稳定 setter，无需重绑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 清理 AI 字段错误；仅当主设置草稿不 dirty（且没有保存中的主草稿）才落定「已自动保存」 */
  const markAiSaved = () => {
    useSettingsDraft.setState((st) => {
      const fieldErrors = { ...st.fieldErrors };
      for (const key of Object.keys(fieldErrors)) {
        if (key.startsWith('ai-')) delete fieldErrors[key];
      }
      if (st.saving) return { fieldErrors };
      if (st.isDirty()) return { fieldErrors, autoSaveStatus: 'unsaved' as const };
      return { fieldErrors, autoSaveStatus: 'saved' as const, lastSavedAt: Date.now() };
    });
  };

  /** AI 保存失败：只进入「存在错误」态并给出行内提示，不再弹红色 Toast 打断输入 */
  const markAiError = (field: string, message: string) => {
    useSettingsDraft.setState((st) => ({
      autoSaveStatus: 'error',
      fieldErrors: { ...st.fieldErrors, [field]: message },
    }));
  };

  const clearSaveTimer = () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const clearPromptTimer = () => {
    if (promptTimerRef.current != null) {
      window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
  };

  /** 串行提交 AI 设置：后一次保存排队等待前一次完成，避免快照互相覆盖 */
  const persistAi = (next: AiSettingsView) => {
    const payload = {
      provider: next.provider,
      baseUrl: next.baseUrl,
      model: next.model,
      temperature: next.temperature,
      breakdownMode: next.breakdownMode,
      defaultBreakdownTags: next.defaultBreakdownTags,
      customPrompts: next.customPrompts,
    };
    const task = aiSaveChainRef.current
      .catch(() => undefined)
      .then(() => saveAiSettings(payload));
    aiSaveChainRef.current = task.catch(() => undefined);
    return task;
  };

  /** 提交 Prompt 规则草稿（800ms 防抖 / 失焦 / 离开页面） */
  const commitPrompts = async () => {
    clearPromptTimer();
    const pending = pendingPromptsRef.current;
    if (!pending) return;
    pendingPromptsRef.current = null;
    const current = settingsRef.current;
    const next = { ...current, customPrompts: pending };
    settingsRef.current = next;
    setSettings(next);
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'saving' as const }));
    try {
      await persistAi(next);
      markAiSaved();
    } catch (e) {
      // 保留待提交内容：用户继续编辑会在下一轮防抖重试
      pendingPromptsRef.current = pending;
      markAiError('ai-prompts', e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let active = true;
    void getAiSettings()
      .then((data) => {
        if (active) {
          setSettings(data);
          setBaseUrlDraft(data.baseUrl);
          setModelDraft(data.model);
          draftsRef.current = { baseUrl: data.baseUrl, model: data.model };
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /** 提交端点/模型草稿：成功静默更新状态；失败保留输入并标红，用户可继续修正 */
  const commitAiDrafts = async () => {
    clearSaveTimer();
    const { baseUrl, model } = draftsRef.current;
    const current = settingsRef.current;
    if (baseUrl === current.baseUrl && model === current.model) return;

    const next = { ...current, baseUrl, model };
    setSettings(next);
    settingsRef.current = next;
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'saving' as const }));
    try {
      await persistAi(next);
      setBaseUrlError(null);
      // 若保存期间用户又改了草稿，保持「未保存」并由下一轮防抖继续提交
      if (draftsRef.current.baseUrl === baseUrl && draftsRef.current.model === model) {
        markAiSaved();
      } else {
        useSettingsDraft.setState({ autoSaveStatus: 'unsaved' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setBaseUrlError(message);
      markAiError('ai-base-url', message);
    }
  };

  const scheduleAiDrafts = () => {
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'unsaved' as const }));
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void commitAiDrafts();
    }, 800);
  };

  const handleBaseUrlChange = (value: string) => {
    setBaseUrlDraft(value);
    draftsRef.current = { ...draftsRef.current, baseUrl: value };
    setBaseUrlError(null);
    scheduleAiDrafts();
  };

  const handleModelChange = (value: string) => {
    setModelDraft(value);
    draftsRef.current = { ...draftsRef.current, model: value };
    scheduleAiDrafts();
  };

  /** 失焦立即落盘（避免 800ms 窗口内离开页面丢改动） */
  const flushAiDrafts = () => {
    void commitAiDrafts();
  };

  const handleUpdate = async (patch: Partial<AiSettingsView>) => {
    const next = {
      ...settings,
      baseUrl: baseUrlDraft || settings.baseUrl,
      model: modelDraft || settings.model,
      customPrompts: pendingPromptsRef.current ?? settings.customPrompts,
      ...patch,
    };
    clearSaveTimer();
    setSettings(next);
    settingsRef.current = next;
    if (patch.baseUrl !== undefined) {
      setBaseUrlDraft(patch.baseUrl);
      draftsRef.current = { ...draftsRef.current, baseUrl: patch.baseUrl };
    }
    if (patch.model !== undefined) {
      setModelDraft(patch.model);
      draftsRef.current = { ...draftsRef.current, model: patch.model };
    }
    try {
      await persistAi(next);
      setBaseUrlError(null);
      markAiSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (patch.baseUrl !== undefined) setBaseUrlError(message);
      markAiError(patch.baseUrl !== undefined ? 'ai-base-url' : 'ai-settings', message);
    }
  };

  const handleProviderChange = (provider: AiProvider) => {
    const preset = PROVIDER_PRESETS[provider];
    // 切换预设时端点/模型来自预设，视为已完成输入，立即保存
    setBaseUrlError(null);
    void handleUpdate({
      provider,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
    });
    setTestResult(null);
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim() || savingKey) return;
    setSavingKey(true);
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'saving' as const }));
    try {
      await saveAiApiKey(apiKeyInput.trim());
      setSettings((prev) => ({ ...prev, hasApiKey: true }));
      setApiKeyInput('');
      setShowApiKey(false);
      toast.success('API Key 已安全保存至 Keychain');
      setTestResult(null);
      markAiSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      markAiError('ai-api-key', message);
      toast.danger('保存 API Key 失败', { description: message });
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteApiKey = async () => {
    setDeletingKey(true);
    try {
      await deleteAiApiKey();
      setSettings((prev) => ({ ...prev, hasApiKey: false }));
      toast.success('已清除保存在 Keychain 中的 API Key');
      setTestResult(null);
      markAiSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      markAiError('ai-api-key', message);
      toast.danger('清除 API Key 失败', { description: message });
    } finally {
      setDeletingKey(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection();
      setTestResult(res);
      if (res.ok) {
        toast.success(`连接成功 (${res.latencyMs}ms)`, {
          description: `模型响应正常: ${res.reply || 'OK'}`,
        });
      } else {
        toast.danger('连通性测试未通过', {
          description: '未能获得有效模型响应',
        });
      }
    } catch (e) {
      toast.danger('测试请求异常', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleUpdatePrompt = (key: keyof AiCustomPrompts, value: string) => {
    const nextPrompts: AiCustomPrompts = {
      ...(pendingPromptsRef.current ?? settingsRef.current.customPrompts),
      [key]: value.trim() ? value : undefined,
    };
    const next = { ...settingsRef.current, customPrompts: nextPrompts };
    // 输入立即乐观呈现；落盘走 800ms 防抖，避免每个按键都触发一次后端保存
    settingsRef.current = next;
    setSettings(next);
    pendingPromptsRef.current = nextPrompts;
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'unsaved' as const }));
    clearPromptTimer();
    promptTimerRef.current = window.setTimeout(() => {
      promptTimerRef.current = null;
      void commitPrompts();
    }, 800);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin mr-2" />
        <span className="text-sm">正在加载 AI 设置…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 模型连接与凭据 */}
      <SettingsGroup
        title="模型连接"
        description="配置大模型兼容接口（OpenAI Chat Completions 协议）与服务凭据，为需求拆解与 Git 交付助手提供推理能力；密钥只保存在本机 Keychain。"
        action={
          <div className="flex items-center gap-2">
            {testResult && (
              <Chip size="sm" variant="secondary" color="success" className="font-mono">
                <CheckIcon className="size-3 mr-1 inline" />
                {testResult.latencyMs}ms 连通正常
              </Chip>
            )}
            <Button
              size="sm"
              variant="secondary"
              isDisabled={testing || !settings.hasApiKey}
              onPress={() => void handleTestConnection()}
            >
              {testing ? (
                <>
                  <Loader2Icon className="size-3 animate-spin mr-1" />
                  测试中…
                </>
              ) : (
                <>
                  <ZapIcon className="size-3 mr-1 text-primary" />
                  测试连通性
                </>
              )}
            </Button>
          </div>
        }
      >
        {/* 服务商预设切换（HeroUI Tabs 分段控件：单选语义与指示器动画，替代原 Button 药丸组） */}
        <SettingsRow
          orientation="vertical"
          label="服务商预设"
          description={PROVIDER_PRESETS[settings.provider].hint}
          control={
            <Tabs
              aria-label="模型服务商预设"
              value={settings.provider}
              onValueChange={(v) => {
                if (v) handleProviderChange(v as AiProvider);
              }}
            >
              <TabsList size="sm" containerClassName="max-w-full overflow-x-auto">
                {(Object.keys(PROVIDER_PRESETS) as AiProvider[]).map((p) => (
                  <TabsTrigger key={p} value={p} className="text-xs">
                    {PROVIDER_PRESETS[p].name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />

        {/* Base URL */}
        <SettingsRow
          orientation="vertical"
          htmlFor="ai-base-url"
          label="API Base URL 端点"
          description="大模型服务的基础请求路径，系统将自动发起兼容 OpenAI 协议的 /chat/completions 调用（请勿重复附加 /chat/completions 或多填 /messages）。本地服务可用 http://localhost，其它地址需 HTTPS。"
          control={
            <div className="flex flex-col gap-1.5 w-full">
              <Input
                id="ai-base-url"
                value={baseUrlDraft}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                onBlur={flushAiDrafts}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    flushAiDrafts();
                  }
                }}
                aria-invalid={Boolean(baseUrlError)}
                aria-describedby={baseUrlError ? 'ai-base-url-error' : undefined}
                placeholder="https://..."
                className="font-mono"
              />
              {baseUrlError && (
                <p id="ai-base-url-error" className="text-[11px] leading-4 text-destructive">
                  {baseUrlError}
                </p>
              )}
              {baseUrlDraft.includes('/messages') && (
                <p className="text-[11px] text-warning/90">
                  检测到包含 /messages：nervd 遵循 OpenAI 协议标准，后台已自动转换为 /chat/completions。如果您的服务为 OpenAI 兼容接口，建议直接填写基准路径（如 https://.../v1）。
                </p>
              )}
              {baseUrlDraft.includes('.f6yc.com') && (
                <p className="text-[11px] text-muted-foreground">
                  企业内网服务提示：若访问公司内部网关，请确保在办公内网或开启 VPN（如 aTrust），避免被公网单点登录 (SSO / IDaaS) 拦截。
                </p>
              )}
            </div>
          }
        />

        {/* 模型名称 */}
        <SettingsRow
          orientation="vertical"
          htmlFor="ai-model"
          label="模型名称 (Model)"
          description="调用的模型标识，如通义千问 qwen-plus、qwen-turbo，DeepSeek 的 deepseek-chat 等。"
          control={
            <Input
              id="ai-model"
              value={modelDraft}
              onChange={(e) => handleModelChange(e.target.value)}
              onBlur={flushAiDrafts}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  flushAiDrafts();
                }
              }}
              placeholder="qwen-plus"
              className="font-mono"
            />
          }
        />
        <SettingsRow
          orientation="vertical"
          htmlFor="ai-api-key"
          label={
            <div className="flex items-center gap-2">
              <span>API Key</span>
              {settings.hasApiKey ? (
                <Chip size="sm" variant="secondary" color="success" className="font-normal">
                  <KeyRoundIcon className="size-3 mr-1 inline" />
                  已安全保存在 macOS Keychain
                </Chip>
              ) : (
                <Chip size="sm" variant="soft" className="font-normal text-muted-foreground">
                  未配置密钥
                </Chip>
              )}
            </div>
          }
          description="输入服务商提供的 API 密钥（如 sk-xxxx）。离开输入框即自动保存，保存后输入框自动清空，密钥受操作系统级保护。"
          control={
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="ai-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    setApiKeyInput(next);
                    if (next.trim()) {
                      useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'unsaved' as const }));
                    }
                  }}
                  onBlur={() => {
                    if (apiKeyInput.trim()) void handleSaveApiKey();
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSaveApiKey();
                    }
                  }}
                  placeholder={settings.hasApiKey ? '••••••••••••••••••••••••••••••••（已加密存储，输入可覆盖）' : '请输入 API Key，如 sk-...'}
                  className="pr-8 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  aria-pressed={showApiKey}
                  className="absolute right-0.5 top-0.5 text-muted-foreground hover:text-foreground"
                  onPress={() => setShowApiKey((v) => !v)}
                >
                  {showApiKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </Button>
              </div>

              {savingKey && <span className="text-xs text-muted-foreground">保存中…</span>}

              {settings.hasApiKey && (
                <ConfirmButton
                  label="清除"
                  title="清除已保存的 API Key？"
                  description="清除后该密钥将从 macOS Keychain 中永久删除且不可恢复；需要重新输入密钥才能继续使用 AI 功能。"
                  confirmLabel="清除密钥"
                  variant="ghost"
                  size="sm"
                  disabled={deletingKey}
                  onConfirm={handleDeleteApiKey}
                >
                  <Trash2Icon className="size-3.5" />
                  <span className="text-destructive">清除</span>
                </ConfirmButton>
              )}
            </div>
          }
        />
      </SettingsGroup>

      {/* 需求智能拆解偏好 */}
      <SettingsGroup
        title="需求智能拆解偏好"
        description="定制在需求详情中点击「AI 智能拆解」时的执行体验与默认分类维度。"
      >
        {/* 执行模式 */}
        <SettingsRow
          orientation="horizontal"
          label="拆解执行模式"
          description="选择生成子任务后的交互流程。"
          control={
            <Tabs
              aria-label="拆解执行模式"
              value={settings.breakdownMode}
              onValueChange={(v) => {
                if (v) void handleUpdate({ breakdownMode: v as AiBreakdownMode });
              }}
            >
              <TabsList size="sm">
                <TabsTrigger value="review" className="text-xs">
                  弹窗二次确认 (推荐)
                </TabsTrigger>
                <TabsTrigger value="direct" className="text-xs">
                  一键直达生成
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />

        {/* 模式说明条 */}
        <div className="border-t border-border/50 px-4 py-3 bg-surface-secondary text-xs text-muted-foreground leading-relaxed">
          {settings.breakdownMode === 'review' ? (
            <p>
              <strong>弹窗二次确认模式</strong>：点击 AI 拆解后调出复核弹窗，可在确认创建到云效前自由勾选、原地微调子任务标题、选择指派人。
            </p>
          ) : (
            <p>
              <strong>一键直达生成模式</strong>：点击 AI 拆解后无需弹窗确认，根据需求描述与关联仓库的改动范围极速生成并直接批量创建至云效。
            </p>
          )}
        </div>

      </SettingsGroup>

      {/* 场景提示词：默认收起，展开后编辑 */}
      <SettingsGroup
        title="场景提示词"
        description="为不同 AI 生成场景配置团队专属的工程规范、背景说明或提示词约束；默认收起，展开对应场景后编辑，变更自动保存。"
      >
        <Accordion hideSeparator>
          {PROMPT_FIELDS.map((field) => (
            <Accordion.Item key={field.key} id={field.key}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {field.label}
                  <Accordion.Indicator>
                    <ChevronDownIcon />
                  </Accordion.Indicator>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs leading-5 text-muted-foreground">{field.description}</p>
                    <Textarea
                      id={field.id}
                      value={settings.customPrompts?.[field.key] ?? ''}
                      onChange={(e) => handleUpdatePrompt(field.key, e.target.value)}
                      onBlur={() => void commitPrompts()}
                      placeholder={field.placeholder}
                      rows={3}
                    />
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </SettingsGroup>
    </div>
  );
}
