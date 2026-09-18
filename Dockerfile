FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm i --no-save vite@6 @vitejs/plugin-react@4 vite-plugin-singlefile@2 >/dev/null 2>&1
COPY . .
RUN npx vite build
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "server/index.js"]
