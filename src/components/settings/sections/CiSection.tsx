import { JenkinsInstancesCard, RepoCiBindingsCard } from '../CiIntegrationCards';

export function CiSection() {
  return (
    <div className="flex flex-col gap-6">
      <JenkinsInstancesCard />
      <RepoCiBindingsCard />
    </div>
  );
}
