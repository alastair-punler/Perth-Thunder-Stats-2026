FROM nginx:alpine
ENV PORT=8080
# Remove default config (we supply our own on the correct PORT)
RUN rm /etc/nginx/conf.d/default.conf

# Copy app files
COPY . /usr/share/nginx/html

# nginx:alpine processes /etc/nginx/templates/*.template with envsubst at startup,
# outputting to /etc/nginx/conf.d/ — this is how we inject $PORT at runtime.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# entrypoint.sh runs before nginx starts, generating js/config.js from template
# with SUPABASE_URL, SUPABASE_ANON_KEY and APP_TOKEN injected from Railway env vars.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
