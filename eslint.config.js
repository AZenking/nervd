// ESLint 扁平配置（最小可用基线）
//
// 设计取舍：仓库此前没有任何 lint 配置，但代码里零散写着 `// eslint-disable-next-line`。
// 一次性接入 recommended 规则会瞬间产生大量红点、淹没真实问题，因此这里**只启用三条低争议规则**：
//   - @typescript-eslint/no-unused-vars（warn，允许 `_` 前缀占位）
//   - no-console（warn）
//   - @typescript-eslint/no-explicit-any（warn）
//   - react-hooks/rules-of-hooks（warn）、react-hooks/exhaustive-deps（warn）
// 当前 `scripts/verify.sh` 不把 lint 纳入阻断步骤，先以 `pnpm lint` 观察存量问题；
// 待告警清零后再提升为 error 并接入门禁。
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // 生成物 / 依赖 / 本地工具目录不参与 lint
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-release/**',
      'preview/dist/**',
      'coverage/**',
      'graphify-out/**',
      'src-tauri/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.playwright-browsers/**',
      '.heroui-docs/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // TS 项目关闭基础规则，交给 @typescript-eslint 版本（避免 TS 语法误报）
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // 仓库既有 `// eslint-disable-next-line react-hooks/exhaustive-deps` 注释依赖此插件；
      // 未注册插件时 ESLint 会把未知规则报成 error，故显式接入。
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];