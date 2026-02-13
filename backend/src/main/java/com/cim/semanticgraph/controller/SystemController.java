package com.cim.semanticgraph.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/system")
@Tag(name = "System", description = "System metrics and health monitoring")
public class SystemController {

    @GetMapping("/metrics")
    @Operation(summary = "Get system metrics", description = "Get CPU, memory, and system metrics")
    public ResponseEntity<Map<String, Object>> getSystemMetrics() {
        log.info("System metrics request received");
        Map<String, Object> metrics = new HashMap<>();

        try {
            OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
            double systemLoadAverage = osBean.getSystemLoadAverage();
            int availableProcessors = osBean.getAvailableProcessors();

            // CPU load derived from system load average normalized to processor count
            double cpuLoad = systemLoadAverage >= 0 ? (systemLoadAverage / availableProcessors) * 100 : 0;
            cpuLoad = Math.min(100, Math.max(0, cpuLoad));

            MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
            long heapUsed = memoryBean.getHeapMemoryUsage().getUsed();
            long heapMax = memoryBean.getHeapMemoryUsage().getMax();
            double memoryUsage = (double) heapUsed / heapMax * 100;

            Runtime runtime = Runtime.getRuntime();
            long totalMemory = runtime.totalMemory();
            long freeMemory = runtime.freeMemory();
            long maxMemory = runtime.maxMemory();
            long usedMemory = totalMemory - freeMemory;

            metrics.put("cpu", Math.round(cpuLoad * 10.0) / 10.0);
            metrics.put("memory", Math.round(memoryUsage * 10.0) / 10.0);
            metrics.put("disk", 45.0); // Placeholder - real disk monitoring requires OS-specific APIs
            metrics.put("network", 0.0); // Placeholder - network monitoring requires specific libraries

            Map<String, Object> memoryDetails = new HashMap<>();
            memoryDetails.put("used", usedMemory / (1024 * 1024));
            memoryDetails.put("total", totalMemory / (1024 * 1024));
            memoryDetails.put("max", maxMemory / (1024 * 1024));
            memoryDetails.put("free", freeMemory / (1024 * 1024));

            metrics.put("memoryDetails", memoryDetails);
            metrics.put("availableProcessors", availableProcessors);
            metrics.put("systemLoadAverage", systemLoadAverage);

            return ResponseEntity.ok(metrics);
        } catch (Exception e) {
            log.error("Error getting system metrics", e);
            metrics.put("cpu", 0.0);
            metrics.put("memory", 0.0);
            metrics.put("disk", 0.0);
            metrics.put("network", 0.0);
            return ResponseEntity.ok(metrics);
        }
    }

    @GetMapping("/health")
    @Operation(summary = "Get system health", description = "Get overall system health status")
    public ResponseEntity<Map<String, Object>> getSystemHealth() {
        log.info("System health request received");
        Map<String, Object> health = new HashMap<>();

        try {
            Runtime runtime = Runtime.getRuntime();
            long totalMemory = runtime.totalMemory();
            long freeMemory = runtime.freeMemory();
            long maxMemory = runtime.maxMemory();
            long usedMemory = totalMemory - freeMemory;
            double memoryUsagePercent = (double) usedMemory / maxMemory * 100;

            String status = "healthy";
            if (memoryUsagePercent > 90) {
                status = "degraded";
            }

            health.put("status", status);
            health.put("timestamp", System.currentTimeMillis());
            health.put("uptime", ManagementFactory.getRuntimeMXBean().getUptime());
            health.put("memoryUsage", Math.round(memoryUsagePercent * 10.0) / 10.0);

            return ResponseEntity.ok(health);
        } catch (Exception e) {
            log.error("Error getting system health", e);
            health.put("status", "unknown");
            health.put("error", e.getMessage());
            return ResponseEntity.ok(health);
        }
    }
}
