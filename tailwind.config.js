/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/**/*.{ts,tsx,html}'],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
};
