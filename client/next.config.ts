import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    experimental: {
        // Allow importing from shared types package
    },
    webpack: (config, { isServer }) => {
        config.resolve.alias = {
            ...config.resolve.alias,
        };
        // face-api.js and its deps (node-fetch, tfjs) reference Node-only modules
        // that don't exist in the browser. Provide empty stubs to silence warnings.
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                encoding: false,
            };
        }
        return config;
    },
};

export default nextConfig;
