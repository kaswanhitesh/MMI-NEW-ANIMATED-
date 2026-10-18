import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The 3D runtime is split into long-lived vendor chunks so a change to scene code never
    // invalidates the (much larger) three.js / React Three Fiber / GSAP downloads.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /[\\/]node_modules[\\/]@react-three[\\/]/ },
            { name: 'gsap', test: /[\\/]node_modules[\\/]gsap[\\/]/ },
          ],
        },
      },
    },
    // three.js alone is ~700 kB minified; the limit only silences the advisory for that known chunk.
    chunkSizeWarningLimit: 900,
  },
})
