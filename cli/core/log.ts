export interface Sink {
  out(line: string): void;
  err(line: string): void;
}

export interface Finding {
  check: string;
  ok: boolean;
  detail: string;
}

export interface Log {
  info(line: string): void;
  warn(line: string): void;
  error(message: string, hint?: string): void;
  report(findings: Finding[]): void;
}

const consoleSink: Sink = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export function createLog(sink: Sink = consoleSink): Log {
  return {
    info: (line) => sink.out(line),
    warn: (line) => sink.out(`warn  ${line}`),
    error(message, hint) {
      sink.err(`error  ${message}`);
      if (hint) sink.err(`       ${hint}`);
    },
    report(findings) {
      for (const finding of findings) {
        const marker = finding.ok ? 'ok  ' : 'FAIL';
        sink.out(`${marker}  ${finding.check.padEnd(22)} ${finding.detail}`);
      }
    },
  };
}
