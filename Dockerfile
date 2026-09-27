# Hopewick: static site and /api on one process.
# Render (render.yaml) builds this image. Local check:
#   docker build -t hopewick .
#   docker run --rm -p 8787:8787 -e PUBLIC_BASE_URL=http://127.0.0.1:8787 hopewick
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOPEWICK_DEV=0 \
    HOST=0.0.0.0 \
    PORT=8787 \
    BILLING_STORE=/var/data/users.json

COPY package.json ./
COPY . .

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Render injects PORT (usually 10000) and overrides ENV PORT above.
CMD ["node", "server/index.js"]
