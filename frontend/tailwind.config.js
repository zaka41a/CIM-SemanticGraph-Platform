/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Professional Dark Blue/Navy - matching new design
        primary: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',  // Main dark blue
          800: '#243447',  // Darker navy
          900: '#1a2332',  // Darkest navy from design
          950: '#0f1419',
        },
        // Professional Orange/Gold - matching new design
        accent: {
          50: '#fff9f0',
          100: '#fff3e0',
          200: '#ffe4c2',
          300: '#ffd199',
          400: '#ffb966',
          500: '#f39c12',  // Main orange
          600: '#e67e22',  // Secondary orange
          700: '#d35400',
          800: '#a04000',
          900: '#6e2c00',
          950: '#3d1800',
        },
        // Neutral grays for professional look
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #143d59 0%, #2a6090 100%)',
        'gradient-accent': 'linear-gradient(135deg, #f4b41a 0%, #f7cb3f 100%)',
        'gradient-hero': 'linear-gradient(135deg, #0a212f 0%, #143d59 50%, #2a6090 100%)',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(20, 61, 89, 0.08)',
        'medium': '0 4px 16px rgba(20, 61, 89, 0.12)',
        'large': '0 8px 32px rgba(20, 61, 89, 0.16)',
        'accent': '0 4px 16px rgba(244, 180, 26, 0.25)',
        'accent-lg': '0 8px 32px rgba(244, 180, 26, 0.3)',
        'glow': '0 0 20px rgba(244, 180, 26, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
