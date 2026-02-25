export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./App.tsx",
        "./index.tsx",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                vantage: {
                    bg: '#05070a',
                    lightBg: '#f8fafc',
                    cyan: '#22d3ee',
                    purple: '#a855f7',
                    glass: 'rgba(255, 255, 255, 0.05)',
                    glassBorder: 'rgba(255, 255, 255, 0.1)',
                }
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
            },
            keyframes: {
                glow: {
                    '0%': { boxShadow: '0 0 5px #22d3ee, 0 0 10px #22d3ee' },
                    '100%': { boxShadow: '0 0 20px #a855f7, 0 0 30px #a855f7' },
                }
            }
        },
    },
    plugins: [],
}
