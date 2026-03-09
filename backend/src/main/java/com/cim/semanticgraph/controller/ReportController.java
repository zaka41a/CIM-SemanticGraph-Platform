package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.service.ReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
@Tag(name = "Reports", description = "PDF Report Generation")
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/loadflow")
    @Operation(summary = "Generate Load Flow Report", description = "Generate a PDF report with Load Flow analysis results")
    public ResponseEntity<byte[]> generateLoadFlowReport() {
        log.info("REST API: Generate Load Flow report");
        try {
            byte[] pdfBytes = reportService.generateLoadFlowReport();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment",
                "LoadFlow_Report_" + getTimestamp() + ".pdf");
            headers.setContentLength(pdfBytes.length);
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating Load Flow report", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/data-quality")
    @Operation(summary = "Generate Data Quality Report", description = "Generate a PDF report with data quality issues")
    public ResponseEntity<byte[]> generateDataQualityReport(@RequestBody DataQualityReportRequest request) {
        log.info("REST API: Generate Data Quality report");
        try {
            byte[] pdfBytes = reportService.generateDataQualityReport(request.getIssues());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment",
                "DataQuality_Report_" + getTimestamp() + ".pdf");
            headers.setContentLength(pdfBytes.length);
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating Data Quality report", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/statistics")
    @Operation(summary = "Generate Network Statistics Report", description = "Generate a PDF report with network statistics")
    public ResponseEntity<byte[]> generateNetworkStatisticsReport() {
        log.info("REST API: Generate Network Statistics report");
        try {
            byte[] pdfBytes = reportService.generateNetworkStatisticsReport();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment",
                "NetworkStatistics_Report_" + getTimestamp() + ".pdf");
            headers.setContentLength(pdfBytes.length);
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating Network Statistics report", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/full")
    @Operation(summary = "Generate Full CIM Report", description = "Generate a comprehensive AI-narrated PDF report of the entire CIM knowledge graph")
    public ResponseEntity<byte[]> generateFullCIMReport() {
        log.info("REST API: Generate Full CIM report");
        try {
            byte[] pdfBytes = reportService.generateFullCIMReport();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment",
                "CIM_Full_Report_" + getTimestamp() + ".pdf");
            headers.setContentLength(pdfBytes.length);
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating Full CIM report", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private String getTimestamp() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DataQualityReportRequest {
        private List<Map<String, Object>> issues;
    }
}
