import { listActionNames } from './actions.js';
import type { Executor } from './executor.js';
import * as logger from './logger.js';
import { planNextAction } from './planner.js';
import type { AgentConfig, OpenRouterConfig } from './types.js';
import { validatePlan } from './validator.js';

/** 한 턴이 끝난 뒤 다음 턴까지 쉬는 시간. */
const LOOP_SLEEP_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface LoopOptions {
  agent: AgentConfig;
  openRouter: OpenRouterConfig;
  executor: Executor;
  /** 이번 턴에 Planner에게 보여줄 상황 설명. 내용 결정은 호출자의 책임이다. */
  buildSituation: () => string;
  /** 다음 턴을 시작할지 여부. 생략하면 무한히 반복한다. */
  shouldContinue?: () => boolean;
}

/**
 * Planner -> Validator -> Executor -> sleep을 반복하는 루프.
 * 상황을 어떻게 만들지, 언제 멈출지는 전부 호출자가 결정한다 — 이 함수는 그 결과를
 * 정해진 순서로 호출하기만 한다 (비즈니스 로직 없음). 한 턴에서 Planner 호출이
 * 실패해도(네트워크/인증 오류) 루프 전체를 죽이지 않고 그 턴만 건너뛴다.
 */
export async function runLoop(options: LoopOptions): Promise<void> {
  const availableActions = listActionNames();

  while (options.shouldContinue?.() ?? true) {
    try {
      const raw = await planNextAction({
        agent: options.agent,
        openRouter: options.openRouter,
        availableActions,
        situation: options.buildSituation(),
      });
      const plan = validatePlan(raw, options.agent.name);
      await options.executor.runStep(plan);
    } catch (err) {
      logger.error(`turn failed, skipping: ${err instanceof Error ? err.message : String(err)}`, options.agent.name);
    }
    await sleep(LOOP_SLEEP_MS);
  }
}
