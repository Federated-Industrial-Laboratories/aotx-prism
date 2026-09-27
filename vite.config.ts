// SPDX-License-Identifier: Apache-2.0
// Build the reusable web workspace with relative local assets.
import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2023' } });
