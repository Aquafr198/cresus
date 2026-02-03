import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cresus: {
          50: "#f0f5ff",
          100: "#e0ebff",
          200: "#b8d1ff",
          300: "#85b0ff",
          400: "#4d89ff",
          500: "#1a62ff",
          600: "#0047e6",
          700: "#0035ad",
          800: "#002475",
          900: "#00133d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
