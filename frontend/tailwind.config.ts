import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#d9eaff',
          200: '#b0d4ff',
          300: '#85bdff',
          400: '#3d95ff',
          500: '#0d6efd',
          600: '#0956d6',
          700: '#0742a6',
          800: '#052e75',
          900: '#031d4c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
