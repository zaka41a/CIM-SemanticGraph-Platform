# Multi-stage build for CIM-SemanticGraph-Platform Backend
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21 AS builder

LABEL maintainer="CIM Platform Team"
LABEL stage="builder"

WORKDIR /app

# Copy pom.xml first for dependency caching
COPY pom.xml .

# Download dependencies (this layer will be cached)
RUN mvn dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application (skip tests for faster builds)
RUN mvn clean package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine

LABEL maintainer="CIM Platform Team"
LABEL description="CIM-SemanticGraph-Platform Backend - Knowledge Graph for Power Systems"
LABEL version="1.0.0"

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Create app user and data directories
RUN addgroup -S spring && adduser -S spring -G spring && \
    mkdir -p /app/data/tdb2 /app/logs /app/uploads && \
    chown -R spring:spring /app

# Copy built JAR from builder stage
COPY --from=builder /app/target/*.jar app.jar

# Set ownership
RUN chown spring:spring app.jar

# Switch to non-root user
USER spring:spring

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/api/actuator/health || exit 1

# Environment variables with defaults
ENV JAVA_OPTS="-Xms512m -Xmx2g" \
    SPRING_PROFILES_ACTIVE="docker" \
    TDB2_LOCATION="/app/data/tdb2" \
    LOGS_PATH="/app/logs"

# Run the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom -jar app.jar"]
