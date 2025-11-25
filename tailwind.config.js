/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F766E', // Deep Teal
          light: '#14B8A6',
          dark: '#0D5F58',
        },
        secondary: {
          DEFAULT: '#FB7185', // Soft Coral
          light: '#FDA4AF',
          dark: '#E11D48',
        },
        background: '#F8FAFC', // Slate 50
        surface: '#FFFFFF',
        text: {
          main: '#1E293B', // Slate 800
          muted: '#64748B', // Slate 500
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
