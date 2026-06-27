import { getAction } from './actions.js';
import * as logger from './logger.js';
import type { HookClient } from './office.js';

/** Executor의 State Machine 상태. */
export type ExecutorState = 'idle' | 'planning' | 'working' | 'finishing';

/** Planner(Step 6) -> Validator(Step 7)를 거쳐 들어올 한 번의 실행 계획. */
export interface PlanStep {
  action: string;
  target: string;
  reason: string;
}

/** Registry에 'rest'가 없으면 폴백할 곳이 없으므로 즉시 실패시키는 게 맞다 (설정 오류). */
const FALLBACK_ACTION_NAME = 'rest';

/**
 * 한 에이전트 세션의 Hook 호출을 전담하는 State Machine.
 * Idle -> Planning -> Working -> Finishing -> Idle.
 * 이 클래스 밖에서는 어떤 코드도 HookClient의 메서드를 호출하지 않는다 (Step 5 규칙).
 */
export class Executor {
  private state: ExecutorState = 'idle';

  constructor(
    private readonly sessionId: string,
    private readonly agentName: string,
    private readonly hooks: HookClient,
  ) {}

  /** 현재 State Machine 상태를 반환한다. */
  getState(): ExecutorState {
    return this.state;
  }

  /** 세션을 시작해 캐릭터를 생성한다. 한 에이전트 생애주기에서 한 번만 호출한다. */
  async start(cwd: string, transcriptPath: string): Promise<void> {
    logger.hook('SessionStart 전송 - 캐릭터가 생성됩니다.', this.agentName);
    await this.hooks.sessionStart(this.sessionId, cwd, transcriptPath);
    this.state = 'idle';
  }

  /**
   * 한 plan step을 Idle -> Planning -> Working -> Finishing -> Idle 한 바퀴로 실행한다.
   * PreToolUse/PostToolUse/Stop 호출은 전부 이 메서드 안에서만 일어난다.
   */
  async runStep(step: PlanStep): Promise<void> {
    this.state = 'planning';
    const action = getAction(step.action) ?? getAction(FALLBACK_ACTION_NAME);
    if (!action) {
      throw new Error(`fallback action "${FALLBACK_ACTION_NAME}"이 actions.ts에 등록되어 있지 않습니다`);
    }

    this.state = 'working';
    logger.action(action.describe(step.target), this.agentName, action.emoji);
    if (action.toolName) {
      await this.hooks.preToolUse(this.sessionId, action.toolName, action.buildToolInput(step.target));
    }
    await action.perform({ target: step.target, reason: step.reason });
    if (action.toolName) {
      await this.hooks.postToolUse(this.sessionId);
    }

    this.state = 'finishing';
    logger.hook('Stop 전송 - 턴이 종료됩니다.', this.agentName);
    await this.hooks.stop(this.sessionId);

    this.state = 'idle';
  }
}
