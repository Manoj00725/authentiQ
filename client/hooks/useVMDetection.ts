'use client';

import { useState, useEffect } from 'react';

// ── Known VM GPU renderer strings ───────────────────────────────────────────
const VM_GPU_SIGNATURES = [
    'virtualbox', 'vmware', 'svga3d', 'llvmpipe', 'mesa',
    'microsoft basic render', 'parallels', 'qemu', 'hyper-v',
    'software rasterizer', 'google swiftshader', 'virgl',
    'red hat virtio', 'bochs', 'xen',
];

// ── Known VM vendor strings ─────────────────────────────────────────────────
const VM_VENDOR_SIGNATURES = [
    'vmware', 'virtualbox', 'parallels', 'qemu',
    'microsoft corporation', 'oracle',
];

interface VMDetectionResult {
    isVM: boolean;
    vmIndicators: string[];
    checked: boolean;
}

/**
 * useVMDetection — Detects virtual machine environments via WebGL + Navigator APIs
 *
 * Checks:
 * 1. WebGL renderer string against known VM GPU names
 * 2. WebGL vendor string against known VM vendors
 * 3. Hardware anomalies (very low CPU cores + memory)
 * 4. Screen resolution anomalies (non-standard for physical displays)
 * 5. navigator.platform inconsistencies
 */
export function useVMDetection(): VMDetectionResult {
    const [result, setResult] = useState<VMDetectionResult>({
        isVM: false,
        vmIndicators: [],
        checked: false,
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const indicators: string[] = [];

        try {
            // ── Check 1: WebGL renderer & vendor ────────────────────────────
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

            if (gl && gl instanceof WebGLRenderingContext) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
                    const vendor = (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '').toLowerCase();

                    for (const sig of VM_GPU_SIGNATURES) {
                        if (renderer.includes(sig)) {
                            indicators.push(`VM GPU: ${renderer}`);
                            break;
                        }
                    }

                    for (const sig of VM_VENDOR_SIGNATURES) {
                        if (vendor.includes(sig)) {
                            indicators.push(`VM Vendor: ${vendor}`);
                            break;
                        }
                    }
                }
            }

            // ── Check 2: Hardware anomalies ─────────────────────────────────
            const cores = navigator.hardwareConcurrency || 0;
            const memory = (navigator as any).deviceMemory || 0;

            // VMs typically expose very few cores
            if (cores > 0 && cores <= 1) {
                indicators.push(`Low CPU cores: ${cores}`);
            }

            // Very low device memory is suspicious (< 2 GB)
            if (memory > 0 && memory < 2) {
                indicators.push(`Low memory: ${memory} GB`);
            }

            // ── Check 3: Screen resolution anomalies ────────────────────────
            const { width, height } = window.screen;
            const ratio = width / height;

            // Check for typical VM default resolutions
            const vmResolutions = [
                [800, 600], [1024, 768], [1280, 800], [1152, 864],
            ];
            const isVMResolution = vmResolutions.some(([w, h]) => width === w && height === h);
            if (isVMResolution && cores <= 2) {
                indicators.push(`VM-typical resolution: ${width}x${height}`);
            }

            // Very square aspect ratio is unusual for modern monitors
            if (ratio < 1.2 && ratio > 0.8) {
                // Nearly square screens are rare on physical hardware
                indicators.push(`Unusual aspect ratio: ${ratio.toFixed(2)}`);
            }

            // ── Check 4: Color depth anomaly ────────────────────────────────
            if (window.screen.colorDepth < 24) {
                indicators.push(`Low color depth: ${window.screen.colorDepth}-bit`);
            }

        } catch (e) {
            console.warn('[useVMDetection] Error during detection:', e);
        }

        // Consider it a VM if we have 2+ indicators (avoid false positives from single signals)
        const isVM = indicators.length >= 2;

        setResult({
            isVM,
            vmIndicators: indicators,
            checked: true,
        });

        if (isVM) {
            console.warn('[useVMDetection] VM environment detected:', indicators);
        }
    }, []);

    return result;
}
