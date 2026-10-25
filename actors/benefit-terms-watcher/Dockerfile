# Apify's standard Node.js Actor image (same layout as the js-crawlee-cheerio template).
FROM apify/actor-node:22

# Install production dependencies first so source-only changes rebuild quickly.
COPY --chown=myuser:myuser package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" && node --version \
    && echo "NPM version:" && npm --version \
    && rm -r ~/.npm

COPY --chown=myuser:myuser . ./

CMD ["node", "src/main.js"]
