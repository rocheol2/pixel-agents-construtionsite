/**
 * 단일 에이전트의 정체성 설정.
 * 이름/모델/시스템 프롬프트/API Key를 서로 독립적으로 가진다 (Step 10에서 다중 에이전트로 확장).
 */
export interface AgentConfig {
  /** 내부 식별자 (로그/세션 디렉터리 등에서 사용). */
  id: string;
  /** 로거에 표시할 한국어 이름 (예: "김대리"). */
  name: string;
  /** OpenRouter 모델 식별자 (예: "openai/gpt-4o-mini"). */
  model: string;
  /** 이 에이전트의 시스템 프롬프트. */
  systemPrompt: string;
  /** 에이전트별 API Key 오버라이드. 없으면 전역 OPENROUTER_API_KEY를 사용. */
  apiKey?: string;
}

/** OpenRouter 클라이언트 설정. */
export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
}

/** Pixel Agents 서버/Claude 홈 디렉터리 경로 설정 (테스트 격리를 위해 오버라이드 가능). */
export interface PixelAgentsPaths {
  /** ~/.pixel-agents 에 해당하는 경로 (server.json 위치). */
  homeDir: string;
  /** ~/.claude 에 해당하는 경로 (projects/ JSONL 위치). */
  claudeHomeDir: string;
  /** Pixel Agents 서버가 스캔 중인 워크스페이스 경로. `npx pixel-agents`를 실행한 디렉터리와
   *  반드시 일치해야 normalizeProjectPath 결과가 같아져 같은 프로젝트 디렉터리를 가리킨다. */
  workspaceCwd: string;
}

/** Driver 전체 설정. */
export interface DriverConfig {
  openRouter: OpenRouterConfig;
  pixelAgents: PixelAgentsPaths;
  agents: AgentConfig[];
}
