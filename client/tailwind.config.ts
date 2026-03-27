import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: 'var(--accent-primary)',
                secondary: 'var(--accent-secondary)',
                accent: 'var(--accent-cyan)',
                background: 'var(--bg-primary)',
                foreground: 'var(--text-primary)',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            animation: {
                'float-up': 'float-up 0.6s ease forwards',
                'spin-slow': 'spin-slow 20s linear infinite',
            },
            keyframes: {
                'float-up': {
                    from: { opacity: '0', transform: 'translateY(20px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                'spin-slow': {
                    to: { transform: 'rotate(360deg)' },
                },
            },
        },
    },
    plugins: [],
};

export default config;
