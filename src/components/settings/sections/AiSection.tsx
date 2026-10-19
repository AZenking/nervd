import { useEffect, useState } from 'react';
import {
  CheckIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon,
  Trash2Icon, ZapIcon,
} from 'lucide-react';
import {
  deleteAiApiKey, getAiSettings, saveAiApiKey, saveAiSettings, testAiConnection,
} from '@/lib/ai-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { AiCustomPrompts, AiProvider, AiSettingsView, AiTestConnectionResult } from '@/types/ai';
import { SettingsGroup, SettingsRow } from '../settings-group';

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

const AVAILABLE_TAGS = ['前端', '后端', '自测', '文档', '运维'];

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

  useEffect(() => {
    let active = true;
    void getAiSettings()
      .then((data) => {
        if (active) {
          setSettings(data);
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

  const handleUpdate = async (patch: Partial<AiSettingsView>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await saveAiSettings({
        provider: next.provider,
        baseUrl: next.baseUrl,
        model: next.model,
        temperature: next.temperature,
        breakdownMode: next.breakdownMode,
        defaultBreakdownTags: next.defaultBreakdownTags,
        customPrompts: next.customPrompts,
      });
    } catch {
      toast.add({ title: '保存 AI 设置失败', type: 'error' });
    }
  };

  const handleProviderChange = (provider: AiProvider) => {
    const preset = PROVIDER_PRESETS[provider];
    void handleUpdate({
      provider,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
    });
  };

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    setSavingKey(true);
    try {
      await saveAiApiKey(trimmed);
      setSettings((prev) => ({ ...prev, hasApiKey: true }));
      setApiKeyInput('');
      toast.add({
        title: 'API 密钥已安全存入 macOS Keychain',
        type: 'success',
      });
    } catch (err) {
      toast.add({
        title: '保存 API 密钥失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteApiKey = async () => {
    setDeletingKey(true);
    try {
      await deleteAiApiKey();
      setSettings((prev) => ({ ...prev, hasApiKey: false }));
      toast.add({
        title: '已从 Keychain 清除 API 密钥',
        type: 'info',
      });
    } catch (err) {
      toast.add({
        title: '删除 API 密钥失败',
        description: String(err),
        type: 'error',
      });
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
      toast.add({
        title: '连接成功',
        description: `延迟 ${res.latencyMs}ms · 响应: ${res.reply.slice(0, 30)}`,
        type: 'success',
      });
    } catch (err) {
      const msg = String(err);
      toast.add({
        title: '连接失败',
        description: msg,
        type: 'error',
      });
    } finally {
      setTesting(false);
    }
  };

  const toggleTag = (tag: string) => {
    const exists = settings.defaultBreakdownTags.includes(tag);
    const nextTags = exists
      ? settings.defaultBreakdownTags.filter((t) => t !== tag)
      : [...settings.defaultBreakdownTags, tag];
    if (nextTags.length === 0) return; // 至少保留一个 tag
    void handleUpdate({ defaultBreakdownTags: nextTags });
  };

  const handleUpdatePrompt = (key: keyof AiCustomPrompts, value: string) => {
    const updated: AiCustomPrompts = {
      ...(settings.customPrompts || {}),
      [key]: value,
    };
    void handleUpdate({ customPrompts: updated });
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
      {/* 服务商与模型设置 */}
      <SettingsGroup
        title="模型服务商与端点"
        description="配置大模型兼容接口（OpenAI Chat Completions 协议），为需求拆解与 Git 交付助手提供大模型推理能力。"
        action={
          <div className="flex items-center gap-2">
            {testResult && (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                <CheckIcon className="size-3 mr-1 inline" />
                {testResult.latencyMs}ms 连通正常
              </Badge>
            )}
            <Button
              size="xs"
              variant="outline"
              disabled={testing || !settings.hasApiKey}
              onClick={() => void handleTestConnection()}
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
        {/* 服务商预设切换 */}
        <SettingsRow
          orientation="vertical"
          label="服务商预设"
          description={PROVIDER_PRESETS[settings.provider].hint}
          control={
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {(Object.keys(PROVIDER_PRESETS) as AiProvider[]).map((p) => {
                const isSelected = settings.provider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProviderChange(p)}
                    className={cn(
                      'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                    )}
                  >
                    {PROVIDER_PRESETS[p].name}
                  </button>
                );
              })}
            </div>
          }
        />

        {/* Base URL */}
        <SettingsRow
          orientation="vertical"
          label="API Base URL 端点"
          description="大模型服务的基础请求路径，系统将自动发起兼容 OpenAI 协议的 /chat/completions 调用（请勿重复附加 /chat/completions 或多填 /messages）。"
          control={
            <div className="flex flex-col gap-1.5 w-full">
              <Input
                value={settings.baseUrl}
                onChange={(e) => void handleUpdate({ baseUrl: e.target.value })}
                placeholder="https://..."
                className="h-8 font-mono text-xs bg-background"
              />
              {settings.baseUrl.includes('/messages') && (
                <p className="text-[11px] text-amber-500/90 dark:text-amber-400/90">
                  检测到包含 /messages：nervd 遵循 OpenAI 协议标准，后台已自动转换为 /chat/completions。如果您的服务为 OpenAI 兼容接口，建议直接填写基准路径（如 https://.../v1）。
                </p>
              )}
              {settings.baseUrl.includes('.f6yc.com') && (
                <p className="text-[11px] text-muted-foreground/80">
                  企业内网服务提示：若访问公司内部网关，请确保在办公内网或开启 VPN（如 aTrust），避免被公网单点登录 (SSO / IDaaS) 拦截。
                </p>
              )}
            </div>
          }
        />

        {/* 模型名称 */}
        <SettingsRow
          orientation="vertical"
          label="模型名称 (Model)"
          description="调用的模型标识，如通义千问 qwen-plus、qwen-turbo，DeepSeek 的 deepseek-chat 等。"
          control={
            <Input
              value={settings.model}
              onChange={(e) => void handleUpdate({ model: e.target.value })}
              placeholder="qwen-plus"
              className="h-8 font-mono text-xs bg-background"
            />
          }
        />
      </SettingsGroup>

      {/* API Key 安全管理 */}
      <SettingsGroup
        title="API 凭据安全存储"
        description="密钥加密保存在 macOS 系统的 Keychain 中，nervd 核心仅在发起请求时在内存中读取，绝不以明文落盘。"
      >
        <SettingsRow
          orientation="vertical"
          label={
            <div className="flex items-center gap-2">
              <span>API Key</span>
              {settings.hasApiKey ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-normal">
                  <KeyRoundIcon className="size-3 mr-1 inline" />
                  已安全保存在 macOS Keychain
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[11px] font-normal text-muted-foreground">
                  未配置密钥
                </Badge>
              )}
            </div>
          }
          description="输入服务商提供的 API 密钥（如 sk-xxxx）。保存后输入框将自动清空，密钥受操作系统级保护。"
          control={
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={settings.hasApiKey ? '••••••••••••••••••••••••••••••••（已加密存储，输入可覆盖）' : '请输入 API Key，如 sk-...'}
                  className="h-8 pr-8 font-mono text-xs bg-background"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </button>
              </div>

              <Button
                size="xs"
                disabled={savingKey || !apiKeyInput.trim()}
                onClick={() => void handleSaveApiKey()}
              >
                {savingKey ? '保存中…' : '保存至 Keychain'}
              </Button>

              {settings.hasApiKey && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={deletingKey}
                  onClick={() => void handleDeleteApiKey()}
                  title="清除保存在 Keychain 中的 API Key"
                >
                  <Trash2Icon className="size-3.5 mr-1" />
                  清除
                </Button>
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
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => void handleUpdate({ breakdownMode: 'review' })}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  settings.breakdownMode === 'review'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                弹窗二次确认 (推荐)
              </button>
              <button
                type="button"
                onClick={() => void handleUpdate({ breakdownMode: 'direct' })}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  settings.breakdownMode === 'direct'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                一键直达生成
              </button>
            </div>
          }
        />

        {/* 模式说明条 */}
        <div className="border-t border-border/50 px-4 py-3 bg-muted/15 text-xs text-muted-foreground leading-relaxed">
          {settings.breakdownMode === 'review' ? (
            <p>
              <strong>弹窗二次确认模式</strong>：点击 AI 拆解后调出复核弹窗，可在确认创建到云效前自由勾选、原地微调子任务标题、选择指派人。
            </p>
          ) : (
            <p>
              <strong>一键直达生成模式</strong>：点击 AI 拆解后无需弹窗确认，在后台根据需求描述与默认标签极速生成并直接批量创建至云效。
            </p>
          )}
        </div>

        {/* 默认拆解维度标签 */}
        <SettingsRow
          orientation="vertical"
          label="默认拆解维度标签 (Tags)"
          description="AI 拆解时将定向产出被选中的工程维度任务条目（至少保留一项）。"
          control={
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {AVAILABLE_TAGS.map((tag) => {
                const active = settings.defaultBreakdownTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'cursor-pointer rounded-md px-2.5 py-1 font-mono text-xs transition-colors border',
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary font-semibold shadow-xs'
                        : 'border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground',
                    )}
                  >
                    {active ? <CheckIcon className="size-3 mr-1 inline" /> : null}
                    {tag}
                  </button>
                );
              })}
            </div>
          }
        />
      </SettingsGroup>

      {/* 场景上下文与提示词定制 */}
      <SettingsGroup
        title="场景上下文与 Prompt 规则定制"
        description="为不同 AI 生成场景配置团队专属的工程规范、背景说明或提示词约束，大模型推理时将自动附加生效。"
      >
        {/* 子任务拆解规则 */}
        <SettingsRow
          orientation="vertical"
          label="子任务拆解工程规范 (Breakdown Rules)"
          description="定义拆解子任务时的团队约束。例如：必须包含自测任务、后端需注明 RPC 接口、标题动宾结构等。"
          control={
            <Textarea
              value={settings.customPrompts?.breakdown ?? ''}
              onChange={(e) => handleUpdatePrompt('breakdown', e.target.value)}
              placeholder="例如：每个需求必须包含一个自测任务；后端任务注明涉及的 RPC 接口；标题严格在 25 字以内。"
              className="min-h-16 font-sans text-xs bg-background"
            />
          }
        />

        {/* 讨论纪要提炼规则 */}
        <SettingsRow
          orientation="vertical"
          label="评论讨论纪要规则 (Discussion Summary)"
          description="提炼需求讨论历史时的侧重偏好。例如：重点关注交付时间变更、明确阻塞项责任人等。"
          control={
            <Textarea
              value={settings.customPrompts?.commentSummary ?? ''}
              onChange={(e) => handleUpdatePrompt('commentSummary', e.target.value)}
              placeholder="例如：关注技术方案共识与对上线排期的影响，必须明确标出每个阻塞项的责任人。"
              className="min-h-16 font-sans text-xs bg-background"
            />
          }
        />

        {/* 评论与进度汇报模板 */}
        <SettingsRow
          orientation="vertical"
          label="评论与提测/进度生成偏好 (Comment Generation)"
          description="定制自动生成研发进度同步、提测交付说明或评论润色时的语言风格与标准段落格式。"
          control={
            <Textarea
              value={settings.customPrompts?.commentDraft ?? ''}
              onChange={(e) => handleUpdatePrompt('commentDraft', e.target.value)}
              placeholder="例如：提测说明必须包含部署环境和测试账号说明；研发进度汇报按「已完成、进行中、风险项」排版。"
              className="min-h-16 font-sans text-xs bg-background"
            />
          }
        />

        {/* 关联仓库推荐规则 */}
        <SettingsRow
          orientation="vertical"
          label="代码仓库架构背景说明 (Repo Recommendation Rules)"
          description="向 AI 提供团队组织的代码仓库命名习惯与业务域归属，帮助 AI 更精准推荐需求应关联的仓库。"
          control={
            <Textarea
              value={settings.customPrompts?.repoRecommendation ?? ''}
              onChange={(e) => handleUpdatePrompt('repoRecommendation', e.target.value)}
              placeholder="例如：trade-* 为交易履约核心服务，fed-* 为前端应用，crm-* 为客户中心，common-* 为公共底层库。"
              className="min-h-16 font-sans text-xs bg-background"
            />
          }
        />

        {/* Merge Request 规范 */}
        <SettingsRow
          orientation="vertical"
          label="Merge Request 描述规范 (MR Rules)"
          description="生成 MR 标题与描述时的规范要求。例如：强制遵循 Conventional Commits、包含自测验证清单等。"
          control={
            <Textarea
              value={settings.customPrompts?.mergeRequest ?? ''}
              onChange={(e) => handleUpdatePrompt('mergeRequest', e.target.value)}
              placeholder="例如：标题强制遵循 Conventional Commits 规范；描述必须包含自测用例清单与回归检查点；跳过 WIP 提交。"
              className="min-h-16 font-sans text-xs bg-background"
            />
          }
        />
      </SettingsGroup>
    </div>
  );
}
