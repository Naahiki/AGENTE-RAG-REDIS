import daisyui from "daisyui";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        bwred: {
          "primary":  "#dc2626",   // rojo
          "secondary":"#111111",   // negro
          "accent":   "#111111",   // negro
          "neutral":  "#111111",   // negro
          "base-100": "#ffffff",   // blanco
          "base-200": "#f5f5f5",   // blanco suave
          "base-300": "#e5e7eb",   // gris muy claro
          "info":     "#111111",   // negro
          "success":  "#dc2626",   // rojo (evitar verdes)
          "warning":  "#dc2626",   // rojo (evitar amarillos)
          "error":    "#dc2626",   // rojo
        },
      },
    ],
    darkTheme: "bwred",
  },
};
