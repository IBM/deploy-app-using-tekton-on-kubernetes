FROM node:alpine

COPY app.js /app/app.js
COPY package.json /app/package.json
RUN cd /app && npm install
ENV WEB_PORT 3300
EXPOSE  3300

CMD ["node", "/app/app.js"]
