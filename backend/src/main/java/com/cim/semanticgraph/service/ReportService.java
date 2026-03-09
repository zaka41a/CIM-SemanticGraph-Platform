package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.LoadFlowResponse;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.*;
import com.itextpdf.layout.properties.AreaBreakType;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
    private final JenaService     jenaService;
    private final GroqService     groqService;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    // ── Brand Colors ──────────────────────────────────────────────────────────
    private static final DeviceRgb NAVY        = new DeviceRgb(10,  20,  50);
    private static final DeviceRgb BLUE        = new DeviceRgb(59,  130, 246);
    private static final DeviceRgb BLUE_LIGHT  = new DeviceRgb(96,  165, 250);
    private static final DeviceRgb CYAN        = new DeviceRgb(6,   182, 212);
    private static final DeviceRgb GREEN       = new DeviceRgb(34,  197, 94);
    private static final DeviceRgb GREEN_DARK  = new DeviceRgb(21,  128, 61);
    private static final DeviceRgb ORANGE      = new DeviceRgb(251, 146, 60);
    private static final DeviceRgb RED         = new DeviceRgb(239, 68,  68);
    private static final DeviceRgb PURPLE      = new DeviceRgb(139, 92,  246);
    private static final DeviceRgb GRAY        = new DeviceRgb(107, 114, 128);
    private static final DeviceRgb WHITE        = new DeviceRgb(255, 255, 255);
    private static final DeviceRgb LIGHT_BG    = new DeviceRgb(248, 250, 252);
    private static final DeviceRgb HEADER_BG   = new DeviceRgb(219, 234, 254);
    private static final DeviceRgb ROW_ALT     = new DeviceRgb(241, 245, 249);

    // ── SPARQL Queries ────────────────────────────────────────────────────────
    private static final String GEN_QUERY = """
        PREFIX cim: <%s>
        SELECT ?name ?maxP ?minP ?type WHERE {
            ?g a cim:GeneratingUnit .
            ?g cim:IdentifiedObject.name ?name .
            OPTIONAL { ?g cim:GeneratingUnit.maxOperatingP ?maxP }
            OPTIONAL { ?g cim:GeneratingUnit.minOperatingP ?minP }
            OPTIONAL { ?g a ?type . FILTER(?type != cim:GeneratingUnit) }
        } ORDER BY ?name
        """;

    private static final String LOAD_QUERY = """
        PREFIX cim: <%s>
        SELECT ?name ?p ?q WHERE {
            ?l a cim:EnergyConsumer .
            ?l cim:IdentifiedObject.name ?name .
            OPTIONAL { ?l cim:EnergyConsumer.p ?p }
            OPTIONAL { ?l cim:EnergyConsumer.q ?q }
        } ORDER BY ?name
        """;

    private static final String LINE_QUERY = """
        PREFIX cim: <%s>
        SELECT ?name ?r ?x ?bch WHERE {
            ?l a cim:ACLineSegment .
            ?l cim:IdentifiedObject.name ?name .
            OPTIONAL { ?l cim:ACLineSegment.r ?r }
            OPTIONAL { ?l cim:ACLineSegment.x ?x }
            OPTIONAL { ?l cim:ACLineSegment.bch ?bch }
        } ORDER BY ?name
        """;

    private static final String TRAFO_QUERY = """
        PREFIX cim: <%s>
        SELECT ?name WHERE {
            ?t a cim:PowerTransformer .
            ?t cim:IdentifiedObject.name ?name .
        } ORDER BY ?name
        """;

    private static final String SUB_QUERY = """
        PREFIX cim: <%s>
        SELECT ?name WHERE {
            ?s a cim:Substation .
            ?s cim:IdentifiedObject.name ?name .
        } ORDER BY ?name
        """;

    private static final String VL_QUERY = """
        PREFIX cim: <%s>
        SELECT DISTINCT ?vkv WHERE {
            ?bv a cim:BaseVoltage .
            ?bv cim:BaseVoltage.nominalVoltage ?vkv .
        } ORDER BY ?vkv
        """;

    // ═════════════════════════════════════════════════════════════════════════
    //  MAIN — Full CIM Report
    // ═════════════════════════════════════════════════════════════════════════

    public byte[] generateFullCIMReport() {
        log.info("Generating comprehensive CIM Full Report...");

        // ── 1. Collect data ──────────────────────────────────────────────────
        Map<String, Object> graphStats   = jenaService.getGraphStatistics();
        List<Map<String,String>> gens    = sparql(GEN_QUERY.formatted(cimNamespace));
        List<Map<String,String>> loads   = sparql(LOAD_QUERY.formatted(cimNamespace));
        List<Map<String,String>> lines   = sparql(LINE_QUERY.formatted(cimNamespace));
        List<Map<String,String>> trafos  = sparql(TRAFO_QUERY.formatted(cimNamespace));
        List<Map<String,String>> subs    = sparql(SUB_QUERY.formatted(cimNamespace));
        List<Map<String,String>> vlevels = sparql(VL_QUERY.formatted(cimNamespace));

        LoadFlowResponse lf = null;
        try { lf = loadFlowService.calculateLoadFlow(); }
        catch (Exception e) { log.warn("Load flow unavailable for report: {}", e.getMessage()); }

        // ── 2. AI narrative ──────────────────────────────────────────────────
        String aiSummary  = buildAISummary(graphStats, gens, loads, lines, trafos, subs, lf);
        String aiAdvice   = buildAIRecommendations(graphStats, gens, loads, lines, lf);

        // ── 3. Build PDF ─────────────────────────────────────────────────────
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter   writer   = new PdfWriter(baos);
            PdfDocument pdf      = new PdfDocument(writer);
            // Page-number footer added via event handler (pages may be flushed before close)
            pdf.addEventHandler(PdfDocumentEvent.END_PAGE, new PageNumberHandler());
            Document    document = new Document(pdf, PageSize.A4);
            document.setMargins(50, 45, 50, 45);

            coverPage(pdf, document, graphStats, gens, loads, lines, subs);

            document.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
            sectionExecutiveSummary(document, aiSummary, graphStats, gens, loads, lf);

            document.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
            sectionKnowledgeGraph(document, graphStats);

            sectionNetworkInventory(document, graphStats, vlevels);

            document.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
            sectionGenerators(document, gens);

            sectionLoads(document, loads);

            document.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
            sectionLines(document, lines);

            sectionTransformers(document, trafos);
            sectionSubstations(document, subs);

            if (lf != null) {
                document.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
                sectionPowerFlow(document, lf);
            }

            document.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
            sectionRecommendations(document, aiAdvice);

            document.close();
            log.info("Full CIM Report generated successfully");
            return baos.toByteArray();

        } catch (Exception e) {
            log.error("Error generating full CIM report", e);
            throw new RuntimeException("Full report generation failed: " + e.getMessage(), e);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  COVER PAGE
    // ═════════════════════════════════════════════════════════════════════════

    private void coverPage(PdfDocument pdf, Document doc, Map<String,Object> stats,
                           List<Map<String,String>> gens, List<Map<String,String>> loads,
                           List<Map<String,String>> lines, List<Map<String,String>> subs) {

        // Add first content to force the first page to be created before accessing it
        doc.add(new Paragraph("\n\n\n\n"));

        // Now the first page exists — draw colored background via low-level canvas
        PdfPage  page   = pdf.getFirstPage();
        PdfCanvas canvas = new PdfCanvas(page);

        // Full navy background
        canvas.setFillColor(NAVY)
              .rectangle(0, 0, PageSize.A4.getWidth(), PageSize.A4.getHeight())
              .fill();

        // Blue accent bar (top)
        canvas.setFillColor(BLUE)
              .rectangle(0, PageSize.A4.getHeight() - 8, PageSize.A4.getWidth(), 8)
              .fill();

        // Cyan accent bar (bottom)
        canvas.setFillColor(CYAN)
              .rectangle(0, 0, PageSize.A4.getWidth(), 6)
              .fill();

        canvas.release();

        Paragraph badge = new Paragraph("CIM SEMANTIC GRAPH PLATFORM")
            .setFontSize(9).setBold()
            .setFontColor(CYAN)
            .setTextAlignment(TextAlignment.CENTER)
            .setCharacterSpacing(4);
        doc.add(badge);

        doc.add(new Paragraph("\n"));

        // Main title
        Paragraph title = new Paragraph("CIM Network")
            .setFontSize(42).setBold()
            .setFontColor(ColorConstants.WHITE)
            .setTextAlignment(TextAlignment.CENTER);
        doc.add(title);

        Paragraph title2 = new Paragraph("Complete Analysis Report")
            .setFontSize(36).setBold()
            .setFontColor(BLUE_LIGHT)
            .setTextAlignment(TextAlignment.CENTER);
        doc.add(title2);

        doc.add(new Paragraph("\n"));

        // Blue horizontal rule
        Table rule = new Table(UnitValue.createPercentArray(new float[]{1}))
            .setWidth(UnitValue.createPercentValue(50))
            .setHorizontalAlignment(HorizontalAlignment.CENTER);
        rule.addCell(new Cell().setHeight(3).setBackgroundColor(BLUE).setBorder(Border.NO_BORDER));
        doc.add(rule);

        doc.add(new Paragraph("\n\n"));

        // Subtitle
        Paragraph subtitle = new Paragraph("AI-Generated Technical Report — IEC 61970 CIM Standard")
            .setFontSize(12).setFontColor(GRAY)
            .setTextAlignment(TextAlignment.CENTER);
        doc.add(subtitle);

        doc.add(new Paragraph("\n\n\n"));

        // Stats cards row on cover (4 boxes)
        double totalGenMw   = sumDouble(gens, "maxP");
        double totalLoadMw  = sumDouble(loads, "p");
        long   totalTriples = toLong(stats.get("totalTriples"));

        Table statsRow = new Table(UnitValue.createPercentArray(new float[]{1,1,1,1}))
            .setWidth(UnitValue.createPercentValue(90))
            .setHorizontalAlignment(HorizontalAlignment.CENTER);

        addCoverStat(statsRow, String.valueOf(subs.size()),        "Substations",  CYAN);
        addCoverStat(statsRow, String.valueOf(gens.size()),        "Generators",   GREEN);
        addCoverStat(statsRow, String.format("%.0f MW",totalGenMw),"Capacity",    BLUE_LIGHT);
        addCoverStat(statsRow, String.format("%,d", totalTriples), "RDF Triples", ORANGE);

        doc.add(statsRow);

        doc.add(new Paragraph("\n\n\n\n\n\n"));

        // Generation info
        Paragraph gen = new Paragraph("Generated by AI — Claude + GraphRAG + Apache Jena Fuseki")
            .setFontSize(9).setFontColor(GRAY)
            .setTextAlignment(TextAlignment.CENTER);
        doc.add(gen);

        Paragraph date = new Paragraph(LocalDateTime.now().format(DateTimeFormatter.ofPattern("MMMM dd, yyyy — HH:mm")))
            .setFontSize(10).setBold().setFontColor(GRAY)
            .setTextAlignment(TextAlignment.CENTER);
        doc.add(date);
    }

    private void addCoverStat(Table table, String value, String label, DeviceRgb color) {
        Cell cell = new Cell()
            .setBackgroundColor(new DeviceRgb(255,255,255) /* white overlay hack — use padding */)
            .setBorder(Border.NO_BORDER)
            .setPadding(10)
            .setMargin(4);

        // Nested small table for the card
        Table card = new Table(UnitValue.createPercentArray(new float[]{1}))
            .setWidth(UnitValue.createPercentValue(95));

        card.addCell(new Cell()
            .add(new Paragraph(value).setFontSize(22).setBold().setFontColor(color)
                .setTextAlignment(TextAlignment.CENTER))
            .setBackgroundColor(new DeviceRgb(20, 30, 65))
            .setBorder(new SolidBorder(color, 1.5f))
            .setPadding(8));

        card.addCell(new Cell()
            .add(new Paragraph(label).setFontSize(9).setFontColor(GRAY)
                .setTextAlignment(TextAlignment.CENTER))
            .setBackgroundColor(new DeviceRgb(20, 30, 65))
            .setBorder(Border.NO_BORDER)
            .setPaddingBottom(6));

        cell.add(card);
        table.addCell(cell.setBackgroundColor(NAVY).setBorder(Border.NO_BORDER));
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 1 — EXECUTIVE SUMMARY
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionExecutiveSummary(Document doc, String aiText, Map<String,Object> stats,
                                         List<Map<String,String>> gens,
                                         List<Map<String,String>> loads,
                                         LoadFlowResponse lf) {
        sectionHeader(doc, "1", "Executive Summary", BLUE);

        // AI generated text
        if (aiText != null && !aiText.isBlank()) {
            for (String para : aiText.split("\n\n")) {
                if (para.isBlank()) continue;
                String cleaned = para.replaceAll("^#+\\s*", "").replaceAll("\\*\\*(.*?)\\*\\*", "$1").trim();
                doc.add(new Paragraph(cleaned)
                    .setFontSize(10.5f)
                    .setMultipliedLeading(1.5f)
                    .setTextAlignment(TextAlignment.JUSTIFIED)
                    .setMarginBottom(8));
            }
        }

        doc.add(new Paragraph("\n"));

        // Key metrics highlight table
        subsectionHeader(doc, "Key Performance Indicators", BLUE);

        double totalGen   = sumDouble(gens, "maxP");
        double totalLoad  = sumDouble(loads, "p");
        double loadFactor = totalGen > 0 ? (totalLoad / totalGen * 100) : 0;

        Table kpi = new Table(UnitValue.createPercentArray(new float[]{2,1,2,1}))
            .setWidth(UnitValue.createPercentValue(100));

        // Row headers style
        addKpiRow(kpi, "Total Generation Capacity", String.format("%.1f MW", totalGen),
                        "Total Network Load",         String.format("%.1f MW", totalLoad));
        addKpiRow(kpi, "Load Factor",                 String.format("%.1f%%", loadFactor),
                        "Generators",                  String.valueOf(gens.size()));

        if (lf != null && lf.getStatistics() != null) {
            LoadFlowResponse.SystemStatistics s = lf.getStatistics();
            addKpiRow(kpi, "Active Power Losses",   String.format("%.3f MW (%.2f%%)", s.getTotalLossesMw(), s.getLossPercentage()),
                           "Load Flow Convergence",  lf.isConverged() ? "✓ Converged" : "✗ Not Converged");
            addKpiRow(kpi, "Min Voltage",            String.format("%.4f pu  [%s]", s.getMinVoltagePu(), s.getMinVoltageBus()),
                           "Max Voltage",             String.format("%.4f pu  [%s]", s.getMaxVoltagePu(), s.getMaxVoltageBus()));
            addKpiRow(kpi, "Violations",             String.valueOf(lf.getViolations() != null ? lf.getViolations().size() : 0),
                           "Calculation Method",      lf.getCalculationMethod() != null ? lf.getCalculationMethod() : "Newton-Raphson");
        }

        doc.add(kpi);
    }

    private void addKpiRow(Table table, String k1, String v1, String k2, String v2) {
        table.addCell(new Cell().add(new Paragraph(k1).setBold().setFontSize(9))
            .setBackgroundColor(HEADER_BG).setPadding(6).setBorder(new SolidBorder(BLUE, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(v1).setFontSize(9).setFontColor(BLUE))
            .setPadding(6).setBorder(new SolidBorder(BLUE, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(k2).setBold().setFontSize(9))
            .setBackgroundColor(HEADER_BG).setPadding(6).setBorder(new SolidBorder(BLUE, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(v2).setFontSize(9).setFontColor(BLUE))
            .setPadding(6).setBorder(new SolidBorder(BLUE, 0.5f)));
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 2 — KNOWLEDGE GRAPH
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionKnowledgeGraph(Document doc, Map<String,Object> stats) {
        sectionHeader(doc, "2", "Knowledge Graph — RDF Triple Store", PURPLE);

        doc.add(new Paragraph(
            "The CIM data is persisted as RDF triples in Apache Jena Fuseki, a professional SPARQL 1.1 "
          + "triple store following the IEC 61970 CIM ontology. The table below shows the current state "
          + "of the knowledge graph.")
            .setFontSize(10).setMultipliedLeading(1.4f).setMarginBottom(10));

        // Two-column layout
        Table layout = new Table(UnitValue.createPercentArray(new float[]{1,1}))
            .setWidth(UnitValue.createPercentValue(100)).setMarginBottom(12);

        // Left: RDF stats
        Table leftTable = new Table(UnitValue.createPercentArray(new float[]{2,1}))
            .setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow(leftTable, 2, "Graph Metrics", PURPLE);
        addDataRow(leftTable, "Total RDF Triples",    fmt(stats.get("totalTriples")), 0);
        addDataRow(leftTable, "Unique Subjects",       fmt(stats.get("totalSubjects")), 1);
        addDataRow(leftTable, "Unique Predicates",     fmt(stats.get("totalPredicates")), 0);
        addDataRow(leftTable, "CIM Classes Used",      fmt(stats.get("totalClasses")), 1);

        // Right: Equipment stats
        Table rightTable = new Table(UnitValue.createPercentArray(new float[]{2,1}))
            .setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow(rightTable, 2, "CIM Entities", PURPLE);
        addDataRow(rightTable, "Connectivity Nodes",   fmt(stats.get("connectivityNodes")), 0);
        addDataRow(rightTable, "Terminals",             fmt(stats.get("terminals")), 1);
        addDataRow(rightTable, "Voltage Levels",        fmt(stats.get("voltageLevels")), 0);
        addDataRow(rightTable, "Base Voltages",         fmt(stats.get("baseVoltages")), 1);

        layout.addCell(new Cell().add(leftTable).setBorder(Border.NO_BORDER).setPaddingRight(8));
        layout.addCell(new Cell().add(rightTable).setBorder(Border.NO_BORDER).setPaddingLeft(8));
        doc.add(layout);

        // Storage info box
        Table infoBox = new Table(UnitValue.createPercentArray(new float[]{1}))
            .setWidth(UnitValue.createPercentValue(100));
        infoBox.addCell(new Cell()
            .add(new Paragraph("⚡  Storage: Apache Jena Fuseki  ·  Protocol: SPARQL 1.1  ·  Standard: IEC 61970 CIM100  ·  Reasoning: OWL Micro Reasoner")
                .setFontSize(9).setFontColor(PURPLE).setTextAlignment(TextAlignment.CENTER))
            .setBackgroundColor(new DeviceRgb(245, 243, 255))
            .setBorder(new SolidBorder(PURPLE, 1))
            .setPadding(8));
        doc.add(infoBox);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 3 — NETWORK INVENTORY
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionNetworkInventory(Document doc, Map<String,Object> stats, List<Map<String,String>> vlevels) {
        doc.add(new Paragraph("\n"));
        sectionHeader(doc, "3", "Network Inventory", CYAN);

        Table inv = new Table(UnitValue.createPercentArray(new float[]{3,1,1}))
            .setWidth(UnitValue.createPercentValue(100));

        addColoredHeaderRow(inv, 3, "CIM Equipment Summary", CYAN);
        addDataRow(inv, "Substations (Substation)",                   fmt(stats.get("substations")), 0);
        addDataRow(inv, "Power Transformers (PowerTransformer)",       fmt(stats.get("transformers")), 1);
        addDataRow(inv, "AC Transmission Lines (ACLineSegment)",       fmt(stats.get("transmissionLines")), 0);
        addDataRow(inv, "Synchronous Generators (GeneratingUnit)",     fmt(stats.get("generators")), 1);
        addDataRow(inv, "Energy Consumers / Loads (EnergyConsumer)",   fmt(stats.get("loads")), 0);
        addDataRow(inv, "Circuit Breakers (Breaker)",                  fmt(stats.get("breakers")), 1);
        addDataRow(inv, "Disconnectors (Disconnector)",                 fmt(stats.get("disconnectors")), 0);
        addDataRow(inv, "Busbar Sections (BusbarSection)",             fmt(stats.get("busbarSections")), 1);

        doc.add(inv);
        doc.add(new Paragraph("\n"));

        if (!vlevels.isEmpty()) {
            subsectionHeader(doc, "Voltage Levels Present", CYAN);
            StringBuilder vl = new StringBuilder();
            for (Map<String,String> r : vlevels) {
                String v = r.getOrDefault("vkv","?");
                try { vl.append(String.format("%.0f kV  ", Double.parseDouble(v))); }
                catch (NumberFormatException e) { vl.append(v).append("  "); }
            }
            doc.add(new Paragraph(vl.toString().trim())
                .setFontSize(11).setBold().setFontColor(CYAN).setMarginBottom(6));
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 4 — GENERATORS
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionGenerators(Document doc, List<Map<String,String>> gens) {
        doc.add(new Paragraph("\n"));
        sectionHeader(doc, "4", "Generation Fleet", GREEN);

        double totalMax = sumDouble(gens, "maxP");
        double totalMin = sumDouble(gens, "minP");

        doc.add(new Paragraph(String.format(
            "The network contains %d generating units with a total installed capacity of %.1f MW "
          + "(minimum operating capacity: %.1f MW).",
            gens.size(), totalMax, totalMin))
            .setFontSize(10).setMultipliedLeading(1.4f).setMarginBottom(10));

        Table table = new Table(UnitValue.createPercentArray(new float[]{4, 2, 2}))
            .setWidth(UnitValue.createPercentValue(100));

        addColoredHeaderRow3(table, "Generator Name", "Max P (MW)", "Min P (MW)", GREEN);

        int row = 0;
        for (Map<String,String> g : gens) {
            DeviceRgb bg = (row++ % 2 == 0) ? WHITE : ROW_ALT;
            table.addCell(cellData(g.getOrDefault("name","?"), bg));
            table.addCell(cellData(formatMW(g.get("maxP")), bg).setTextAlignment(TextAlignment.RIGHT));
            table.addCell(cellData(formatMW(g.get("minP")), bg).setTextAlignment(TextAlignment.RIGHT));
        }

        // Total row
        table.addCell(new Cell().add(new Paragraph("TOTAL").setBold().setFontSize(9))
            .setBackgroundColor(HEADER_BG).setPadding(5).setBorder(new SolidBorder(GREEN, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(String.format("%.1f MW", totalMax)).setBold().setFontColor(GREEN).setFontSize(9))
            .setBackgroundColor(HEADER_BG).setPadding(5).setTextAlignment(TextAlignment.RIGHT).setBorder(new SolidBorder(GREEN, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(String.format("%.1f MW", totalMin)).setBold().setFontSize(9))
            .setBackgroundColor(HEADER_BG).setPadding(5).setTextAlignment(TextAlignment.RIGHT).setBorder(new SolidBorder(GREEN, 0.5f)));

        doc.add(table);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 5 — LOADS
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionLoads(Document doc, List<Map<String,String>> loads) {
        doc.add(new Paragraph("\n"));
        sectionHeader(doc, "5", "Load Profile", ORANGE);

        double totalP = sumDouble(loads, "p");
        double totalQ = sumDouble(loads, "q");

        doc.add(new Paragraph(String.format(
            "%d energy consumers — Total active power: %.1f MW, Total reactive power: %.1f MVAr.",
            loads.size(), totalP, totalQ))
            .setFontSize(10).setMultipliedLeading(1.4f).setMarginBottom(10));

        Table table = new Table(UnitValue.createPercentArray(new float[]{4, 2, 2}))
            .setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow3(table, "Consumer Name", "P (MW)", "Q (MVAr)", ORANGE);

        int row = 0;
        for (Map<String,String> l : loads) {
            DeviceRgb bg = (row++ % 2 == 0) ? WHITE : ROW_ALT;
            table.addCell(cellData(l.getOrDefault("name","?"), bg));
            table.addCell(cellData(formatMW(l.get("p")), bg).setTextAlignment(TextAlignment.RIGHT));
            table.addCell(cellData(formatMW(l.get("q")), bg).setTextAlignment(TextAlignment.RIGHT));
        }

        table.addCell(new Cell().add(new Paragraph("TOTAL").setBold().setFontSize(9))
            .setBackgroundColor(new DeviceRgb(255,244,230)).setPadding(5).setBorder(new SolidBorder(ORANGE, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(String.format("%.1f MW", totalP)).setBold().setFontColor(ORANGE).setFontSize(9))
            .setBackgroundColor(new DeviceRgb(255,244,230)).setPadding(5).setTextAlignment(TextAlignment.RIGHT).setBorder(new SolidBorder(ORANGE, 0.5f)));
        table.addCell(new Cell().add(new Paragraph(String.format("%.1f MVAr", totalQ)).setBold().setFontSize(9))
            .setBackgroundColor(new DeviceRgb(255,244,230)).setPadding(5).setTextAlignment(TextAlignment.RIGHT).setBorder(new SolidBorder(ORANGE, 0.5f)));

        doc.add(table);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 6 — LINES
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionLines(Document doc, List<Map<String,String>> lines) {
        sectionHeader(doc, "6", "Transmission Lines", CYAN);

        doc.add(new Paragraph(String.format(
            "The network contains %d AC transmission line segments (ACLineSegment). "
          + "Impedance values are in physical Ohms referred to system base.", lines.size()))
            .setFontSize(10).setMultipliedLeading(1.4f).setMarginBottom(10));

        Table table = new Table(UnitValue.createPercentArray(new float[]{4, 1.5f, 1.5f, 1.5f}))
            .setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow4(table, "Line Name", "R (Ω)", "X (Ω)", "Bch (S)", CYAN);

        int row = 0;
        for (Map<String,String> l : lines) {
            DeviceRgb bg = (row++ % 2 == 0) ? WHITE : ROW_ALT;
            table.addCell(cellData(l.getOrDefault("name","?"), bg));
            table.addCell(cellData(fmtOhm(l.get("r")), bg).setTextAlignment(TextAlignment.RIGHT));
            table.addCell(cellData(fmtOhm(l.get("x")), bg).setTextAlignment(TextAlignment.RIGHT));
            table.addCell(cellData(fmtSci(l.get("bch")), bg).setTextAlignment(TextAlignment.RIGHT));
        }

        doc.add(table);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 7 — TRANSFORMERS & SUBSTATIONS
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionTransformers(Document doc, List<Map<String,String>> trafos) {
        doc.add(new Paragraph("\n"));
        sectionHeader(doc, "7", "Power Transformers & Substations", PURPLE);

        doc.add(new Paragraph(String.format("%d power transformers:", trafos.size()))
            .setFontSize(10).setMarginBottom(8));

        Table table = new Table(UnitValue.createPercentArray(new float[]{1, 5}))
            .setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow2(table, "#", "Transformer Name", PURPLE);

        int idx = 1;
        for (Map<String,String> t : trafos) {
            DeviceRgb bg = (idx % 2 == 0) ? ROW_ALT : WHITE;
            table.addCell(new Cell().add(new Paragraph(String.valueOf(idx)).setFontSize(9))
                .setBackgroundColor(bg).setPadding(5).setTextAlignment(TextAlignment.CENTER)
                .setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
            table.addCell(cellData(t.getOrDefault("name","?"), bg));
            idx++;
        }
        doc.add(table);
    }

    private void sectionSubstations(Document doc, List<Map<String,String>> subs) {
        doc.add(new Paragraph("\n"));
        doc.add(new Paragraph(String.format("Substations (%d):", subs.size()))
            .setFontSize(11).setBold().setFontColor(PURPLE).setMarginBottom(6));

        // Grid layout — 3 columns
        Table grid = new Table(UnitValue.createPercentArray(new float[]{1,1,1}))
            .setWidth(UnitValue.createPercentValue(100));
        for (Map<String,String> s : subs) {
            grid.addCell(new Cell()
                .add(new Paragraph("■  " + s.getOrDefault("name","?")).setFontSize(9))
                .setBackgroundColor(new DeviceRgb(245, 243, 255))
                .setBorder(new SolidBorder(PURPLE, 0.3f)).setPadding(5));
        }
        doc.add(grid);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 8 — POWER FLOW
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionPowerFlow(Document doc, LoadFlowResponse lf) {
        sectionHeader(doc, "8", "Power Flow Analysis (AC Newton-Raphson)", BLUE);

        // Convergence banner
        boolean ok = lf.isConverged();
        DeviceRgb bannerColor = ok ? new DeviceRgb(220, 252, 231) : new DeviceRgb(254, 226, 226);
        DeviceRgb textColor   = ok ? GREEN_DARK : RED;
        Table banner = new Table(UnitValue.createPercentArray(new float[]{1}))
            .setWidth(UnitValue.createPercentValue(100)).setMarginBottom(12);
        banner.addCell(new Cell()
            .add(new Paragraph((ok ? "✓  CONVERGED" : "✗  DID NOT CONVERGE")
                    + "  —  Method: " + lf.getCalculationMethod()
                    + "  |  Iterations: " + lf.getIterations()
                    + "  |  Exec time: " + lf.getExecutionTimeMs() + " ms")
                .setBold().setFontSize(11).setFontColor(textColor).setTextAlignment(TextAlignment.CENTER))
            .setBackgroundColor(bannerColor)
            .setBorder(new SolidBorder(textColor, 1.5f)).setPadding(10));
        doc.add(banner);

        // System statistics
        LoadFlowResponse.SystemStatistics s = lf.getStatistics();
        if (s != null) {
            subsectionHeader(doc, "System Power Balance", BLUE);
            Table bal = new Table(UnitValue.createPercentArray(new float[]{2,1,2,1}))
                .setWidth(UnitValue.createPercentValue(100)).setMarginBottom(10);
            addKpiRow(bal, "Total Generation", String.format("%.2f MW / %.2f MVAr", s.getTotalGenerationMw(), s.getTotalGenerationMvar()),
                           "Total Load",        String.format("%.2f MW / %.2f MVAr", s.getTotalLoadMw(), s.getTotalLoadMvar()));
            addKpiRow(bal, "Active Losses",     String.format("%.4f MW (%.3f%%)", s.getTotalLossesMw(), s.getLossPercentage()),
                           "Reactive Losses",    String.format("%.4f MVAr", s.getTotalLossesMvar()));
            addKpiRow(bal, "Min Voltage",        String.format("%.4f pu — %s", s.getMinVoltagePu(), s.getMinVoltageBus()),
                           "Max Voltage",         String.format("%.4f pu — %s", s.getMaxVoltagePu(), s.getMaxVoltageBus()));
            addKpiRow(bal, "Average Voltage",    String.format("%.4f pu", s.getAvgVoltagePu()),
                           "Total Buses/Branches", s.getTotalBuses() + " / " + s.getTotalBranches());
            doc.add(bal);
        }

        // Bus results table (all buses)
        if (lf.getBusResults() != null && !lf.getBusResults().isEmpty()) {
            subsectionHeader(doc, "Bus Voltage Results — All Buses", BLUE);
            Table bt = new Table(UnitValue.createPercentArray(new float[]{4, 1.5f, 1.5f, 1.5f, 1.5f, 1.5f}))
                .setWidth(UnitValue.createPercentValue(100));
            addColoredHeaderRow6(bt, "Bus Name", "Type", "V (pu)", "V (kV)", "Angle (°)", "Status", BLUE);

            int row = 0;
            for (LoadFlowResponse.BusResult b : lf.getBusResults()) {
                DeviceRgb bg = (row++ % 2 == 0) ? WHITE : ROW_ALT;
                boolean within = b.isWithinLimits();
                bt.addCell(cellData(b.getBusName() != null ? b.getBusName() : b.getBusId(), bg));
                bt.addCell(cellData(b.getBusType(), bg).setTextAlignment(TextAlignment.CENTER));
                bt.addCell(cellData(String.format("%.4f", b.getVoltageMagnitude()), bg).setTextAlignment(TextAlignment.RIGHT));
                bt.addCell(cellData(String.format("%.2f", b.getVoltageKv()), bg).setTextAlignment(TextAlignment.RIGHT));
                bt.addCell(cellData(String.format("%.2f", b.getVoltageAngle()), bg).setTextAlignment(TextAlignment.RIGHT));
                bt.addCell(new Cell()
                    .add(new Paragraph(within ? "✓ OK" : "⚠ VIOL").setFontSize(8).setBold()
                        .setFontColor(within ? GREEN_DARK : RED))
                    .setBackgroundColor(within ? new DeviceRgb(220,252,231) : new DeviceRgb(254,226,226))
                    .setPadding(4).setTextAlignment(TextAlignment.CENTER)
                    .setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
            }
            doc.add(bt);
        }

        // Branch results
        if (lf.getBranchResults() != null && !lf.getBranchResults().isEmpty()) {
            doc.add(new Paragraph("\n"));
            subsectionHeader(doc, "Branch Loading Results", BLUE);
            Table brt = new Table(UnitValue.createPercentArray(new float[]{3.5f, 1.5f, 2, 1.5f, 1.5f}))
                .setWidth(UnitValue.createPercentValue(100));
            addColoredHeaderRow5(brt, "Branch Name", "Type", "P Flow (MW)", "Losses (MW)", "Loading %", BLUE);

            int row = 0;
            for (LoadFlowResponse.BranchResult b : lf.getBranchResults()) {
                DeviceRgb bg   = (row++ % 2 == 0) ? WHITE : ROW_ALT;
                boolean over   = b.isOverloaded();
                DeviceRgb lColor = b.getLoadingPercentage() > 80 ? ORANGE : GREEN_DARK;
                if (over) lColor = RED;

                brt.addCell(cellData(b.getBranchName() != null ? b.getBranchName() : b.getBranchId(), bg));
                brt.addCell(cellData(b.getBranchType(), bg).setTextAlignment(TextAlignment.CENTER));
                brt.addCell(cellData(String.format("%.3f", b.getFromActivePowerMw()), bg).setTextAlignment(TextAlignment.RIGHT));
                brt.addCell(cellData(String.format("%.4f", b.getLossActivePowerMw()), bg).setTextAlignment(TextAlignment.RIGHT));
                brt.addCell(new Cell()
                    .add(new Paragraph(String.format("%.1f%%", b.getLoadingPercentage())).setFontSize(9).setBold().setFontColor(lColor))
                    .setBackgroundColor(over ? new DeviceRgb(254,226,226) : bg)
                    .setPadding(4).setTextAlignment(TextAlignment.RIGHT)
                    .setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
            }
            doc.add(brt);
        }

        // Violations
        if (lf.getViolations() != null && !lf.getViolations().isEmpty()) {
            doc.add(new Paragraph("\n"));
            subsectionHeader(doc, "Constraint Violations", RED);
            Table vt = new Table(UnitValue.createPercentArray(new float[]{2, 1.5f, 4, 1.5f, 1.5f}))
                .setWidth(UnitValue.createPercentValue(100));
            addColoredHeaderRow5(vt, "Element", "Type", "Description", "Severity", "Deviation", RED);

            for (LoadFlowResponse.Violation v : lf.getViolations()) {
                boolean critical = "CRITICAL".equals(v.getSeverity());
                DeviceRgb rowBg = critical ? new DeviceRgb(254,226,226) : new DeviceRgb(255,247,237);
                vt.addCell(cellData(v.getElementName() != null ? v.getElementName() : v.getElementId(), rowBg));
                vt.addCell(cellData(v.getType(), rowBg).setTextAlignment(TextAlignment.CENTER));
                vt.addCell(cellData(v.getDescription(), rowBg));
                vt.addCell(new Cell().add(new Paragraph(v.getSeverity()).setFontSize(9).setBold()
                        .setFontColor(critical ? RED : ORANGE))
                    .setBackgroundColor(rowBg).setPadding(5)
                    .setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)).setTextAlignment(TextAlignment.CENTER));
                vt.addCell(cellData(String.format("%.2f%%", v.getViolationPercentage()), rowBg).setTextAlignment(TextAlignment.RIGHT));
            }
            doc.add(vt);
        } else {
            doc.add(new Paragraph("\n"));
            Table okBox = new Table(UnitValue.createPercentArray(new float[]{1})).setWidth(UnitValue.createPercentValue(100));
            okBox.addCell(new Cell()
                .add(new Paragraph("✓  No constraint violations detected — All buses and branches operate within limits.")
                    .setFontSize(10).setBold().setFontColor(GREEN_DARK).setTextAlignment(TextAlignment.CENTER))
                .setBackgroundColor(new DeviceRgb(220,252,231))
                .setBorder(new SolidBorder(GREEN, 1)).setPadding(10));
            doc.add(okBox);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SECTION 9 — AI RECOMMENDATIONS
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionRecommendations(Document doc, String aiText) {
        sectionHeader(doc, "9", "AI Analysis & Recommendations", CYAN);

        doc.add(new Paragraph("The following analysis and recommendations were generated by the AI engine "
            + "(Claude / GraphRAG) based on the complete network data and power flow results.")
            .setFontSize(10).setMultipliedLeading(1.4f).setItalic().setMarginBottom(12));

        if (aiText != null && !aiText.isBlank()) {
            // Split into paragraphs and headings
            for (String line : aiText.split("\n")) {
                if (line.isBlank()) { doc.add(new Paragraph("\n").setFontSize(4)); continue; }
                String clean = line.trim();
                if (clean.startsWith("##")) {
                    doc.add(new Paragraph(clean.replaceAll("^#+\\s*", ""))
                        .setFontSize(11).setBold().setFontColor(CYAN).setMarginTop(10).setMarginBottom(4));
                } else if (clean.startsWith("-") || clean.startsWith("•")) {
                    doc.add(new Paragraph("• " + clean.replaceAll("^[-•]\\s*","").replaceAll("\\*\\*(.*?)\\*\\*","$1"))
                        .setFontSize(10).setMarginLeft(12).setMultipliedLeading(1.4f));
                } else {
                    doc.add(new Paragraph(clean.replaceAll("\\*\\*(.*?)\\*\\*","$1"))
                        .setFontSize(10).setMultipliedLeading(1.5f).setTextAlignment(TextAlignment.JUSTIFIED));
                }
            }
        } else {
            doc.add(new Paragraph("AI analysis unavailable — configure GROQ_API_KEY or CLAUDE_API_KEY.")
                .setFontSize(10).setFontColor(GRAY).setItalic());
        }

        // Final footer box
        doc.add(new Paragraph("\n\n"));
        Table footer = new Table(UnitValue.createPercentArray(new float[]{1})).setWidth(UnitValue.createPercentValue(100));
        footer.addCell(new Cell()
            .add(new Paragraph("Report generated by CIM SemanticGraph Platform  ·  "
                + "Powered by Apache Jena Fuseki + Claude AI + pandapower  ·  "
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")))
                .setFontSize(8).setFontColor(GRAY).setTextAlignment(TextAlignment.CENTER))
            .setBackgroundColor(LIGHT_BG).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.5f)).setPadding(8));
        doc.add(footer);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  AI NARRATIVE GENERATION
    // ═════════════════════════════════════════════════════════════════════════

    private String buildAISummary(Map<String,Object> stats, List<Map<String,String>> gens,
                                   List<Map<String,String>> loads, List<Map<String,String>> lines,
                                   List<Map<String,String>> trafos, List<Map<String,String>> subs,
                                   LoadFlowResponse lf) {
        if (!groqService.isConfigured()) return defaultSummary(stats, gens, loads, lines, subs, lf);

        double totalGenMw  = sumDouble(gens, "maxP");
        double totalLoadMw = sumDouble(loads, "p");
        String lfInfo = lf != null
            ? String.format("Load flow: %s, losses=%.3f MW (%.2f%%), minV=%.4f pu, maxV=%.4f pu.",
                lf.isConverged() ? "converged" : "NOT converged",
                lf.getStatistics() != null ? lf.getStatistics().getTotalLossesMw() : 0,
                lf.getStatistics() != null ? lf.getStatistics().getLossPercentage() : 0,
                lf.getStatistics() != null ? lf.getStatistics().getMinVoltagePu() : 0,
                lf.getStatistics() != null ? lf.getStatistics().getMaxVoltagePu() : 0)
            : "Load flow not available.";

        String prompt = String.format("""
            Write a concise professional executive summary (3 paragraphs, plain text, no markdown headers) \
            for a CIM power network with these characteristics:
            - %d substations, %d generators (%.0f MW total capacity), %d loads (%.0f MW), \
            %d transmission lines, %d transformers
            - RDF triples: %s, CIM classes: %s
            - %s
            Focus on: network scale, generation/load balance, and operational status. Be precise and technical.
            """,
            subs.size(), gens.size(), totalGenMw, loads.size(), totalLoadMw,
            lines.size(), trafos.size(),
            fmt(stats.get("totalTriples")), fmt(stats.get("totalClasses")),
            lfInfo);

        try {
            return groqService.simpleQuery(prompt);
        } catch (Exception e) {
            log.warn("AI summary failed: {}", e.getMessage());
            return defaultSummary(stats, gens, loads, lines, subs, lf);
        }
    }

    private String buildAIRecommendations(Map<String,Object> stats, List<Map<String,String>> gens,
                                           List<Map<String,String>> loads, List<Map<String,String>> lines,
                                           LoadFlowResponse lf) {
        if (!groqService.isConfigured()) return defaultRecommendations(lf);

        double totalGenMw  = sumDouble(gens, "maxP");
        double totalLoadMw = sumDouble(loads, "p");
        int violations = lf != null && lf.getViolations() != null ? lf.getViolations().size() : 0;
        String lfSummary = lf != null
            ? String.format("converged=%b, violations=%d, losses=%.3f MW, minV=%.4f pu",
                lf.isConverged(), violations,
                lf.getStatistics() != null ? lf.getStatistics().getTotalLossesMw() : 0,
                lf.getStatistics() != null ? lf.getStatistics().getMinVoltagePu() : 0)
            : "no load flow data";

        String prompt = String.format("""
            As a power systems engineer, provide 5-7 technical recommendations for this CIM network:
            - %d generators (%.0f MW), %d loads (%.0f MW), %d lines
            - Power flow: %s
            Use markdown bullet points. Be specific and technical. Focus on: voltage control, \
            loss reduction, N-1 security, reactive power compensation, and data quality improvements.
            """,
            gens.size(), totalGenMw, loads.size(), totalLoadMw, lines.size(), lfSummary);

        try {
            return groqService.simpleQuery(prompt);
        } catch (Exception e) {
            log.warn("AI recommendations failed: {}", e.getMessage());
            return defaultRecommendations(lf);
        }
    }

    private String defaultSummary(Map<String,Object> s, List<Map<String,String>> gens,
                                   List<Map<String,String>> loads, List<Map<String,String>> lines,
                                   List<Map<String,String>> subs, LoadFlowResponse lf) {
        double totalGen  = sumDouble(gens, "maxP");
        double totalLoad = sumDouble(loads, "p");

        String lfPart;
        if (lf != null) {
            double losses    = lf.getStatistics() != null ? lf.getStatistics().getTotalLossesMw()   : 0;
            double lossPct   = lf.getStatistics() != null ? lf.getStatistics().getLossPercentage()   : 0;
            double minV      = lf.getStatistics() != null ? lf.getStatistics().getMinVoltagePu()     : 0;
            double maxV      = lf.getStatistics() != null ? lf.getStatistics().getMaxVoltagePu()     : 1;
            lfPart = "The AC Newton-Raphson power flow "
                   + (lf.isConverged() ? "converged successfully" : "did not converge")
                   + " after " + lf.getIterations() + " iterations. "
                   + "Network losses are " + String.format("%.3f", losses) + " MW ("
                   + String.format("%.2f", lossPct) + "%). "
                   + "Voltage magnitudes range from " + String.format("%.4f", minV)
                   + " pu to " + String.format("%.4f", maxV) + " pu across all buses.";
        } else {
            lfPart = "Power flow analysis data is not yet available for this report.";
        }

        return "This report covers the CIM power network modelled according to the IEC 61970 standard and stored "
             + "as RDF triples in Apache Jena Fuseki. The network comprises " + subs.size() + " substations, "
             + gens.size() + " generating units with a total installed capacity of "
             + String.format("%.1f", totalGen) + " MW, " + loads.size()
             + " energy consumers with a total active load of " + String.format("%.1f", totalLoad) + " MW, "
             + "and " + lines.size() + " AC transmission line segments.\n\n"
             + "The knowledge graph contains " + fmt(s.get("totalTriples")) + " RDF triples representing the complete "
             + "network topology, equipment parameters, and connectivity. All CIM entities are modelled using standard "
             + "CIM100 classes and properties, enabling interoperability and SPARQL-based semantic queries.\n\n"
             + lfPart;
    }

    private String defaultRecommendations(LoadFlowResponse lf) {
        StringBuilder sb = new StringBuilder();
        sb.append("## Technical Recommendations\n\n");
        sb.append("- Verify that all transformer terminals are correctly linked to their ConnectivityNodes to ensure accurate power flow convergence.\n");
        sb.append("- Review the reactive power compensation strategy — busbar sections without shunt compensation may exhibit voltage deviations under heavy load.\n");
        sb.append("- Ensure all ACLineSegment elements have valid impedance values (r, x, bch) to improve power flow accuracy.\n");
        sb.append("- Implement N-1 contingency analysis to identify critical branches whose outage would cause cascading failures.\n");
        sb.append("- Consider re-indexing the Qdrant vector database after any major data changes to maintain semantic search accuracy.\n");
        if (lf != null && lf.getViolations() != null && !lf.getViolations().isEmpty()) {
            sb.append(String.format("- Address %d constraint violation(s) detected in the power flow: prioritize CRITICAL severity violations first.\n",
                lf.getViolations().size()));
        }
        if (lf != null && lf.getStatistics() != null && lf.getStatistics().getLossPercentage() > 3.0) {
            sb.append(String.format("- Active power losses of %.2f%% exceed 3%% — investigate high-impedance lines and consider reactive compensation.\n",
                lf.getStatistics().getLossPercentage()));
        }
        return sb.toString();
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  EXISTING PUBLIC METHODS (unchanged API)
    // ═════════════════════════════════════════════════════════════════════════

    public byte[] generateLoadFlowReport() {
        log.info("Generating Load Flow report...");
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter   writer   = new PdfWriter(baos);
            PdfDocument pdf      = new PdfDocument(writer);
            Document    document = new Document(pdf, PageSize.A4);
            document.setMargins(50, 45, 50, 45);

            LoadFlowResponse lf = loadFlowService.calculateLoadFlow();
            LoadFlowResponse.SystemStatistics stats = lf.getStatistics();

            addReportHeader(document, "Load Flow Analysis Report");
            addSection(document, "Report Information");
            addKeyValue(document, "Generated on",        ts());
            addKeyValue(document, "Calculation Time",    lf.getExecutionTimeMs() + " ms");
            addKeyValue(document, "Convergence Status",  lf.isConverged() ? "Converged" : "Failed");
            addKeyValue(document, "Iterations",          String.valueOf(lf.getIterations()));

            if (stats != null) {
                addSection(document, "System Overview");
                addKeyValue(document, "Total Buses",       String.valueOf(stats.getTotalBuses()));
                addKeyValue(document, "Total Branches",    String.valueOf(stats.getTotalBranches()));
                addKeyValue(document, "Total Generation",  String.format("%.2f MW / %.2f MVAr", stats.getTotalGenerationMw(), stats.getTotalGenerationMvar()));
                addKeyValue(document, "Total Load",        String.format("%.2f MW / %.2f MVAr", stats.getTotalLoadMw(), stats.getTotalLoadMvar()));
                addKeyValue(document, "Total Losses",      String.format("%.2f MW (%.2f%%)", stats.getTotalLossesMw(), stats.getLossPercentage()));
                addKeyValue(document, "Voltage Range",     String.format("%.3f to %.3f pu", stats.getMinVoltagePu(), stats.getMaxVoltagePu()));
            }

            if (lf.getViolations() != null && !lf.getViolations().isEmpty()) {
                addSection(document, "Violations");
                document.add(createViolationTable(lf.getViolations()));
            } else {
                addSection(document, "Violations");
                document.add(new Paragraph("No violations detected").setFontColor(GREEN));
            }

            if (lf.getBusResults() != null && !lf.getBusResults().isEmpty()) {
                addSection(document, "Bus Voltages (Top 10)");
                document.add(createBusVoltageTable(lf.getBusResults()));
            }

            addFooter(document);
            document.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate Load Flow report: " + e.getMessage(), e);
        }
    }

    public byte[] generateDataQualityReport(List<Map<String, Object>> issues) {
        log.info("Generating Data Quality report...");
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdf  = new PdfDocument(writer);
            Document doc     = new Document(pdf, PageSize.A4);

            addReportHeader(doc, "Data Quality Report");
            addSection(doc, "Report Information");
            addKeyValue(doc, "Generated on",      ts());
            addKeyValue(doc, "Total Issues Found", String.valueOf(issues.size()));

            long errors   = issues.stream().filter(i -> "ERROR".equals(i.get("severity"))).count();
            long warnings = issues.stream().filter(i -> "WARNING".equals(i.get("severity"))).count();
            addSection(doc, "Issues Summary");
            addKeyValue(doc, "Errors",   String.valueOf(errors));
            addKeyValue(doc, "Warnings", String.valueOf(warnings));

            addSection(doc, "Detailed Issues");
            for (Map<String,Object> issue : issues) {
                String sev = (String) issue.get("severity");
                DeviceRgb color = "ERROR".equals(sev) ? RED : ORANGE;
                Table t = new Table(UnitValue.createPercentArray(new float[]{1,3})).setWidth(UnitValue.createPercentValue(100));
                t.addCell(new Cell().add(new Paragraph("Category")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                t.addCell(new Cell().add(new Paragraph((String)issue.get("category"))));
                t.addCell(new Cell().add(new Paragraph("Severity")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                t.addCell(new Cell().add(new Paragraph(sev)));
                t.addCell(new Cell().add(new Paragraph("Message")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                t.addCell(new Cell().add(new Paragraph((String)issue.get("message"))));
                t.addCell(new Cell().add(new Paragraph("Count")).setBackgroundColor(color).setFontColor(ColorConstants.WHITE));
                t.addCell(new Cell().add(new Paragraph(String.valueOf(issue.get("count")))));
                doc.add(t);
                doc.add(new Paragraph("\n"));
            }
            addFooter(doc);
            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate Data Quality report: " + e.getMessage(), e);
        }
    }

    public byte[] generateNetworkStatisticsReport() {
        // Delegate to the full report for Dashboard
        return generateFullCIMReport();
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  HELPERS — Layout
    // ═════════════════════════════════════════════════════════════════════════

    private void sectionHeader(Document doc, String num, String title, DeviceRgb color) {
        doc.add(new Paragraph("\n"));
        Table bar = new Table(UnitValue.createPercentArray(new float[]{1})).setWidth(UnitValue.createPercentValue(100));
        bar.addCell(new Cell()
            .add(new Paragraph("  " + num + ".  " + title.toUpperCase()).setFontSize(14).setBold()
                .setFontColor(ColorConstants.WHITE))
            .setBackgroundColor(color).setBorder(Border.NO_BORDER).setPadding(8));
        doc.add(bar);
        doc.add(new Paragraph("\n").setFontSize(4));
    }

    private void subsectionHeader(Document doc, String title, DeviceRgb color) {
        doc.add(new Paragraph(title).setFontSize(11).setBold().setFontColor(color).setMarginTop(8).setMarginBottom(4));
    }

    private void addColoredHeaderRow(Table table, int cols, String label, DeviceRgb color) {
        table.addHeaderCell(new Cell(1, cols)
            .add(new Paragraph(label).setFontSize(9).setBold().setFontColor(ColorConstants.WHITE))
            .setBackgroundColor(color).setPadding(6).setBorder(Border.NO_BORDER));
    }

    private void addColoredHeaderRow2(Table t, String h1, String h2, DeviceRgb c) {
        for (String h : new String[]{h1, h2})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setFontSize(9).setBold().setFontColor(ColorConstants.WHITE))
                .setBackgroundColor(c).setPadding(5).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
    }

    private void addColoredHeaderRow3(Table t, String h1, String h2, String h3, DeviceRgb c) {
        for (String h : new String[]{h1, h2, h3})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setFontSize(9).setBold().setFontColor(ColorConstants.WHITE))
                .setBackgroundColor(c).setPadding(5).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
    }

    private void addColoredHeaderRow4(Table t, String h1, String h2, String h3, String h4, DeviceRgb c) {
        for (String h : new String[]{h1, h2, h3, h4})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setFontSize(9).setBold().setFontColor(ColorConstants.WHITE))
                .setBackgroundColor(c).setPadding(5).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
    }

    private void addColoredHeaderRow5(Table t, String h1, String h2, String h3, String h4, String h5, DeviceRgb c) {
        for (String h : new String[]{h1, h2, h3, h4, h5})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setFontSize(9).setBold().setFontColor(ColorConstants.WHITE))
                .setBackgroundColor(c).setPadding(5).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
    }

    private void addColoredHeaderRow6(Table t, String h1, String h2, String h3, String h4, String h5, String h6, DeviceRgb c) {
        for (String h : new String[]{h1, h2, h3, h4, h5, h6})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setFontSize(9).setBold().setFontColor(ColorConstants.WHITE))
                .setBackgroundColor(c).setPadding(5).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
    }

    private void addDataRow(Table table, String key, String value, int alt) {
        DeviceRgb bg = alt == 1 ? ROW_ALT : WHITE;
        table.addCell(new Cell().add(new Paragraph(key).setFontSize(9)).setBackgroundColor(bg).setPadding(5).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
        table.addCell(new Cell().add(new Paragraph(value).setFontSize(9).setBold()).setBackgroundColor(bg).setPadding(5).setTextAlignment(TextAlignment.RIGHT).setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f)));
    }

    private Cell cellData(String text, DeviceRgb bg) {
        return new Cell()
            .add(new Paragraph(text != null ? text : "—").setFontSize(9))
            .setBackgroundColor(bg).setPadding(5)
            .setBorder(new SolidBorder(ColorConstants.LIGHT_GRAY, 0.3f));
    }

    /** iText7 event handler: writes "Page N" in the footer of every page as it closes. */
    private static class PageNumberHandler implements IEventHandler {
        @Override
        public void handleEvent(Event event) {
            PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
            PdfDocument pdf  = docEvent.getDocument();
            PdfPage     page = docEvent.getPage();
            int         num  = pdf.getPageNumber(page);
            try {
                PdfFont font   = PdfFontFactory.createFont(StandardFonts.HELVETICA);
                PdfCanvas canvas = new PdfCanvas(page);
                canvas.beginText()
                      .setFontAndSize(font, 8)
                      .moveText(PageSize.A4.getWidth() / 2 - 20, 22)
                      .showText("Page " + num)
                      .endText()
                      .release();
            } catch (Exception ignored) {
                // non-critical — skip page number if font fails
            }
        }
    }

    // ── Kept for backward compat ──────────────────────────────────────────────

    private void addReportHeader(Document doc, String title) {
        doc.add(new Paragraph(title).setFontSize(24).setBold().setFontColor(BLUE).setTextAlignment(TextAlignment.CENTER));
        doc.add(new Paragraph("CIM-SemanticGraph-Platform").setFontSize(12).setFontColor(GRAY).setTextAlignment(TextAlignment.CENTER));
        doc.add(new Paragraph("\n"));
    }

    private void addSection(Document doc, String t) {
        doc.add(new Paragraph("\n"));
        doc.add(new Paragraph(t).setFontSize(16).setBold().setFontColor(BLUE));
        doc.add(new Paragraph("\n"));
    }

    private void addKeyValue(Document doc, String key, String value) {
        Table t = new Table(UnitValue.createPercentArray(new float[]{2,3})).setWidth(UnitValue.createPercentValue(100));
        t.addCell(new Cell().add(new Paragraph(key).setBold()));
        t.addCell(new Cell().add(new Paragraph(value)));
        doc.add(t);
    }

    private Table createViolationTable(List<LoadFlowResponse.Violation> violations) {
        Table t = new Table(UnitValue.createPercentArray(new float[]{2,3,2,2})).setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow4(t, "Type", "Description", "Severity", "Value", RED);
        for (LoadFlowResponse.Violation v : violations) {
            t.addCell(new Cell().add(new Paragraph(v.getType() != null ? v.getType() : "N/A")));
            t.addCell(new Cell().add(new Paragraph(v.getDescription() != null ? v.getDescription() : "N/A")));
            t.addCell(new Cell().add(new Paragraph(v.getSeverity() != null ? v.getSeverity() : "N/A"))
                .setFontColor("CRITICAL".equals(v.getSeverity()) ? RED : ORANGE));
            t.addCell(new Cell().add(new Paragraph(String.format("%.2f%%", v.getViolationPercentage()))));
        }
        return t;
    }

    private Table createBusVoltageTable(List<LoadFlowResponse.BusResult> busResults) {
        Table t = new Table(UnitValue.createPercentArray(new float[]{3,2,2,2})).setWidth(UnitValue.createPercentValue(100));
        addColoredHeaderRow4(t, "Bus Name", "Voltage (pu)", "Angle (deg)", "Status", BLUE);
        int count = 0;
        for (LoadFlowResponse.BusResult bv : busResults) {
            if (count++ >= 10) break;
            t.addCell(new Cell().add(new Paragraph(bv.getBusName() != null ? bv.getBusName() : bv.getBusId())));
            t.addCell(new Cell().add(new Paragraph(String.format("%.3f", bv.getVoltageMagnitude()))));
            t.addCell(new Cell().add(new Paragraph(String.format("%.2f", bv.getVoltageAngle()))));
            t.addCell(new Cell().add(new Paragraph(bv.isWithinLimits() ? "OK" : "Violation"))
                .setFontColor(bv.isWithinLimits() ? GREEN : RED));
        }
        return t;
    }

    private void addFooter(Document doc) {
        doc.add(new Paragraph("\n\n"));
        doc.add(new Paragraph("Generated by CIM-SemanticGraph-Platform").setFontSize(10).setFontColor(GRAY).setTextAlignment(TextAlignment.CENTER));
        doc.add(new Paragraph(ts()).setFontSize(8).setFontColor(ColorConstants.LIGHT_GRAY).setTextAlignment(TextAlignment.CENTER));
    }

    // ── SPARQL ────────────────────────────────────────────────────────────────

    private List<Map<String,String>> sparql(String query) {
        try { return jenaService.executeSparqlSelect(query); }
        catch (Exception e) { log.warn("SPARQL in report failed: {}", e.getMessage()); return List.of(); }
    }

    // ── Formatting ────────────────────────────────────────────────────────────

    private String fmt(Object v)      { return v == null ? "0" : String.format("%,d", toLong(v)); }
    private long toLong(Object v)     { if (v == null) return 0; try { return Long.parseLong(v.toString().replaceAll("[^0-9]","")); } catch (Exception e) { return 0; } }
    private String formatMW(String v) { if (v == null || v.isBlank()) return "—"; try { return String.format("%.1f", Double.parseDouble(v)); } catch (Exception e) { return v; } }
    private String fmtOhm(String v)   { if (v == null || v.isBlank()) return "—"; try { return String.format("%.4f", Double.parseDouble(v)); } catch (Exception e) { return v; } }
    private String fmtSci(String v)   { if (v == null || v.isBlank()) return "—"; try { return String.format("%.2e", Double.parseDouble(v)); } catch (Exception e) { return v; } }
    private String ts()               { return LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")); }

    private double sumDouble(List<Map<String,String>> rows, String key) {
        double total = 0;
        for (Map<String,String> r : rows) {
            String v = r.get(key);
            if (v != null) try { total += Double.parseDouble(v); } catch (NumberFormatException ignored) {}
        }
        return total;
    }
}
