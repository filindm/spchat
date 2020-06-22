FROM node:8-alpine
WORKDIR /app
COPY package.json package.json
RUN npm install
COPY . .
CMD ["npm", "start"]
