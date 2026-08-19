FROM node:22-alpine

WORKDIR /app

# git: npm installs @2003scape/rsc-sprites from GitHub (dev tooling only)
RUN apk add --no-cache git

COPY package.json package-lock.json ./
# Skip native canvas builds; the Vite app does not use node-canvas at runtime.
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
