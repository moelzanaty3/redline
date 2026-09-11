// Types for the CI rule parser, so cli/rules/__tests__/catalogue.test.ts can hold
// the CLI's own reader against it without an untyped import. The runtime module
// stays plain .mjs: it is run by node directly, never built.
export interface ScriptRule {
  id: string;
  stack: string;
  severity: 'BLOCKER' | 'HIGH' | 'SUGGESTION';
  text: string;
  source: string;
  line: number;
}

export declare const ROOT: string;
export declare const SEVERITIES: readonly string[];
export declare const RANK: Record<string, number>;
export declare const RULE_ID: RegExp;
export declare const RESERVED_RULE_IDS: ReadonlySet<string>;
export declare function loadRules(root?: string): Map<string, ScriptRule>;
