/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan everything that might contain Tailwind class names
  content: [
    './index.html',
    './*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Anthropic Sans', 'ui-sans-serif', 'system-ui'],
        serif: ['Anthropic Serif', 'ui-serif', 'Georgia'],
      },
      colors: {
        ink: {
          950: '#0b0b0c',
          900: '#141416',
          850: '#1a1a1d',
          800: '#202024',
          750: '#27272c',
          700: '#2e2e34',
          500: '#5a5a63',
          300: '#a1a1aa',
          100: '#e7e7ea',
          50:  '#f5f5f6',
        },
        accent: {
          DEFAULT: '#c96442',
          hover:   '#d97757',
        },
      },
    },
  },
  plugins: [],
};
