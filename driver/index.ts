import * as crypto from 'node:crypto';

import { loadConfig } from './config.js';
import { Executor } from './executor.js';
import * as logger from './logger.js';
import { runLoop } from './loop.js';
import { HookClient } from './office.js';
import { createTranscriptSession } from './transcript.js';

/** 데모를 자동으로 끝내기 위한 턴 수 제한. 실제 사용 시에는 shouldContinue를 생략해 무한 반복한다. */
const DEMO_MAX_TURNS = 8;

/**
 * Driver 진입점.
 * Step 1~8: 설정/트랜스크립트/Hook/Executor/Planner/Validator/Loop는 각자 STEP 데모로 검증됨.
 * Step 9 (현재): logger.ts로 모든 console.* 호출을 한국어 색상 로그로 교체했다.
 *   동작은 Step 8과 동일하다 — 로그 출력 방식만 바뀌었다.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  logger.info('Pixel Agents OpenRouter Driver - Step 9 (logger wired everywhere)');

  if (!config.openRouter.apiKey) {
    logger.error('OPENROUTER_API_KEY가 없어 Step 9 데모를 건너뜁니다.');
    return;
  }

  const hooks = new HookClient(config.pixelAgents);

  await Promise.all(
    config.agents.map(async (agent) => {
      const sessionId = crypto.randomUUID();
      const session = createTranscriptSession(config.pixelAgents, sessionId);
      logger.info(`session created: ${session.transcriptPath}`, agent.name);

      const executor = new Executor(sessionId, agent.name, hooks);
      await executor.start(config.pixelAgents.workspaceCwd, session.transcriptPath);

      let turn = 0;
      await runLoop({
        agent,
        openRouter: config.openRouter,
        executor,
        buildSituation: () =>
          `지금은 바쁜 근무 시간이고 처리할 업무가 많습니다. (턴 ${turn}/${DEMO_MAX_TURNS}) ` +
          `맡은 업무 하나를 골라 처리하세요. 특별한 이유가 없는 한 rest는 피하세요.`,
        shouldContinue: () => {
          const canContinue = turn < DEMO_MAX_TURNS;
          if (canContinue) turn++;
          return canContinue;
        },
      });

      logger.info(`데모 종료 (${DEMO_MAX_TURNS}턴 완료)`, agent.name);
    }),
  );
}

main().catch((err) => {
  logger.error(`fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
