import {defineConfig} from 'wxt';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

// See https://wxt.dev/api/config.html
export default defineConfig({
    extensionApi: 'chrome',
    manifest: {
        permissions: ["activeTab", "scripting", "sidePanel", "storage", "tabs", "identity"],
        host_permissions: [
            "https://docs.google.com/*",
            "https://docs.googleapis.com/*"
        ],
        oauth2: {
            client_id: process.env.GOOGLE_CLIENT_ID || "",
            scopes: [
                "https://www.googleapis.com/auth/documents.readonly"
            ]
        },
        web_accessible_resources: [
            {
                "resources": [
                    "lib/latex/*.wasm",
                    "lib/latex/*.js"
                ],
                "matches": [
                    "https://docs.google.com/*"
                ]
            },
            {
                "resources": [
                    "pdfjs-dist/*",
                    "cmaps/*",
                    "pdf.worker.mjs"
                ],
                "matches": [
                    "<all_urls>"
                ]
            }
        ],
        action: {},
        name: '__MSG_extName__',
        description: '__MSG_extDescription__',
        default_locale: "en"
    },
    vite: () => ({
        plugins: [react()],
        define: {
            'process.env.GOOGLE_CLIENT_ID': JSON.stringify(process.env.GOOGLE_CLIENT_ID),
        }
    }),
    hooks: {
        'build:publicAssets': async (_, assets) => {
            const path = await import('node:path');
            const fs = await import('node:fs/promises');
            
            assets.push(
                {
                    absoluteSrc: resolve('lib/latex/swiftlatexpdftex.wasm'),
                    relativeDest: 'lib/latex/swiftlatexpdftex.wasm',
                },
                {
                    absoluteSrc: resolve('lib/latex/swiftlatexpdftex.js'),
                    relativeDest: 'lib/latex/swiftlatexpdftex.js',
                }
            );
            
            // Add PDF.js worker from node_modules (needed for PDF.js to work in content scripts)
            try {
                const nodeModulesPath = path.resolve('node_modules');
                const pdfWorkerPath = path.join(nodeModulesPath, 'pdfjs-dist/build/pdf.worker.mjs');
                
                if (await fs.stat(pdfWorkerPath).catch(() => false)) {
                    assets.push({
                        absoluteSrc: pdfWorkerPath,
                        relativeDest: 'pdf.worker.mjs',
                    });
                } else {
                    console.warn('PDF.js worker file not found at expected location:', pdfWorkerPath);
                }
            } catch (error) {
                console.error('Error adding PDF.js worker to assets:', error);
            }
        }
    }
});
