// Tailwind compiles only the Streamdown column's classes on /compare
// (see src/app/compare/streamdown.css). The rest of the site doesn't use it.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
