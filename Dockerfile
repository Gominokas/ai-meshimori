FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install
COPY . .
ENV PORT=8787
EXPOSE 8787
CMD ["node","apps/api/src/server.js"]
