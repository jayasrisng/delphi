import { defineConfig, loadEnv } from 'vite'
import { createApi } from './server/api.mjs'

export default defineConfig(({mode}) => {
  const connect = server => {
    server.middlewares.use(createApi({ ...loadEnv(mode,process.cwd(),''),...process.env }))
  }
  return { plugins:[{ name:'performance-api',configureServer:connect,configurePreviewServer:connect }] }
})
