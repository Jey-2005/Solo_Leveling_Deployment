/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void:    '#05060B',
        abyss:   '#0A0E1A',
        slate:   { 850: '#111726', 900: '#0A0E1A' },
        line:    '#1E2739',
        'line-lit': '#2C3A55',
        mana:    { DEFAULT: '#3EC6FF', deep: '#0E7FB8' },
        monarch: { DEFAULT: '#A78BFA', deep: '#6D3EE8' },
        danger:  '#FF3B5C',
        gold:    '#F5C542',
        jade:    '#34D399',
        bone:    '#E9EFF8',
        ash:     '#93A1B8',
        dim:     '#5C6880',
      },
      fontFamily: {
        display: ['Chakra Petch', 'system-ui', 'sans-serif'],
        sans:    ['Inter Tight', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '2px', sm: '1px', md: '3px' },
      maxWidth: { content: '1240px' },
    },
  },
  plugins: [],
}
