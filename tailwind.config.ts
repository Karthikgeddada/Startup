import type { Config } from "tailwindcss";

/**
 * CURVIN design system — token mapping.
 * Colors are CSS custom properties defined in src/styles/globals.css so light and
 * dark themes swap without re-rendering components.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        subtle: "var(--subtle)",
        "subtle-foreground": "var(--subtle-foreground)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        input: "var(--input)",
        ring: "var(--ring)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          foreground: "var(--accent-foreground)",
          soft: "var(--accent-soft)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
          soft: "var(--success-soft)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
          soft: "var(--warning-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          foreground: "var(--danger-foreground)",
          soft: "var(--danger-soft)",
        },
      },
      fontFamily: {
        // SF system stack — no webfonts, native rendering everywhere.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "\"SF Pro Text\"",
          "\"SF Pro Display\"",
          "\"Helvetica Neue\"",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "\"SF Mono\"",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        "2xl": ["1.375rem", { lineHeight: "1.3", letterSpacing: "-0.02em" }],
        "3xl": ["1.75rem", { lineHeight: "1.2", letterSpacing: "-0.022em" }],
        "4xl": ["2.25rem", { lineHeight: "1.12", letterSpacing: "-0.025em" }],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
        xl: "14px",
        card: "18px",
        pill: "980px",
      },
      boxShadow: {
        overlay: "0 8px 32px rgba(0, 0, 0, 0.14)",
        dropdown: "0 4px 24px rgba(0, 0, 0, 0.10)",
        panel: "-8px 0 32px rgba(0, 0, 0, 0.05)",
        card: "0 2px 8px rgba(0, 0, 0, 0.06)",
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      // Note: the timing function is written literally here — an animation
      // shorthand needs a real CSS easing, not the `ease-swift` class name.
      animation: {
        "fade-in": "fade-in 160ms cubic-bezier(0.25, 0.1, 0.25, 1)",
        "slide-up": "slide-up 220ms cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
