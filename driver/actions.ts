/** 액션 1회 실행에 필요한 입력. Executor가 Planner/Validator 결과를 그대로 넘겨준다. */
export interface ActionParams {
  target: string;
  /** Planner가 이 행동을 선택한 이유 (로깅용, 동작에는 영향 없음). */
  reason: string;
}

/**
 * 액션 한 종류의 정의. Hook 호출은 절대 여기서 하지 않는다 — Executor가
 * toolName을 보고 PreToolUse/PostToolUse를 감싸서 호출한다 (Step 5 규칙).
 */
export interface ActionDefinition {
  /** PreToolUse/PostToolUse에 쓸 도구 이름. 도구를 쓰지 않는 액션(rest)은 undefined. */
  toolName?: string;
  /** 로그에 쓸 이모지 (logger.ts의 ACTION 카테고리에 그대로 전달됨). */
  emoji: string;
  /** PreToolUse의 tool_input으로 보낼 페이로드를 만든다. */
  buildToolInput(target: string): Record<string, unknown>;
  /** 사람이 읽을 한국어 행동 설명 (logger.ts 출력용). */
  describe(target: string): string;
  /** 실제(시뮬레이션) 작업 수행. */
  perform(params: ActionParams): Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 한 업무를 수행하는 데 걸리는(시뮬레이션) 시간. 말풍선이 떠 있는 시간이기도 하다. */
const WORK_DURATION_MS = 2500;

/**
 * 인부가 맡는 업무 한 종류를 정의한다. 모든 업무는 'WorkTask' 도구로 보고되며,
 * tool_input.label 이 Pixel Agents 말풍선에 그대로 표시된다. (서버 formatToolStatus의
 * WorkTask 케이스가 label을 상태 문자열로 사용한다.) WorkTask는 readingTools가 아니므로
 * 캐릭터는 '삽질' 애니메이션을 한다.
 */
function workTask(name: string, label: string, emoji: string): [string, ActionDefinition] {
  return [
    name,
    {
      toolName: 'WorkTask',
      emoji,
      buildToolInput: () => ({ label }),
      describe: () => `${label} 업무를 처리하는 중입니다.`,
      perform: async () => sleep(WORK_DURATION_MS),
    },
  ];
}

/**
 * rest: Validator 검증 실패 시 자동 폴백되는 행동. toolName이 없으므로
 * Executor는 PreToolUse/PostToolUse를 보내지 않는다 — 캐릭터는 쉬는 상태로 남는다.
 */
const restAction: ActionDefinition = {
  emoji: '💤',
  buildToolInput: () => ({}),
  describe: () => '잠시 쉬는 중입니다.',
  perform: async () => sleep(1500),
};

/** action 이름 -> 정의. Executor는 이 Registry만 참조한다 (switch 문 사용 금지). */
const registry = new Map<string, ActionDefinition>([
  workTask('번역', '번역', '🌐'),
  workTask('검수', '작업 검수', '🔍'),
  workTask('디자인', 'UI 디자인', '🎨'),
  workTask('문서', '문서 작성', '📝'),
  workTask('분석', '데이터 분석', '📊'),
  workTask('리뷰', '코드 리뷰', '👀'),
  ['rest', restAction],
]);

/** 등록된 액션 이름 목록. Validator가 action enum 검증에 그대로 재사용한다. */
export function listActionNames(): string[] {
  return [...registry.keys()];
}

/** 이름으로 액션 정의를 조회한다. 없으면 undefined (Executor가 'rest'로 폴백). */
export function getAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}
