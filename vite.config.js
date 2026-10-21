import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serve public/fantascherma/ as a standalone static sub-app during dev.
// Without this, Vite's SPA fallback serves the React index.html for /fantascherma/.
function fantaschermaPlugin() {
  return {
    name: 'serve-fantascherma',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathname, search] = req.url.split('?')
        const query = search ? `?${search}` : ''

        // If accessed without trailing slash, redirect to /fantascherma/
        // so the browser resolves relative assets (styles.css, engine.js) correctly
        if (pathname === '/fantascherma') {
          res.writeHead(301, { Location: `/fantascherma/${query}` })
          res.end()
          return
        }

        // If accessed with trailing slash, serve the sub-app's index.html
        if (pathname === '/fantascherma/') {
          req.url = `/fantascherma/index.html${query}`
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [fantaschermaPlugin(), react()],
})
