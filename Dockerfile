# Hearthglance backend image: Python web backend + built Sidekick PWA + Wall assets.
# Build from the repository root: docker build -t hearthglance:dev .

FROM node:22-alpine AS sidekick
WORKDIR /build
COPY apps/sidekick/package.json apps/sidekick/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/sidekick/ ./
RUN node build.mjs

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HG_CONFIG=/config/config.json \
    HG_SESSIONS=/data/sessions.json
WORKDIR /app
COPY backend/web/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
 && mkdir -p /config /data /media \
 && chown 10001:10001 /data /media
COPY backend/web/app.py ./
COPY --from=sidekick /build/static ./static
COPY apps/wall/static ./wall
# Non-root by default; deployments may override with `user:` to match host ownership of /data and /media.
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["python","-c","import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=5).read()"]
CMD ["python","app.py"]
