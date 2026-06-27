import * as fs from 'node:fs';
import * as path from 'node:path';

import * as logger from './logger.js';
import type { PixelAgentsPaths } from './types.js';

/** Hook POST 요청이 응답을 기다리는 최대 시간. claude-hook.js의 2000ms 타임아웃과 동일하게 맞춘다. */
const HOOK_REQUEST_TIMEOUT_MS = 2000;

/** ~/.pixel-agents/server.json 에서 읽어오는 서버 접속 정보. */
interface ServerDiscovery {
  port: number;
  token: string;
}

/** server.json을 읽어 {port, token}을 반환한다. 서버가 꺼져있거나 파일이 없으면 null. */
function readServerDiscovery(paths: PixelAgentsPaths): ServerDiscovery | null {
  try {
    const raw = fs.readFileSync(path.join(paths.homeDir, 'server.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { port?: unknown; token?: unknown };
    if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') return null;
    return { port: parsed.port, token: parsed.token };
  } catch {
    return null;
  }
}

/**
 * Pixel Agents 서버의 `POST /api/hooks/claude`로 hook 이벤트를 전송하는 유일한 통로.
 * 실제 Claude Code의 claude-hook.js와 동일한 페이로드 형식(hook_event_name, session_id, ...)을
 * 사용하므로, 서버의 normalizeHookEvent가 실제 Claude Code 이벤트와 구분 없이 처리한다.
 *
 * claude-hook.js와 동일하게 fail-open 정책을 따른다: 서버 미발견, 타임아웃, 네트워크 오류는
 * 모두 경고 로그만 남기고 절대 throw하지 않는다 — 캐릭터 애니메이션 한 번 실패가 드라이버
 * 전체를 죽여서는 안 된다.
 */
export class HookClient {
  constructor(private readonly paths: PixelAgentsPaths) {}

  /** SessionStart: 외부 세션으로 인식되어(다음 확인 이벤트와 함께) 캐릭터가 생성된다. */
  async sessionStart(sessionId: string, cwd: string, transcriptPath: string): Promise<void> {
    await this.post({
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      source: 'startup',
      cwd,
      transcript_path: transcriptPath,
    });
  }

  /** PreToolUse: 캐릭터가 도구 사용 애니메이션(타이핑 등)으로 전환된다. */
  async preToolUse(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<void> {
    await this.post({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      tool_name: toolName,
      tool_input: toolInput,
    });
  }

  /** PostToolUse: 진행 중이던 도구 사용 표시가 사라진다. */
  async postToolUse(sessionId: string): Promise<void> {
    await this.post({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
    });
  }

  /** Stop: 턴이 종료되고 캐릭터가 "Done" 상태로 전환된다. */
  async stop(sessionId: string): Promise<void> {
    await this.post({
      hook_event_name: 'Stop',
      session_id: sessionId,
    });
  }

  /** 실제 HTTP POST 한 건을 수행한다. 이 클래스 밖에서는 절대 hook 엔드포인트를 호출하지 않는다. */
  private async post(payload: Record<string, unknown>): Promise<void> {
    const server = readServerDiscovery(this.paths);
    if (!server) {
      logger.error(`server.json not found under ${this.paths.homeDir} - hook dropped: ${payload.hook_event_name}`);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HOOK_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/hooks/claude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${server.token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.error(`hook POST ${payload.hook_event_name} -> HTTP ${res.status}`);
      }
    } catch (err) {
      logger.error(
        `hook POST ${payload.hook_event_name} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
