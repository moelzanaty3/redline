export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DetectInput {
  paths: string[];
  packageJson?: PackageManifest;
}

export interface Proposal {
  profile: string;
  confidence: 'high' | 'low';
  evidence: string[];
}

interface Signals {
  has: (name: string) => boolean;
  ext: (suffix: string) => boolean;
  dep: (name: string) => boolean;
}

interface Rule {
  profile: string;
  when: (s: Signals) => string[] | null;
}

const RULES: Rule[] = [
  {
    profile: 'mobile-rn',
    when: (s) =>
      s.dep('react-native') || s.has('metro.config.js') || s.has('metro.config.cjs')
        ? ['react-native dependency or metro config']
        : null,
  },
  {
    profile: 'fullstack-node',
    when: (s) =>
      (s.dep('@nestjs/core') || s.has('nest-cli.json')) && (s.dep('react') || s.ext('.tsx'))
        ? ['nest and react in one repository']
        : null,
  },
  {
    profile: 'service-node',
    when: (s) => (s.dep('@nestjs/core') || s.has('nest-cli.json') ? ['nest-cli.json'] : null),
  },
  {
    profile: 'mobile-android',
    when: (s) =>
      s.has('AndroidManifest.xml') && (s.ext('.kt') || s.has('build.gradle.kts'))
        ? ['AndroidManifest.xml with kotlin sources']
        : null,
  },
  {
    profile: 'mobile-ios',
    when: (s) =>
      s.has('Package.swift') || s.ext('.xcodeproj') || s.ext('.swift')
        ? ['swift package or sources']
        : null,
  },
  {
    profile: 'service-java',
    when: (s) =>
      s.has('pom.xml') || s.has('build.gradle') || s.has('build.gradle.kts')
        ? ['maven or gradle build file']
        : null,
  },
  { profile: 'service-go', when: (s) => (s.has('go.mod') ? ['go.mod'] : null) },
  {
    profile: 'service-python',
    when: (s) =>
      s.has('pyproject.toml') || s.has('requirements.txt') || s.has('setup.py')
        ? ['python project file']
        : null,
  },
  {
    profile: 'service-dotnet',
    when: (s) => (s.ext('.csproj') || s.ext('.sln') ? ['dotnet project file'] : null),
  },
  {
    profile: 'web',
    when: (s) => (s.dep('react') || s.ext('.tsx') || s.ext('.jsx') ? ['react sources'] : null),
  },
  { profile: 'infra', when: (s) => (s.ext('.tf') ? ['terraform sources'] : null) },
];

export function proposeProfile(input: DetectInput): Proposal {
  const names = new Set(input.paths.map((p) => p.split('/').at(-1) ?? p));
  const deps = {
    ...(input.packageJson?.dependencies ?? {}),
    ...(input.packageJson?.devDependencies ?? {}),
  };
  const signals: Signals = {
    has: (name) => names.has(name),
    ext: (suffix) => input.paths.some((p) => p.endsWith(suffix)),
    dep: (name) => name in deps,
  };

  for (const rule of RULES) {
    const evidence = rule.when(signals);
    if (evidence) return { profile: rule.profile, confidence: 'high', evidence };
  }
  return { profile: 'tooling', confidence: 'low', evidence: ['no recognised stack signal'] };
}
