import type { WorkitemStatusChartProps } from './workitem-status-chart';
import { WorkitemStatusChart } from './workitem-status-chart';

export type HealthDistributionProps = Omit<WorkitemStatusChartProps, 'complete'> & {
  /** 旧调用方默认按完整列表展示；纵览页会显式传入真实分页状态。 */
  complete?: boolean;
};

export function HealthDistributionCard({ complete = true, ...props }: HealthDistributionProps) {
  return <WorkitemStatusChart {...props} complete={complete} />;
}

export { WorkitemStatusChart } from './workitem-status-chart';
