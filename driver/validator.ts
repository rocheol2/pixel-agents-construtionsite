import { listActionNames } from './actions.js';
import type { PlanStep } from './executor.js';
import * as logger from './logger.js';
import type { RawPlanResponse } from './planner.js';

/** Validator를 통과(또는 폴백)한 후 Executor에 바로 먹일 수 있는 plan. */
export interface ValidatedPlan extends PlanStep {
  confidence: number;
  /** 원본 검증에 실패해 'rest'로 자동 폴백됐는지 여부 (로깅/통계용). */
  fallback: boolean;
}

const FALLBACK_ACTION_NAME = 'rest';
const FALLBACK_REASON = 'Planner 출력 검증 실패로 자동 폴백';

function isConfidenceInRange(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** 검증 실패 시 보낼 고정 rest plan. */
function fallbackPlan(): ValidatedPlan {
  return { action: FALLBACK_ACTION_NAME, target: '', reason: FALLBACK_REASON, confidence: 0, fallback: true };
}

/**
 * Planner의 원본 JSON(RawPlanResponse)을 검증해 Executor가 신뢰할 수 있는
 * PlanStep으로 바꾼다. action/target/reason/confidence 중 하나라도 검증에
 * 실패하면 예외를 던지지 않고 즉시 'rest'로 폴백한다.
 */
export function validatePlan(raw: RawPlanResponse, agentName?: string): ValidatedPlan {
  const validActions = new Set(listActionNames());
  const errors: string[] = [];

  const { action, target, reason, confidence } = raw;

  if (typeof action !== 'string' || !validActions.has(action)) {
    errors.push(`action 값이 유효하지 않음: ${JSON.stringify(action)} (허용: ${[...validActions].join(', ')})`);
  }
  if (typeof target !== 'string') {
    errors.push(`target이 문자열이 아님: ${JSON.stringify(target)}`);
  }
  if (typeof reason !== 'string') {
    errors.push(`reason이 문자열이 아님: ${JSON.stringify(reason)}`);
  }
  if (!isConfidenceInRange(confidence)) {
    errors.push(`confidence가 0~1 범위의 숫자가 아님: ${JSON.stringify(confidence)}`);
  }

  if (errors.length > 0) {
    logger.error(`plan 검증 실패, rest로 폴백 -> ${errors.join(' | ')}`, agentName);
    return fallbackPlan();
  }

  return {
    action: action as string,
    target: target as string,
    reason: reason as string,
    confidence: confidence as number,
    fallback: false,
  };
}
