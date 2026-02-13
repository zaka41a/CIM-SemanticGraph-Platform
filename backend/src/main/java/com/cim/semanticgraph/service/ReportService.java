package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.LoadFlowResponse;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.*;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final LoadFlowService loadFlowService;
    private final JenaService jenaService;

    private static final DeviceRgb PRIMARY_COLOR = new DeviceRgb(59, 130, 246);
    private static final DeviceRgb SUCCESS_COLOR = new DeviceRgb(34, 197, 94);
    private static final DeviceRgb WARNING_COLOR = new DeviceRgb(251, 146, 60);
    private static final DeviceRgb ERROR_COLOR = new DeviceRgb(239, 68, 68);

    public byte[] generateLoadFlowReport() {
        log.info("Generating Load Flow report...");

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdf = new PdfDocument(writer);
            Document document = new Document(pdf);

            LoadFlowResponse loadFlowResult = loadFlowService.calculateLoadFlow();
            LoadFlowResponse.SystemStatistics stats = loadFlowResult.getStatistics();

            addReportHeader(document, "Load Flow Analysis Report");

            addSection(document, "Report Information");
            addKeyValue(document, "Generated on", LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")));
            addKeyValue(document, "Calculation Time", loadFlowResult.getExecutionTimeMs() + " ms");
            addKeyValue(document, "Convergence Status", loadFlowResult.isConverged() ? "Converged" : "Failed");
            addKeyValue(document, "Iterations", String.valueOf(loadFlowResult.getIterations()));

            addSection(document, "System Overview");
            if (stats != null) {
                addKeyValue(document, "Total Buses", String.valueOf(stats.getTotalBuses()));
                addKeyValue(document, "Total Branches", String.valueOf(stats.getTotalBranches()));
                addKeyValue(document, "Total Generation", String.format("%.2f MW / %.2f MVAr",
                    stats.getTotalGenerationMw(), stats.getTotalGenerationMvar()));
                addKeyValue(document, "Total Load", String.format("%.2f MW / %.2f MVAr",
                    stats.getTotalLoadMw(), stats.getTotalLoadMvar()));
                addKeyValue(document, "Total Losses", String.format("%.2f MW (%.2f%%)",
                    stats.getTotalLossesMw(), stats.getLossPercentage()));
                addKeyValue(document, "Voltage Range", String.format("%.3f to %.3f pu",
                    stats.getMinVoltagePu(), stats.getMaxVoltagePu()));
            }

            if (loadFlowResult.getViolations() != null && !loadFlowResult.getViolations().isEmpty()) {
                addSection(document, "Violations Detected");
                Table violationTable = createViolationTable(loadFlowResult.getViolations());
                document.add(violationTable);
            } else {
                addSection(document, "Violations");
                document.add(new Paragraph("No violations detected").setFontColor(SUCCESS_COLOR));
            }

            if (loadFlowResult.getBusResults() != null && !loadFlowResult.getBusResults().isEmpty()) {
                addSection(document, "Bus Voltages (Top 10)");
                Table busTable = createBusVoltageTable(loadFlowResult.getBusResults());
                document.add(busTable);
            }

            addFooter(document);

            document.close();
            log.info("Load Flow report generated successfully");
            return baos.toByteArray();

        } catch (Exception e) {
            log.error("Error generating Load Flow report", e);
            throw new RuntimeException("Failed to generate Load Flow report: " + e.getMessage(), e);
        }
    }

    public byte[] generateDataQualityReport(List<Map<String, Object>> issues) {
        log.info("Generating Data Quality report...");

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdf = new PdfDocument(writer);
            Document document = new Document(pdf);

            addReportHeader(document, "Data Quality Report");

            addSection(document, "Report Information");
            addKeyValue(document, "Generated on", LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")));
            addKeyValue(document, "Total Issues Found", String.valueOf(issues.size()));

            long errors = issues.stream().filter(i -> "ERROR".equals(i.get("severity"))).count();
            long warnings = issues.stream().filter(i -> "WARNING".equals(i.get("severity"))).count();

            addSection(document, "Issues Summary");
            addKeyValue(document, "Errors", String.valueOf(errors));
            addKeyValue(document, "Warnings", String.valueOf(warnings));

            addSection(document, "Detailed Issues");
            for (Map<String, Object> issue : issues) {
                Table issueTable = new Table(UnitValue.createPercentArray(new float[]{1, 3}));
                issueTable.setWidth(UnitValue.createPercentValue(100));

                String severity = (String) issue.get("severity");
                DeviceRgb color = "ERROR".equals(severity) ? ERROR_COLOR : WARNING_COLOR;

                issueTable.addCell(new Cell().add(new Paragraph("Category")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                issueTable.addCell(new Cell().add(new Paragraph((String) issue.get("category"))));

                issueTable.addCell(new Cell().add(new Paragraph("Severity")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                issueTable.addCell(new Cell().add(new Paragraph(severity)));

                issueTable.addCell(new Cell().add(new Paragraph("Message")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                issueTable.addCell(new Cell().add(new Paragraph((String) issue.get("message"))));

                issueTable.addCell(new Cell().add(new Paragraph("Affected Items")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                issueTable.addCell(new Cell().add(new Paragraph(String.valueOf(issue.get("count")))));

                document.add(issueTable);
                document.add(new Paragraph("\n"));
            }

            addFooter(document);

            document.close();
            log.info("Data Quality report generated successfully");
            return baos.toByteArray();

        } catch (Exception e) {
            log.error("Error generating Data Quality report", e);
            throw new RuntimeException("Failed to generate Data Quality report: " + e.getMessage(), e);
        }
    }

    public byte[] generateNetworkStatisticsReport() {
        log.info("Generating Network Statistics report...");

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdf = new PdfDocument(writer);
            Document document = new Document(pdf);

            addReportHeader(document, "Network Statistics Report");

            addSection(document, "Report Information");
            addKeyValue(document, "Generated on", LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")));

            Map<String, Object> stats = jenaService.getGraphStatistics();

            addSection(document, "Knowledge Graph Statistics");
            addKeyValue(document, "Total Triples", String.valueOf(stats.get("totalTriples")));
            addKeyValue(document, "Total Subjects", String.valueOf(stats.get("totalSubjects")));
            addKeyValue(document, "Total Predicates", String.valueOf(stats.get("totalPredicates")));
            addKeyValue(document, "Total Classes", String.valueOf(stats.get("totalClasses")));

            addSection(document, "CIM Equipment Statistics");
            addKeyValue(document, "Substations", String.valueOf(stats.get("substations")));
            addKeyValue(document, "Generators", String.valueOf(stats.get("generators")));
            addKeyValue(document, "Transmission Lines", String.valueOf(stats.get("transmissionLines")));

            addFooter(document);

            document.close();
            log.info("Network Statistics report generated successfully");
            return baos.toByteArray();

        } catch (Exception e) {
            log.error("Error generating Network Statistics report", e);
            throw new RuntimeException("Failed to generate Network Statistics report: " + e.getMessage(), e);
        }
    }

    private void addReportHeader(Document document, String title) {
        Paragraph header = new Paragraph(title)
            .setFontSize(24)
            .setBold()
            .setFontColor(PRIMARY_COLOR)
            .setTextAlignment(TextAlignment.CENTER);
        document.add(header);

        Paragraph subtitle = new Paragraph("CIM-SemanticGraph-Platform")
            .setFontSize(12)
            .setFontColor(ColorConstants.GRAY)
            .setTextAlignment(TextAlignment.CENTER);
        document.add(subtitle);

        document.add(new Paragraph("\n"));
    }

    private void addSection(Document document, String sectionTitle) {
        document.add(new Paragraph("\n"));
        Paragraph section = new Paragraph(sectionTitle)
            .setFontSize(16)
            .setBold()
            .setFontColor(PRIMARY_COLOR);
        document.add(section);
        document.add(new Paragraph("\n"));
    }

    private void addKeyValue(Document document, String key, String value) {
        Table table = new Table(UnitValue.createPercentArray(new float[]{2, 3}));
        table.setWidth(UnitValue.createPercentValue(100));

        table.addCell(new Cell().add(new Paragraph(key).setBold()));
        table.addCell(new Cell().add(new Paragraph(value)));

        document.add(table);
    }

    private Table createViolationTable(List<LoadFlowResponse.Violation> violations) {
        Table table = new Table(UnitValue.createPercentArray(new float[]{2, 3, 2, 2}));
        table.setWidth(UnitValue.createPercentValue(100));

        table.addHeaderCell(new Cell().add(new Paragraph("Type").setBold()).setBackgroundColor(ERROR_COLOR).setFontColor(ColorConstants.WHITE));
        table.addHeaderCell(new Cell().add(new Paragraph("Description").setBold()).setBackgroundColor(ERROR_COLOR).setFontColor(ColorConstants.WHITE));
        table.addHeaderCell(new Cell().add(new Paragraph("Severity").setBold()).setBackgroundColor(ERROR_COLOR).setFontColor(ColorConstants.WHITE));
        table.addHeaderCell(new Cell().add(new Paragraph("Value").setBold()).setBackgroundColor(ERROR_COLOR).setFontColor(ColorConstants.WHITE));

        for (LoadFlowResponse.Violation v : violations) {
            table.addCell(new Cell().add(new Paragraph(v.getType() != null ? v.getType() : "N/A")));
            table.addCell(new Cell().add(new Paragraph(v.getDescription() != null ? v.getDescription() : "N/A")));
            table.addCell(new Cell().add(new Paragraph(v.getSeverity() != null ? v.getSeverity() : "N/A")).setFontColor(
                "CRITICAL".equals(v.getSeverity()) ? ERROR_COLOR : WARNING_COLOR));
            table.addCell(new Cell().add(new Paragraph(String.format("%.2f%%", v.getViolationPercentage()))));
        }

        return table;
    }

    private Table createBusVoltageTable(List<LoadFlowResponse.BusResult> busResults) {
        Table table = new Table(UnitValue.createPercentArray(new float[]{3, 2, 2, 2}));
        table.setWidth(UnitValue.createPercentValue(100));

        table.addHeaderCell(new Cell().add(new Paragraph("Bus Name").setBold()).setBackgroundColor(PRIMARY_COLOR).setFontColor(ColorConstants.WHITE));
        table.addHeaderCell(new Cell().add(new Paragraph("Voltage (pu)").setBold()).setBackgroundColor(PRIMARY_COLOR).setFontColor(ColorConstants.WHITE));
        table.addHeaderCell(new Cell().add(new Paragraph("Angle (deg)").setBold()).setBackgroundColor(PRIMARY_COLOR).setFontColor(ColorConstants.WHITE));
        table.addHeaderCell(new Cell().add(new Paragraph("Status").setBold()).setBackgroundColor(PRIMARY_COLOR).setFontColor(ColorConstants.WHITE));

        int count = 0;
        for (LoadFlowResponse.BusResult bv : busResults) {
            if (count++ >= 10) break;

            table.addCell(new Cell().add(new Paragraph(bv.getBusName() != null ? bv.getBusName() : bv.getBusId())));
            table.addCell(new Cell().add(new Paragraph(String.format("%.3f", bv.getVoltageMagnitude()))));
            table.addCell(new Cell().add(new Paragraph(String.format("%.2f", bv.getVoltageAngle()))));
            table.addCell(new Cell().add(new Paragraph(bv.isWithinLimits() ? "OK" : "Violation"))
                .setFontColor(bv.isWithinLimits() ? SUCCESS_COLOR : ERROR_COLOR));
        }

        return table;
    }

    private void addFooter(Document document) {
        document.add(new Paragraph("\n\n"));
        Paragraph footer = new Paragraph("Generated by CIM-SemanticGraph-Platform")
            .setFontSize(10)
            .setFontColor(ColorConstants.GRAY)
            .setTextAlignment(TextAlignment.CENTER);
        document.add(footer);

        Paragraph timestamp = new Paragraph(LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")))
            .setFontSize(8)
            .setFontColor(ColorConstants.LIGHT_GRAY)
            .setTextAlignment(TextAlignment.CENTER);
        document.add(timestamp);
    }
}
