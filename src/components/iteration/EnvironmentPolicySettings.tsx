import { SettingsView } from '../SettingsView';

/**
 * 兼容旧调用方：设置已统一到 SettingsView，旧入口不再维护第二套 CI 表单。
 */
export function EnvironmentPolicySettings() {
  return <SettingsView embedded />;
}
