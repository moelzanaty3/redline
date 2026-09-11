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

interface Match {
  evidence: string[];
  confidence: 'high' | 'low';
}

interface Rule {
  profile: string;
  when: (s: Signals) => Match | null;
}

// A manifest naming the framework is the repository telling you what it is. A
// file extension is you guessing from what happens to be lying around, and the
// guess is wrong often enough to matter: a Capacitor or Cordova web app ships an
// `ios/App.xcodeproj`, and calling it an iOS app installs Swift rules on a
// codebase with no Swift in it. Both still propose a profile; only the first
// arrives in the menu already ticked.
const sure = (...evidence: string[]): Match => ({ evidence, confidence: 'high' });
const guess = (...evidence: string[]): Match => ({ evidence, confidence: 'low' });

const RULES: Rule[] = [
  {
    profile: 'mobile-rn',
    when: (s) =>
      s.dep('react-native') || s.has('metro.config.js') || s.has('metro.config.cjs')
        ? sure('react-native dependency or metro config')
        : null,
  },
  {
    profile: 'fullstack-node',
    when: (s) =>
      (s.dep('@nestjs/core') || s.has('nest-cli.json')) && (s.dep('react') || s.ext('.tsx'))
        ? sure('nest and react in one repository')
        : null,
  },
  {
    profile: 'service-node',
    when: (s) => (s.dep('@nestjs/core') || s.has('nest-cli.json') ? sure('nest-cli.json') : null),
  },
  {
    profile: 'mobile-android',
    when: (s) =>
      s.has('AndroidManifest.xml') && (s.ext('.kt') || s.has('build.gradle.kts'))
        ? sure('AndroidManifest.xml with kotlin sources')
        : null,
  },
  {
    profile: 'mobile-ios',
    when: (s) =>
      s.has('Package.swift')
        ? sure('Package.swift')
        : // An Xcode project or a stray .swift file is also what a hybrid web app
          // looks like from the outside — propose it, do not assume it.
          s.ext('.xcodeproj') || s.ext('.swift')
          ? guess('xcode project or swift sources')
          : null,
  },
  {
    profile: 'service-java',
    when: (s) =>
      s.has('pom.xml') || s.has('build.gradle') || s.has('build.gradle.kts')
        ? sure('maven or gradle build file')
        : null,
  },
  { profile: 'service-go', when: (s) => (s.has('go.mod') ? sure('go.mod') : null) },
  {
    profile: 'service-python',
    when: (s) =>
      s.has('pyproject.toml') || s.has('requirements.txt') || s.has('setup.py')
        ? sure('python project file')
        : null,
  },
  {
    profile: 'service-dotnet',
    when: (s) => (s.ext('.csproj') || s.ext('.sln') ? sure('dotnet project file') : null),
  },
  {
    profile: 'web-angular',
    when: (s) =>
      s.dep('@angular/core') || s.has('angular.json')
        ? sure('angular dependency or angular.json')
        : null,
  },
  {
    profile: 'web-svelte',
    when: (s) =>
      s.dep('svelte') || s.has('svelte.config.js')
        ? sure('svelte dependency or config')
        : s.ext('.svelte')
          ? guess('svelte sources')
          : null,
  },
  {
    profile: 'web-vue',
    when: (s) =>
      s.dep('vue') || s.has('nuxt.config.ts')
        ? sure('vue dependency or nuxt config')
        : s.ext('.vue')
          ? guess('vue sources')
          : null,
  },
  {
    profile: 'web-react',
    when: (s) =>
      s.dep('react')
        ? sure('react dependency')
        : s.ext('.tsx') || s.ext('.jsx')
          ? guess('jsx sources')
          : null,
  },
  { profile: 'infra', when: (s) => (s.ext('.tf') ? sure('terraform sources') : null) },
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
    const match = rule.when(signals);
    if (match) {
      return { profile: rule.profile, confidence: match.confidence, evidence: match.evidence };
    }
  }
  return { profile: 'tooling', confidence: 'low', evidence: ['no recognised stack signal'] };
}
