'use strict';

const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, text) {
  fs.writeFileSync(path, text, 'utf8');
}

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`cleanup target not found: ${label}`);
  return text.replace(before, after);
}

{
  const path = 'lib-next/video/video-helpers.ts';
  let text = read(path);
  text = replaceRequired(text, 'const DEFAULT_PROCESS_TIMEOUT = 300_000;\n', '', 'video helper default timeout constant');
  text = replaceRequired(text,
`  private runFfmpeg(
    args: readonly string[],
    timeoutMs = DEFAULT_PROCESS_TIMEOUT,
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void,
    cwd?: string
  ) {
    return this.session.runFfmpeg(args, {
      timeoutMs,
      maxStdoutBytes: 10 * 1024 * 1024,
      maxStderrBytes: 30 * 1024 * 1024,
      cwd,
      onStderr: createFfmpegProgressParser(onProgress),
    });
  }
`,
`  private runFfmpeg(
    args: readonly string[],
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void,
    cwd?: string
  ) {
    return this.session.runFfmpeg(args, {
      cwd,
      onStderr: createFfmpegProgressParser(onProgress),
    });
  }
`, 'video helper central run wrapper');

  text = text.replace(/, 600_000, undefined, workspace\.directory\)/g, ', undefined, workspace.directory)');
  text = text.replace(/, 600_000, onProgress\)/g, ', onProgress)');
  text = text.replace(/, DEFAULT_PROCESS_TIMEOUT, onProgress\)/g, ', onProgress)');
  text = text.replace(/, 600_000\)/g, ')');
  text = text.replace(/, 30_000\)/g, ')');
  text = text.replace(/\n\s*600_000,\n\s*onProgress,\n\s*workspace\.directory\n\s*\)/g, '\n        onProgress,\n        workspace.directory\n      )');

  if (/DEFAULT_PROCESS_TIMEOUT|maxStdoutBytes|maxStderrBytes/.test(text)) {
    throw new Error('video-helpers still contains hard-coded process policy');
  }
  if (/this\.runFfmpeg\([\s\S]{0,600}?,\s*(?:30_000|60_000|300_000|600_000)(?:\s*[,\)])/m.test(text)) {
    throw new Error('video-helpers still contains a positional hard-coded timeout');
  }
  write(path, text);
}

for (const [path, block] of [
  ['lib-next/video/extract-frame.ts', `        await session.runFfmpeg(args, {
          timeoutMs: 30_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 10 * 1024 * 1024,
        });`],
  ['lib-next/video/extract-all-frames.ts', `        await session.runFfmpeg(args, {
          timeoutMs: 300_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 10 * 1024 * 1024,
        });`],
  ['lib-next/video/extract-interval-frames.ts', `        await session.runFfmpeg(args, {
          timeoutMs: 60_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 10 * 1024 * 1024,
        });`],
]) {
  let text = read(path);
  text = replaceRequired(text, block, '        await session.runFfmpeg(args);', path);
  write(path, text);
}

{
  const path = 'lib-next/video/ffprobe-metadata.ts';
  let text = read(path);
  text = replaceRequired(text,
    'import { getErrorMessage } from "../core/errors";\n',
    'import { getErrorMessage } from "../core/errors";\nimport { getDefaultApexifyRuntimeConfig } from "../runtime/config";\n',
    'ffprobe runtime import');
  text = replaceRequired(text,
`function probeOptions(timeoutMs = 30_000) {
  return {
    timeoutMs,
    maxStdoutBytes: 10 * 1024 * 1024,
    maxStderrBytes: 2 * 1024 * 1024,
  } as const;
}
`,
`function probeOptions() {
  const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
  return {
    timeoutMs: ffmpeg.probeTimeoutMs,
    maxStdoutBytes: ffmpeg.maxStdoutBytes,
    maxStderrBytes: ffmpeg.maxStderrBytes,
  } as const;
}
`, 'ffprobe central runtime policy');
  text = text.replace(/probeOptions\((?:15_000|20_000)\)/g, 'probeOptions()');
  write(path, text);
}

{
  const path = 'scripts/phase3-bypass-scan.cjs';
  let text = read(path);
  const marker = "  if (/\\bfetch\\s*\\(/.test(text)) failures.push(`${rel}: unmanaged fetch()`);\n";
  const addition = marker + `\n  if (rel.startsWith('lib-next/video/') && !['lib-next/video/ffmpeg-session.ts', 'lib-next/video/process-runner.ts'].includes(rel)) {\n    if (/\\bmaxStdoutBytes\\s*:|\\bmaxStderrBytes\\s*:|DEFAULT_PROCESS_TIMEOUT/.test(text)) {\n      failures.push(\`${'${rel}'}: hard-coded FFmpeg/process bounds outside central runtime policy\`);\n    }\n  }\n`;
  text = replaceRequired(text, marker, addition, 'process-policy bypass scanner');
  write(path, text);
}

console.log('Phase 3 process policy cleanup applied.');
