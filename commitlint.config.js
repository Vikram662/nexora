// Conventional commits: <type>(<scope>): <subject>. Rules in ENGINEERING_RULES.md section 4.2.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'build', 'ci', 'chore', 'style', 'revert']],
    'scope-enum': [
      2,
      'always',
      [
        'backend',
        'frontend',
        'api',
        'worker',
        'auth',
        'team',
        'livekit',
        'portal',
        'invoicing',
        'notifications',
        'settings',
        'admin',
        'db',
        'deploy',
        'ci',
        'deps',
      ],
    ],
    'header-max-length': [2, 'always', 100],
    'subject-max-length': [2, 'always', 72],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
  },
};
