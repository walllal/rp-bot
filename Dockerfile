FROM node:22-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/prisma/data
RUN npm install
RUN npx prisma generate
RUN npm run build
EXPOSE 8008
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]