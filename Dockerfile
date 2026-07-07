# Split Billing Bill — single self-contained container.
# Node + Express serve the vanilla-JS frontend and a REST API backed by an
# embedded SQLite database (Node's built-in node:sqlite — no native build step).

FROM node:22-alpine

# node:sqlite is available from Node 22.5+; enable it via NODE_OPTIONS so no
# per-command flag is needed. (Node 24 no longer needs the flag, but this keeps
# the image working on the 22.x line too.)
ENV NODE_ENV=production \
    NODE_OPTIONS=--experimental-sqlite \
    PORT=3000

WORKDIR /app

# Install production deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# App source.
COPY . .

# The SQLite database lives inside the container at /app/data.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

# Simple container healthcheck hitting the app's own /api/health.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
