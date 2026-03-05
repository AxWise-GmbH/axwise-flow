# Multi-stage build for AxWise Frontend
# Stage 1: Build the application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source code
COPY frontend/ ./

# Set production environment variables for build
ENV NODE_ENV=production
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuYXh3aXNlLmRlJA
ENV NEXT_PUBLIC_ENABLE_CLERK_AUTH=true
ENV NEXT_PUBLIC_CLERK_DOMAIN=axwise.de
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/unified-dashboard
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/unified-dashboard
ENV NEXT_PUBLIC_API_URL=https://api.axwise.de
ENV NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB9YDdc49RAWqtJx1xApYsVG_2P_RcUUIs
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=axwise-73425
ENV NEXT_PUBLIC_ENABLE_FIREBASE_INTEGRATION=true
ENV NEXT_PUBLIC_ENABLE_MULTI_STAKEHOLDER=false
ENV NEXT_PUBLIC_MAX_STAKEHOLDERS=10
ENV NEXT_PUBLIC_STAKEHOLDER_CONFIDENCE_THRESHOLD=0.3

# Personas-only UI flag (baked at build time for client code)
ENV NEXT_PUBLIC_PERSONAS_ONLY=true

# Build the application with CAPTCHA support (this should create .next/standalone)
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output and static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Expose port
EXPOSE 8080

# Switch to non-root user
USER nextjs

# Start the application using Next.js standalone server
CMD ["node", "server.js"]
