import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // relative base → builds work both locally (localhost:5173) and on GitHub
  // Pages (https://ayushupadhyay90.github.io/Syrax/), wherever the app is served
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // split heavy vendors into long-lived cacheable chunks → faster
        // repeat loads (network optimization for the deployed site)
        manualChunks: {
          three: ['three'],
          gsap: ['gsap'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the local FastAPI backend (hides Groq key)
      '/api': 'http://localhost:8000',
    },
  },
})
