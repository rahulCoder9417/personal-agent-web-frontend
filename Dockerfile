# syntax=docker/dockerfile:1
# The Textcrew web app as a container (the backend's compose file builds it as the `web` service).
#
# NEXT_PUBLIC_* values are compiled into the browser bundle, so the Clerk publishable key is a
# build argument. The Clerk secret key is needed while building too (pages rendered at build time
# must see the app in sign-in mode, not demo mode); it comes in as a build secret and is not kept
# in any image layer. At run time the container gets both keys and TEXTCREW_API_URL as environment.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=clerk_secret_key,required=false \
    CLERK_SECRET_KEY="$(cat /run/secrets/clerk_secret_key 2>/dev/null || true)" pnpm build \
 && chown -R node:node /app/.next
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
