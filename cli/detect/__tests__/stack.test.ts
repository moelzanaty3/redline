import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../../render/manifest.ts';
import { proposeProfile } from '../stack.ts';

const manifest = loadManifest(fileURLToPath(new URL('../../../', import.meta.url)));

test('an empty repo falls back to tooling with low confidence', () => {
  const p = proposeProfile({ paths: [] });
  assert.equal(p.profile, 'tooling');
  assert.equal(p.confidence, 'low');
});

test('go.mod means a go service', () => {
  const p = proposeProfile({ paths: ['go.mod', 'cmd/api/main.go'] });
  assert.equal(p.profile, 'service-go');
  assert.equal(p.confidence, 'high');
  assert.ok(p.evidence.includes('go.mod'));
});

test('react-native in dependencies beats plain react', () => {
  const p = proposeProfile({
    paths: ['package.json', 'src/App.tsx'],
    packageJson: { dependencies: { react: '19.0.0', 'react-native': '0.76.0' } },
  });
  assert.equal(p.profile, 'mobile-rn');
});

test('nest plus react in one repo is fullstack-node', () => {
  const p = proposeProfile({
    paths: ['package.json', 'apps/web/src/App.tsx', 'apps/api/src/main.ts', 'apps/api/nest-cli.json'],
    packageJson: { dependencies: { react: '19.0.0', '@nestjs/core': '11.0.0' } },
  });
  assert.equal(p.profile, 'fullstack-node');
});

test('nest without react is a node service', () => {
  const p = proposeProfile({
    paths: ['package.json', 'nest-cli.json', 'src/main.ts'],
    packageJson: { dependencies: { '@nestjs/core': '11.0.0' } },
  });
  assert.equal(p.profile, 'service-node');
});

test('tsx without a framework dependency is web', () => {
  const p = proposeProfile({
    paths: ['package.json', 'src/App.tsx'],
    packageJson: { dependencies: { react: '19.0.0' } },
  });
  assert.equal(p.profile, 'web');
});

test('maven and java sources mean a java service', () => {
  const p = proposeProfile({ paths: ['pom.xml', 'src/main/java/com/acme/App.java'] });
  assert.equal(p.profile, 'service-java');
});

test('build.gradle.kts alone means a java/kotlin service', () => {
  const p = proposeProfile({ paths: ['build.gradle.kts', 'src/main/kotlin/App.kt'] });
  assert.equal(p.profile, 'service-java');
});

test('an android manifest with kotlin means mobile-android', () => {
  const p = proposeProfile({
    paths: ['build.gradle.kts', 'app/src/main/AndroidManifest.xml', 'app/src/main/java/A.kt'],
  });
  assert.equal(p.profile, 'mobile-android');
});

test('Package.swift means mobile-ios', () => {
  const p = proposeProfile({ paths: ['Package.swift', 'Sources/App/App.swift'] });
  assert.equal(p.profile, 'mobile-ios');
});

test('terraform alone means infra', () => {
  const p = proposeProfile({ paths: ['main.tf', 'variables.tf'] });
  assert.equal(p.profile, 'infra');
});

test('a csproj means a dotnet service', () => {
  const p = proposeProfile({ paths: ['Acme.Api/Acme.Api.csproj', 'Acme.Api/Program.cs'] });
  assert.equal(p.profile, 'service-dotnet');
});

test('pyproject means a python service', () => {
  const p = proposeProfile({ paths: ['pyproject.toml', 'src/app/main.py'] });
  assert.equal(p.profile, 'service-python');
});

test('every proposable profile exists in the manifest', () => {
  const inputs: DetectInputList = [
    { paths: [] },
    { paths: ['go.mod'] },
    { paths: ['pom.xml', 'A.java'] },
    { paths: ['pyproject.toml'] },
    { paths: ['a.csproj'] },
    { paths: ['Package.swift'] },
    { paths: ['build.gradle.kts', 'AndroidManifest.xml', 'A.kt'] },
    { paths: ['main.tf'] },
    { paths: ['package.json', 'a.tsx'], packageJson: { dependencies: { react: '1' } } },
    { paths: ['package.json'], packageJson: { dependencies: { 'react-native': '1' } } },
    { paths: ['package.json'], packageJson: { dependencies: { '@nestjs/core': '1' } } },
    {
      paths: ['package.json', 'a.tsx'],
      packageJson: { dependencies: { react: '1', '@nestjs/core': '1' } },
    },
  ];
  for (const input of inputs) {
    const { profile } = proposeProfile(input);
    assert.ok(manifest.profiles[profile], `proposed unknown profile "${profile}"`);
  }
});

type DetectInputList = Parameters<typeof proposeProfile>[0][];
