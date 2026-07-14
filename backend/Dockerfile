# ---- Backend image: multi-stage, runs as non-root ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Only production deps in the runtime image.
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Drop privileges: never run the API as root.
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER app
EXPOSE 4000
# Basic container healthcheck hits the health route.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "src/server.js"]
