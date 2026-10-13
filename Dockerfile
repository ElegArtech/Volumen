FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY dist ./dist
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
USER node
EXPOSE 8787
CMD ["node", "server/index.ts"]
