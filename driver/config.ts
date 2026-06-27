import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AgentConfig, DriverConfig } from './types.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_SYSTEM_PROMPT = '당신은 성실한 사무직 직원입니다.';

/** AGENT_1_NAME 등이 하나도 없을 때 쓰는 폴백 (이전 Step들과의 하위 호환용). */
const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'agent-1', name: '김대리', model: DEFAULT_MODEL, systemPrompt: DEFAULT_SYSTEM_PROMPT },
];

/** .env에서 "\n"으로 적은 줄바꿈을 실제 줄바꿈으로 되돌린다 (시스템 프롬프트용). */
function unescapeNewlines(value: string): string {
  return value.replace(/\\n/g, '\n');
}

/**
 * AGENT_1_NAME, AGENT_2_NAME, ... 형태의 환경변수를 1부터 순서대로 읽어
 * 서로 독립된 에이전트 목록을 만든다. 이름이 끊기는 첫 번째 번호에서 멈춘다.
 * AGENT_<n>_API_KEY가 없으면 전역 OPENROUTER_API_KEY를 쓰도록 apiKey를 비워둔다
 * (planner.ts가 `agent.apiKey || openRouter.apiKey`로 처리).
 */
function readAgentsFromEnv(): AgentConfig[] {
  const agents: AgentConfig[] = [];
  for (let i = 1; ; i++) {
    const name = process.env[`AGENT_${i}_NAME`];
    if (!name) break;
    agents.push({
      id: `agent-${i}`,
      name,
      model: process.env[`AGENT_${i}_MODEL`] || DEFAULT_MODEL,
      systemPrompt: unescapeNewlines(process.env[`AGENT_${i}_SYSTEM_PROMPT`] || DEFAULT_SYSTEM_PROMPT),
      apiKey: process.env[`AGENT_${i}_API_KEY`] || undefined,
    });
  }
  return agents;
}

/**
 * driver/.env 파일을 직접 파싱해 process.env에 주입한다.
 * 파일이 없으면 조용히 무시한다 (Node의 --env-file 플래그와 달리 throw하지 않음).
 * 이미 설정된 환경변수는 덮어쓰지 않는다 (셸에서 직접 export한 값이 우선).
 */
function loadDotEnvFile(): void {
  const envPath = path.join(import.meta.dirname, '.env');
  let raw: string;
  try {
    raw = fs.readFileSync(envPath, 'utf-8');
  } catch {
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/** Driver 설정을 환경변수 + 기본값으로부터 로드한다. */
export function loadConfig(): DriverConfig {
  loadDotEnvFile();

  const homeDir = process.env['PIXEL_AGENTS_HOME'] || path.join(os.homedir(), '.pixel-agents');
  const claudeHomeDir = process.env['CLAUDE_HOME'] || path.join(os.homedir(), '.claude');
  const workspaceCwd = process.env['PIXEL_AGENTS_WORKSPACE'] || process.cwd();
  const agentsFromEnv = readAgentsFromEnv();

  return {
    openRouter: {
      apiKey: process.env['OPENROUTER_API_KEY'] ?? '',
      baseUrl: process.env['OPENROUTER_BASE_URL'] || DEFAULT_OPENROUTER_BASE_URL,
    },
    pixelAgents: { homeDir, claudeHomeDir, workspaceCwd },
    agents: agentsFromEnv.length > 0 ? agentsFromEnv : DEFAULT_AGENTS,
  };
}
