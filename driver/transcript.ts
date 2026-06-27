import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PixelAgentsPaths } from './types.js';

/** 한 에이전트의 트랜스크립트 파일. Claude Code의 온디스크 세션 형식을 그대로 따른다. */
export interface TranscriptSession {
  sessionId: string;
  projectDir: string;
  transcriptPath: string;
}

/**
 * Claude의 프로젝트 디렉터리 명명 규칙과 동일하게 워크스페이스 경로의
 * [a-zA-Z0-9-]가 아닌 모든 문자를 '-'로 치환한다.
 * core/src/normalizeProjectPath.ts와 완전히 동일해야 Pixel Agents 스캐너가
 * 같은 디렉터리를 본다.
 */
function normalizeProjectPath(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9-]/g, '-');
}

/** ~/.claude/projects/<normalized-workspace>/ 디렉터리를 보장하고 경로를 반환한다. */
function ensureProjectDir(paths: PixelAgentsPaths): string {
  const projectDir = path.join(
    paths.claudeHomeDir,
    'projects',
    normalizeProjectPath(paths.workspaceCwd),
  );
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

/**
 * 새 에이전트의 트랜스크립트 세션을 생성한다.
 * mock-claude 형식과 동일하게 첫 줄로 system/init 레코드를 기록해,
 * Pixel Agents 스캐너가 파일을 읽는 순간부터 내용이 비어있지 않게 한다.
 */
export function createTranscriptSession(
  paths: PixelAgentsPaths,
  sessionId: string,
): TranscriptSession {
  const projectDir = ensureProjectDir(paths);
  const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);
  const session: TranscriptSession = { sessionId, projectDir, transcriptPath };

  if (!fs.existsSync(transcriptPath)) {
    fs.writeFileSync(transcriptPath, '');
  }
  appendTranscriptLine(session, {
    type: 'system',
    subtype: 'init',
    content: 'mock-claude-ready',
  });

  return session;
}

/** 세션의 트랜스크립트 파일에 JSONL 레코드 한 줄을 append한다. */
export function appendTranscriptLine(
  session: TranscriptSession,
  record: Record<string, unknown>,
): void {
  fs.appendFileSync(session.transcriptPath, `${JSON.stringify(record)}\n`);
}
