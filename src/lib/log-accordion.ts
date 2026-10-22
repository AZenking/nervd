import type { CiStageItem } from './api';
import type { ProcessedLogLine } from './log-highlighter';

export interface LogAccordionSection {
  id: string;
  name: string;
  status: string;
  durationMillis?: number;
  lines: ProcessedLogLine[];
  errorCount: number;
  warningCount: number;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function inferStatus(lines: ProcessedLogLine[]): string {
  if (lines.some((line) => line.severity === 'error')) return 'FAILED';
  if (lines.some((line) => line.severity === 'success')) return 'SUCCESS';
  return 'UNKNOWN';
}

function isPipelineStageStart(line: ProcessedLogLine): boolean {
  return line.severity === 'stage' && /^\[Pipeline\]\s*stage\b/i.test(line.cleanText.trim());
}

function getSectionId(base: string, usedIds: Set<string>): string {
  const normalized = base || 'log-section';
  let id = normalized;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${normalized}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function createSection(
  stage: CiStageItem | undefined,
  fallbackName: string,
  lines: ProcessedLogLine[],
  usedIds: Set<string>,
): LogAccordionSection {
  const name = stage?.name || fallbackName;
  const id = getSectionId(stage?.id || `log-${normalizeName(name).replace(/[^a-z0-9]+/g, '-')}`, usedIds);
  return {
    id,
    name,
    status: stage?.status || inferStatus(lines),
    durationMillis: stage?.durationMillis,
    lines,
    errorCount: lines.filter((line) => line.severity === 'error').length,
    warningCount: lines.filter((line) => line.severity === 'warning').length,
  };
}

function finalizeDraft(
  draft: { stage?: CiStageItem; name: string; lines: ProcessedLogLine[] },
  usedIds: Set<string>,
): LogAccordionSection {
  return createSection(draft.stage, draft.name, draft.lines, usedIds);
}

function findStage(stages: CiStageItem[], name: string): CiStageItem | undefined {
  const normalized = normalizeName(name);
  return stages.find((stage) => normalizeName(stage.name) === normalized);
}

function appendPreamble(
  sections: LogAccordionSection[],
  lines: ProcessedLogLine[],
  usedIds: Set<string>,
): void {
  if (lines.length > 0) {
    sections.unshift(createSection(undefined, '准备日志', lines, usedIds));
  }
}

/**
 * 根据 Jenkins Pipeline 标记或阶段元数据把控制台日志分成单开手风琴区块。
 * 没有可识别阶段边界时保留一个“完整日志”区块，避免把日志错误分配到阶段。
 */
export function buildLogAccordionSections(
  lines: ProcessedLogLine[],
  stages: CiStageItem[],
): LogAccordionSection[] {
  if (lines.length === 0) {
    return stages.map((stage, index) =>
      createSection(stage, stage.name || `阶段 ${index + 1}`, [], new Set<string>()),
    );
  }

  const hasNamedMarkers = lines.some((line) => line.severity === 'stage' && Boolean(line.stageName));
  const hasUnnamedPipelineMarkers = !hasNamedMarkers && lines.some(isPipelineStageStart);

  if (!hasNamedMarkers && !hasUnnamedPipelineMarkers) {
    return [createSection(undefined, '完整日志', lines, new Set<string>())];
  }

  const sections: LogAccordionSection[] = [];
  const usedIds = new Set<string>();
  const usedStageIds = new Set<string>();
  const preamble: ProcessedLogLine[] = [];
  let current: { stage?: CiStageItem; name: string; lines: ProcessedLogLine[] } | null = null;
  let unnamedStageIndex = -1;

  const finishCurrent = () => {
    if (!current || current.lines.length === 0) return;
    sections.push(finalizeDraft(current, usedIds));
    if (current.stage?.id) usedStageIds.add(current.stage.id);
    current = null;
  };

  for (const line of lines) {
    if (hasNamedMarkers && line.severity === 'stage' && line.stageName) {
      const stage = findStage(stages, line.stageName);
      const nextName = stage?.name || line.stageName;
      if (!current || normalizeName(current.name) !== normalizeName(nextName)) {
        finishCurrent();
        current = { stage, name: nextName, lines: [] };
      }
    } else if (!hasNamedMarkers && isPipelineStageStart(line)) {
      finishCurrent();
      unnamedStageIndex += 1;
      const stage = stages[unnamedStageIndex];
      current = {
        stage,
        name: stage?.name || `阶段 ${unnamedStageIndex + 1}`,
        lines: [],
      };
    }

    if (current) current.lines.push(line);
    else preamble.push(line);
  }

  finishCurrent();
  appendPreamble(sections, preamble, usedIds);

  // 阶段接口可能先返回了尚未输出日志的阶段，保留这些阶段的状态摘要。
  for (const stage of stages) {
    if (!usedStageIds.has(stage.id) && !sections.some((section) => normalizeName(section.name) === normalizeName(stage.name))) {
      sections.push(createSection(stage, stage.name, [], usedIds));
    }
  }

  return sections;
}
