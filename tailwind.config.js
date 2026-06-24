/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        host: {
          blue: '#0667FF',
          bluedark: '#0048C7',
          navy: '#182633',
          ink: '#0F1D2B',
          tint: '#eef4ff',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(24,38,51,0.04), 0 1px 3px rgba(24,38,51,0.06)',
        elevated: '0 18px 40px -16px rgba(24,38,51,0.22)',
        glow: '0 8px 22px -8px rgba(6,103,255,0.5)',
      },
      borderRadius: {
        '2xl': '1.1rem',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.21,.6,.35,1) both',
      },
    },
  },
  plugins: [],
}
