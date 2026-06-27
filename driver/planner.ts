import * as logger from './logger.js';
import { chatCompletion } from './openrouter.js';
import type { AgentConfig, OpenRouterConfig } from './types.js';

/**
 * Planner가 모델로부터 받은 원본 JSON. 필드 타입을 아직 검증하지 않은 상태 그대로다 —
 * 실제 검증(enum/문자열/범위)은 Validator(Step 7)의 책임이다.
 */
export interface RawPlanResponse {
  action?: unknown;
  target?: unknown;
  reason?: unknown;
  confidence?: unknown;
}

export interface PlannerInput {
  agent: AgentConfig;
  openRouter: OpenRouterConfig;
  /** 에이전트가 고를 수 있는 행동 이름 목록 (actions.ts Registry에서 가져옴). */
  availableActions: string[];
  /** 지금 상황 설명 (Step 8의 Loop가 매 턴 채워준다). */
  situation: string;
}

function buildSystemPrompt(agent: AgentConfig, availableActions: string[]): string {
  return [
    agent.systemPrompt,
    '',
    '아래 규칙을 반드시 지켜 응답하세요:',
    '- 다른 설명이나 마크다운 코드블록 없이, JSON 객체 하나만 출력합니다.',
    `- "action" 필드는 반드시 다음 중 하나입니다: ${availableActions.join(', ')}`,
    '- "target" 필드는 문자열입니다 (예: 파일 경로, 실행할 명령어). 해당 없으면 빈 문자열.',
    '- "reason" 필드는 이 행동을 선택한 이유를 한국어 한 문장으로 설명합니다.',
    '- "confidence" 필드는 0.0에서 1.0 사이의 숫자입니다.',
    '',
    '응답 형식 예시: {"action":"번역","target":"외국어 민원","reason":"오늘 들어온 외국어 민원을 처리해야 함","confidence":0.8}',
  ].join('\n');
}

/** 마크다운 코드블록(```json ... ```)으로 감싸진 경우까지 포함해 JSON을 최대한 복구한다. */
function extractJson(content: string, agentName: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        /* 아래에서 빈 객체로 폴백 */
      }
    }
    logger.error(`모델 응답에서 JSON을 파싱하지 못했습니다: ${trimmed.slice(0, 200)}`, agentName);
    return {};
  }
}

/**
 * 다음 행동을 OpenRouter 모델에게 물어보고 원본 JSON을 반환한다.
 * 이 함수는 절대 throw하지 않는다 (JSON 파싱 실패 시 빈 객체) — 단, OpenRouter 호출 자체의
 * 네트워크/인증 오류는 그대로 전파한다 (Step 8의 Loop가 한 턴을 건너뛰는 방식으로 처리).
 */
export async function planNextAction(input: PlannerInput): Promise<RawPlanResponse> {
  logger.llm('다음 행동을 고민하는 중입니다...', input.agent.name);
  const content = await chatCompletion({
    model: input.agent.model,
    apiKey: input.agent.apiKey || input.openRouter.apiKey,
    baseUrl: input.openRouter.baseUrl,
    messages: [
      { role: 'system', content: buildSystemPrompt(input.agent, input.availableActions) },
      { role: 'user', content: input.situation },
    ],
  });

  return extractJson(content, input.agent.name) as RawPlanResponse;
}
