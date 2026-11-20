import type {
  Artifact,
  CrewRole,
  DecisionPoint,
  DelightItem,
  Project,
  ProviderId,
  Spec,
  Tag,
} from '../types';
import { complete, type ApiEventType } from './client';
import {
  builderSystemPrompt,
  builderUserPrompt,
  delightSystemPrompt,
  delightUserPrompt,
  normalizeDelight,
  parseJsonLoose,
  productSystemPrompt,
  productUserPrompt,
  reviewSystemPrompt,
  reviewUserPrompt,
  stripCodeFences,
} from './prompts';
import { failureSummary, inspectArtifact } from './reviewer';
import { demoDelight, demoSpec, shortTitle } from '../demo/content';
import { buildDemoHtml } from '../demo/html';

export interface CrewDeps {
  demo: boolean;
  onEvent: (type: ApiEventType | 'provider', message: string) => void;
  builderFamily?: string;
}

function asString(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().slice(0, max);
}

function asStringArray(value: unknown, fallback: string[], max = 6): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 80))
    .slice(0, max);
  return items.length ? items : fallback;
}

function normalizeDecisions(raw: unknown, fallback: DecisionPoint[]): DecisionPoint[] {
  if (!Array.isArray(raw)) return fallback;
  const seeds = raw.slice(0, 3);
  const normalized: DecisionPoint[] = [];
  seeds.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const entry = item as Record<string, unknown>;
    const a = (entry.optionA ?? {}) as Record<string, unknown>;
    const b = (entry.optionB ?? {}) as Record<string, unknown>;
    const fallbackDecision = fallback[index] ?? fallback[0];
    normalized.push({
      id: `d${index + 1}`,
      index: index + 1,
      marker: String.fromCharCode(65 + index),
      title: asString(entry.title, fallbackDecision.title, 80),
      context: asString(entry.context, fallbackDecision.context, 80),
      optionA: {
        key: 'A',
        label: asString(a.label, fallbackDecision.optionA.label, 24),
        body: asString(a.body, fallbackDecision.optionA.body, 80),
        tradeoff: asString(a.tradeoff, fallbackDecision.optionA.tradeoff, 40),
      },
      optionB: {
        key: 'B',
        label: asString(b.label, fallbackDecision.optionB.label, 24),
        body: asString(b.body, fallbackDecision.optionB.body, 80),
        tradeoff: asString(b.tradeoff, fallbackDecision.optionB.tradeoff, 40),
      },
      status: 'OPEN',
      attempts: 0,
    });
  });
  if (normalized.length >= 2) return normalized.slice(0, 3);
  return fallback;
}

export async function runProduct(
  prompt: string,
  tag: Tag,
  deps: CrewDeps,
): Promise<{ spec: Spec; provider?: ProviderId }> {
  const fallback = demoSpec(prompt, tag);
  if (deps.demo) return { spec: fallback };

  try {
    const result = await complete({
      role: 'PRODUCT',
      system: productSystemPrompt(),
      user: productUserPrompt(prompt, tag),
      json: true,
      temperature: 0.4,
      maxTokens: 1500,
      onEvent: deps.onEvent,
    });
    const raw = parseJsonLoose<Record<string, unknown>>(result.text);
    const spec: Spec = {
      summary: asString(raw.summary, fallback.summary, 80),
      goal: asString(raw.goal, fallback.goal, 60),
      inScope: asStringArray(raw.inScope, fallback.inScope, 5),
      outOfScope: asStringArray(raw.outOfScope, fallback.outOfScope, 4),
      acceptance: (() => {
        const list = asStringArray(raw.acceptance, fallback.acceptance, 4);
        const merged = [...list];
        while (merged.length < 4) merged.push(fallback.acceptance[merged.length]);
        return merged.slice(0, 4);
      })(),
      implicitPreference: asString(raw.implicitPreference, fallback.implicitPreference, 80),
      decisions: normalizeDecisions(raw.decisions, fallback.decisions),
    };
    return { spec, provider: result.provider };
  } catch {
    return { spec: fallback };
  }
}

export async function runBuilder(
  project: Project,
  deps: CrewDeps,
  options: {
    round: number;
    includeMissing?: boolean;
    reworkOrder?: string;
    previous?: Artifact;
  },
): Promise<{ artifact: Artifact; provider?: ProviderId; family?: string }> {
  const spec = project.spec!;
  if (deps.demo) {
    return {
      artifact: buildDemoHtml({
        prompt: project.prompt,
        tag: project.tag,
        title: project.title,
        spec,
        decisions: project.decisions,
        round: options.round,
        version: options.round,
        includeMissing: Boolean(options.includeMissing),
        reworkOrder: options.reworkOrder,
      }),
    };
  }

  const result = await complete({
    role: 'BUILDER',
    system: builderSystemPrompt(),
    user: builderUserPrompt({
      prompt: project.prompt,
      tag: project.tag,
      spec,
      decisions: project.decisions,
      previous: options.previous,
      reworkOrder: options.reworkOrder,
      round: options.round,
    }),
    temperature: 0.7,
    maxTokens: 4096,
    builderFamily: deps.builderFamily,
    onEvent: deps.onEvent,
  });

  const html = stripCodeFences(result.text);
  return {
    artifact: {
      round: options.round,
      version: options.round,
      title: project.title || shortTitle(project.prompt),
      html,
      features: spec.acceptance.slice(0, 4),
      pathNote: project.decisions
        .filter((d) => d.chosen)
        .map((d) => `${d.chosen}·${(d.chosen === 'A' ? d.optionA : d.optionB).label}`)
        .join(' / '),
      createdAt: Date.now(),
    },
    provider: result.provider,
    family: result.family,
  };
}

export async function runInspection(
  project: Project,
  artifact: Artifact,
): Promise<{ passed: boolean; report: ReturnType<typeof inspectArtifact> }> {
  const report = inspectArtifact(artifact.html, project.spec!, project.prompt, artifact.round);
  return { passed: report.passed, report };
}

export async function runReviewNarrative(
  project: Project,
  report: ReturnType<typeof inspectArtifact>,
  deps: CrewDeps,
): Promise<string> {
  if (deps.demo) return failureSummary(report);
  try {
    const result = await complete({
      role: 'REVIEWER',
      system: reviewSystemPrompt(),
      user: reviewUserPrompt({ spec: project.spec!, findings: report.findings, round: report.round }),
      temperature: 0.2,
      maxTokens: 160,
      onEvent: deps.onEvent,
    });
    return result.text.trim().slice(0, 90) || failureSummary(report);
  } catch {
    return failureSummary(report);
  }
}

export async function runDelight(
  project: Project,
  artifact: Artifact,
  deps: CrewDeps,
): Promise<DelightItem[]> {
  if (deps.demo) return demoDelight(project.prompt, project.spec!, artifact);
  try {
    const result = await complete({
      role: 'PLEASER',
      system: delightSystemPrompt(),
      user: delightUserPrompt({
        prompt: project.prompt,
        spec: project.spec!,
        artifact,
      }),
      json: true,
      temperature: 0.5,
      maxTokens: 900,
      onEvent: deps.onEvent,
    });
    const raw = parseJsonLoose<{ items?: DelightItem[] }>(result.text);
    if (!raw.items?.length) throw new Error('empty delight');
    return normalizeDelight(raw.items);
  } catch {
    return demoDelight(project.prompt, project.spec!, artifact);
  }
}

export function roleRouteLabel(role: CrewRole): string {
  switch (role) {
    case 'PRODUCT':
      return '产品工种';
    case 'BUILDER':
      return '开发工种';
    case 'REVIEWER':
      return '审查工种';
    case 'ORCHESTRATOR':
      return '调度工种';
    default:
      return '施工队';
  }
}
