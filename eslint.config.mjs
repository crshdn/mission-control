import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default config;
