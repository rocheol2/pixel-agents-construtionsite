/** 로그 카테고리. 색상과 ERROR 전용 stderr 출력을 결정한다. */
export type LogCategory = 'INFO' | 'ACTION' | 'HOOK' | 'LLM' | 'ERROR';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const CATEGORY_COLOR: Record<LogCategory, string> = {
  INFO: '\x1b[36m', // cyan
  ACTION: '\x1b[32m', // green
  HOOK: '\x1b[35m', // magenta
  LLM: '\x1b[33m', // yellow
  ERROR: '\x1b[31m', // red
};

const DEFAULT_EMOJI: Record<LogCategory, string> = {
  INFO: 'ℹ️',
  ACTION: '🔧',
  HOOK: '🪝',
  LLM: '🧠',
  ERROR: '🚨',
};

/**
 * 로그를 출력한다. agentName이 있으면 두 줄(이름 줄 + 이모지/메시지 줄)로,
 * 없으면 한 줄로 출력한다. 예:
 *   log('ACTION', 'config.ts 파일을 읽는 중입니다.', { agentName: '김대리', emoji: '📖' })
 *   -> [김대리]
 *      📖 config.ts 파일을 읽는 중입니다.
 * 터미널이 ANSI 색을 지원하지 않으면(파일 리다이렉트 등) 코드는 무시되고 텍스트만 보인다.
 */
export function log(
  category: LogCategory,
  message: string,
  options: { agentName?: string; emoji?: string } = {},
): void {
  const color = CATEGORY_COLOR[category];
  const emoji = options.emoji ?? DEFAULT_EMOJI[category];
  const writer = category === 'ERROR' ? console.error : console.log;

  if (options.agentName) {
    writer(`${color}${BOLD}[${options.agentName}]${RESET}`);
    writer(`${color}${emoji} ${message}${RESET}`);
  } else {
    writer(`${color}${emoji} [${category}] ${message}${RESET}`);
  }
}

/** 일반 정보성 로그 (드라이버 부팅, 세션 생성 등). */
export const info = (message: string, agentName?: string): void => log('INFO', message, { agentName });

/** 에이전트가 수행 중인 행동 서술. emoji는 actions.ts의 액션별 이모지를 그대로 넘긴다. */
export const action = (message: string, agentName: string, emoji?: string): void =>
  log('ACTION', message, { agentName, emoji });

/** Pixel Agents로 보내는 Hook 호출 관련 로그. */
export const hook = (message: string, agentName?: string): void => log('HOOK', message, { agentName });

/** OpenRouter(LLM) 호출 관련 로그. */
export const llm = (message: string, agentName?: string): void => log('LLM', message, { agentName });

/** 오류/검증 실패 로그. stderr로 출력된다. */
export const error = (message: string, agentName?: string): void => log('ERROR', message, { agentName });
