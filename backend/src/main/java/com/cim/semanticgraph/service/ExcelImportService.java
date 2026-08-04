package com.cim.semanticgraph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.*;
import org.apache.jena.vocabulary.RDF;
import org.apache.jena.vocabulary.RDFS;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExcelImportService {

    private final JenaService jenaService;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    private static final String BASE_URI = "http://cim-platform.com/network/";

    public ImportResult importExcel(MultipartFile file) throws IOException {
        log.info("Importing Excel file: {}", file.getOriginalFilename());
        long startTime = System.currentTimeMillis();

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Model model = ModelFactory.createDefaultModel();
            model.setNsPrefix("cim", cimNamespace);
            model.setNsPrefix("rdf", RDF.getURI());
            model.setNsPrefix("rdfs", RDFS.getURI());

            ImportResult.ImportResultBuilder resultBuilder = ImportResult.builder()
                    .fileName(file.getOriginalFilename());

            int totalEntities = 0;
            List<String> importedSheets = new ArrayList<>();
            List<String> errors = new ArrayList<>();

            log.info("Processing Excel file with {} sheets", workbook.getNumberOfSheets());
            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                Sheet sheet = workbook.getSheetAt(i);
                String sheetName = sheet.getSheetName();
                String sheetNameLower = sheetName.toLowerCase().trim();

                log.info("Processing sheet {}: '{}' (normalized: '{}')", i + 1, sheetName, sheetNameLower);

                try {
                    int count = 0;
                    long triplesBefore = model.size();

                    String detectedType = detectSheetType(sheetNameLower, sheet);
                    if ("substation".equals(detectedType)) {
                        log.info("Detected as Substations sheet");
                        count = importSubstations(sheet, model);
                    } else if ("bus".equals(detectedType)) {
                        log.info("Detected as Buses sheet");
                        count = importBuses(sheet, model);
                    } else if ("line".equals(detectedType)) {
                        log.info("Detected as Lines sheet");
                        count = importLines(sheet, model);
                    } else if ("transformer".equals(detectedType)) {
                        log.info("Detected as Transformers sheet");
                        count = importTransformers(sheet, model);
                    } else if ("generator".equals(detectedType)) {
                        log.info("Detected as Generators sheet");
                        count = importGenerators(sheet, model);
                    } else if ("load".equals(detectedType)) {
                        log.info("Detected as Loads sheet");
                        count = importLoads(sheet, model);
                    } else if ("voltage".equals(detectedType)) {
                        log.info("Detected as Voltage Levels sheet");
                        count = importVoltageLevels(sheet, model);
                    } else {
                        log.warn("Skipping unrecognized sheet: '{}'. Expected: Substations, Buses, Lines, Transformers, Generators, Loads, or Voltage Levels", sheetName);
                        continue;
                    }

                    long triplesAfter = model.size();
                    long triplesAdded = triplesAfter - triplesBefore;
                    log.info("Sheet '{}': {} entities imported, {} triples created (before: {}, after: {})",
                            sheetName, count, triplesAdded, triplesBefore, triplesAfter);

                    if (count > 0) {
                        totalEntities += count;
                        importedSheets.add(sheet.getSheetName() + " (" + count + " entities)");
                        log.info("Imported {} entities from sheet: {}", count, sheet.getSheetName());
                    }

                } catch (Exception e) {
                    String error = "Error processing sheet " + sheet.getSheetName() + ": " + e.getMessage();
                    log.error(error, e);
                    errors.add(error);
                }
            }

            log.info("Model statistics before adding to knowledge graph:");
            log.info("  - Total triples in model: {}", model.size());
            log.info("  - Total entities imported: {}", totalEntities);
            log.info("  - Sheets processed: {}", importedSheets.size());

            if (model.size() > 0) {
                jenaService.addModel(model);
                log.info("Successfully added {} triples to knowledge graph", model.size());
            } else {
                log.warn("Model is empty! No triples were created. Check if sheets were recognized and data was parsed correctly.");
                errors.add("No triples were created from the Excel file. Please check the file format and column names.");
            }

            long executionTime = System.currentTimeMillis() - startTime;

            long finalTripleCount = model.size();
            boolean isSuccess = errors.isEmpty() && finalTripleCount > 0;

            ImportResult finalResult = resultBuilder
                    .success(isSuccess)
                    .entitiesImported(totalEntities)
                    .triplesCreated(finalTripleCount)
                    .sheetsProcessed(importedSheets)
                    .errors(errors)
                    .executionTimeMs(executionTime)
                    .build();

            log.info("Excel Import Summary:");
            log.info("  - Success: {}", isSuccess);
            log.info("  - Entities Imported: {}", totalEntities);
            log.info("  - Triples Created: {}", finalTripleCount);
            log.info("  - Sheets Processed: {}", importedSheets.size());
            log.info("  - Errors: {}", errors.size());
            log.info("  - Execution Time: {} ms", executionTime);

            return finalResult;

        } catch (Exception e) {
            log.error("Error importing Excel file", e);
            throw new IOException("Failed to import Excel: " + e.getMessage(), e);
        }
    }

    private int importSubstations(Sheet sheet, Model model) {
        log.info("Importing substations from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        int count = 0;
        int processedRows = 0;

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) {
                log.trace("Skipping empty row {} in substations sheet", i);
                continue;
            }

            processedRows++;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));

            if (id == null || id.isEmpty()) {
                id = "SUB_" + i;
            }

            Resource substation = model.createResource(BASE_URI + "Substation/" + sanitizeId(id));
            substation.addProperty(RDF.type, model.createResource(cimNamespace + "Substation"));

            if (name != null && !name.isEmpty()) {
                substation.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            String region = getCellValue(row, columns.getOrDefault("region", -1));
            if (region != null && !region.isEmpty()) {
                Resource regionRes = model.createResource(BASE_URI + "SubGeographicalRegion/" + sanitizeId(region));
                regionRes.addProperty(RDF.type, model.createResource(cimNamespace + "SubGeographicalRegion"));
                substation.addProperty(model.createProperty(cimNamespace + "Substation.Region"), regionRes);
            }

            count++;
            log.trace("Created substation: {} (name: {})", id, name);
        }

        log.info("Imported {} substations from {} processed rows. Model size: {} triples",
                count, processedRows, model.size());
        return count;
    }

    private int importBuses(Sheet sheet, Model model) {
        log.debug("Importing buses from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        log.debug("Column mapping for buses: {}", columns);
        int count = 0;
        int totalRows = sheet.getLastRowNum() + 1;
        log.debug("Sheet has {} total rows (including header)", totalRows);

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) {
                log.trace("Skipping empty row {}", i);
                continue;
            }

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String voltage = getCellValue(row, columns.getOrDefault("voltage", -1));
            String substation = getCellValue(row, columns.getOrDefault("substation", -1));

            if (id == null || id.isEmpty()) {
                id = "BUS_" + i;
            }

            Resource bus = model.createResource(BASE_URI + "BusbarSection/" + sanitizeId(id));
            bus.addProperty(RDF.type, model.createResource(cimNamespace + "BusbarSection"));

            if (name != null && !name.isEmpty()) {
                bus.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            Resource cn = model.createResource(BASE_URI + "ConnectivityNode/" + sanitizeId(id) + "_CN");
            cn.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
            if (name != null && !name.isEmpty()) {
                cn.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name + " CN"));
            }

            Resource terminal = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1");
            terminal.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
            terminal.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), bus);
            terminal.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn);
            terminal.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 1);

            if (voltage != null && !voltage.isEmpty()) {
                try {
                    double voltageKv = Double.parseDouble(voltage.replaceAll("[^0-9.]", ""));
                    String vlKey = sanitizeId(voltage) + "kV";
                    Resource voltageLevel = model.createResource(BASE_URI + "VoltageLevel/" + vlKey);
                    voltageLevel.addProperty(RDF.type, model.createResource(cimNamespace + "VoltageLevel"));
                    voltageLevel.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                            model.createLiteral(voltage + "kV"));

                    Resource baseVoltage = model.createResource(BASE_URI + "BaseVoltage/" + (int) voltageKv + "kV");
                    baseVoltage.addProperty(RDF.type, model.createResource(cimNamespace + "BaseVoltage"));
                    baseVoltage.addLiteral(model.createProperty(cimNamespace + "BaseVoltage.nominalVoltage"), voltageKv);
                    voltageLevel.addProperty(model.createProperty(cimNamespace + "VoltageLevel.BaseVoltage"), baseVoltage);

                    bus.addProperty(model.createProperty(cimNamespace + "Equipment.EquipmentContainer"), voltageLevel);
                    cn.addProperty(model.createProperty(cimNamespace + "ConnectivityNode.ConnectivityNodeContainer"), voltageLevel);
                } catch (NumberFormatException e) {
                    log.warn("Invalid voltage value for bus {}: {}", id, voltage);
                }
            }

            count++;
            log.trace("Created bus: {} with {} triples", id, model.size());
        }

        log.info("Imported {} buses from sheet '{}'. Model now has {} triples", count, sheet.getSheetName(), model.size());
        return count;
    }

    private int importLines(Sheet sheet, Model model) {
        log.debug("Importing lines from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        int count = 0;

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String fromBus = getCellValue(row, columns.getOrDefault("from", columns.getOrDefault("from_bus", -1)));
            String toBus = getCellValue(row, columns.getOrDefault("to", columns.getOrDefault("to_bus", -1)));
            String length = getCellValue(row, columns.getOrDefault("length", -1));
            String resistance = getCellValue(row, columns.getOrDefault("r", columns.getOrDefault("resistance", -1)));
            String reactance = getCellValue(row, columns.getOrDefault("x", columns.getOrDefault("reactance", -1)));

            if (id == null || id.isEmpty()) {
                id = "LINE_" + i;
            }

            Resource line = model.createResource(BASE_URI + "ACLineSegment/" + sanitizeId(id));
            line.addProperty(RDF.type, model.createResource(cimNamespace + "ACLineSegment"));

            if (name != null && !name.isEmpty()) {
                line.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            if (length != null && !length.isEmpty()) {
                try {
                    line.addLiteral(model.createProperty(cimNamespace + "Conductor.length"),
                            Double.parseDouble(length));
                } catch (NumberFormatException e) {
                    log.warn("Invalid length value: {}", length);
                }
            }

            if (resistance != null && !resistance.isEmpty()) {
                try {
                    line.addLiteral(model.createProperty(cimNamespace + "ACLineSegment.r"),
                            Double.parseDouble(resistance));
                } catch (NumberFormatException e) {
                    log.warn("Invalid resistance value: {}", resistance);
                }
            }

            if (reactance != null && !reactance.isEmpty()) {
                try {
                    line.addLiteral(model.createProperty(cimNamespace + "ACLineSegment.x"),
                            Double.parseDouble(reactance));
                } catch (NumberFormatException e) {
                    log.warn("Invalid reactance value: {}", reactance);
                }
            }

            createLineTerminals(model, line, id, fromBus, toBus);

            count++;
        }

        return count;
    }

    private int importTransformers(Sheet sheet, Model model) {
        log.debug("Importing transformers from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        int count = 0;

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String hvBus = getCellValue(row, columns.getOrDefault("hv_bus", -1));
            String lvBus = getCellValue(row, columns.getOrDefault("lv_bus", -1));
            String ratedS = getCellValue(row, columns.getOrDefault("rated_s", -1));

            if (id == null || id.isEmpty()) {
                id = "TRAFO_" + i;
            }

            Resource trafo = model.createResource(BASE_URI + "PowerTransformer/" + sanitizeId(id));
            trafo.addProperty(RDF.type, model.createResource(cimNamespace + "PowerTransformer"));

            if (name != null && !name.isEmpty()) {
                trafo.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            if (ratedS != null && !ratedS.isEmpty()) {
                try {
                    Resource hvEnd = model.createResource(BASE_URI + "PowerTransformerEnd/" + sanitizeId(id) + "_HV");
                    hvEnd.addProperty(RDF.type, model.createResource(cimNamespace + "PowerTransformerEnd"));
                    hvEnd.addProperty(model.createProperty(cimNamespace + "PowerTransformerEnd.PowerTransformer"), trafo);
                    hvEnd.addLiteral(model.createProperty(cimNamespace + "PowerTransformerEnd.ratedS"),
                            Double.parseDouble(ratedS));
                } catch (NumberFormatException e) {
                    log.warn("Invalid rated power value: {}", ratedS);
                }
            }

            Resource terminal1 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1");
            terminal1.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
            terminal1.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), trafo);
            terminal1.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 1);

            if (hvBus != null && !hvBus.isEmpty()) {
                String cn1Id = sanitizeId(hvBus) + "_CN";
                Resource cn1 = model.getResource(BASE_URI + "ConnectivityNode/" + cn1Id);
                if (cn1 == null || !cn1.hasProperty(RDF.type)) {
                    cn1 = model.createResource(BASE_URI + "ConnectivityNode/" + cn1Id);
                    cn1.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
                }
                terminal1.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn1);
                log.info("Connected transformer {} HV terminal to ConnectivityNode {} (bus: {})", id, cn1Id, hvBus);
            } else {
                log.warn("Transformer {} has no HV bus specified", id);
            }

            Resource terminal2 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T2");
            terminal2.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
            terminal2.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), trafo);
            terminal2.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 2);

            if (lvBus != null && !lvBus.isEmpty()) {
                String cn2Id = sanitizeId(lvBus) + "_CN";
                Resource cn2 = model.getResource(BASE_URI + "ConnectivityNode/" + cn2Id);
                if (cn2 == null || !cn2.hasProperty(RDF.type)) {
                    cn2 = model.createResource(BASE_URI + "ConnectivityNode/" + cn2Id);
                    cn2.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
                }
                terminal2.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn2);
                log.info("Connected transformer {} LV terminal to ConnectivityNode {} (bus: {})", id, cn2Id, lvBus);
            } else {
                log.warn("Transformer {} has no LV bus specified", id);
            }

            count++;
        }

        return count;
    }

    private int importGenerators(Sheet sheet, Model model) {
        log.debug("Importing generators from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        int count = 0;

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String p = getCellValue(row, columns.getOrDefault("p", columns.getOrDefault("mw", -1)));
            String maxP = getCellValue(row, columns.getOrDefault("max_p", columns.getOrDefault("pmax", -1)));
            String minP = getCellValue(row, columns.getOrDefault("min_p", columns.getOrDefault("pmin", -1)));
            String bus = getCellValue(row, columns.getOrDefault("bus", columns.getOrDefault("node", -1)));

            log.debug("Generator row {}: id={}, bus={}, p={}, maxP={}", i, id, bus, p, maxP);

            if (id == null || id.isEmpty()) {
                id = "GEN_" + i;
            }

            Resource genUnit = model.createResource(BASE_URI + "GeneratingUnit/" + sanitizeId(id));
            genUnit.addProperty(RDF.type, model.createResource(cimNamespace + "GeneratingUnit"));

            if (name != null && !name.isEmpty()) {
                genUnit.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            if (maxP != null && !maxP.isEmpty()) {
                try {
                    genUnit.addLiteral(model.createProperty(cimNamespace + "GeneratingUnit.maxOperatingP"),
                            Double.parseDouble(maxP));
                } catch (NumberFormatException e) {
                    log.warn("Invalid maxP value: {}", maxP);
                }
            }

            if (minP != null && !minP.isEmpty()) {
                try {
                    genUnit.addLiteral(model.createProperty(cimNamespace + "GeneratingUnit.minOperatingP"),
                            Double.parseDouble(minP));
                } catch (NumberFormatException e) {
                    log.warn("Invalid minP value: {}", minP);
                }
            }

            Resource syncMachine = model.createResource(BASE_URI + "SynchronousMachine/" + sanitizeId(id) + "_SM");
            syncMachine.addProperty(RDF.type, model.createResource(cimNamespace + "SynchronousMachine"));
            syncMachine.addProperty(model.createProperty(cimNamespace + "RotatingMachine.GeneratingUnit"), genUnit);

            // Prefer explicit "p" field, fall back to maxP as the active power value
            String activePower = (p != null && !p.isEmpty()) ? p : maxP;
            if (activePower != null && !activePower.isEmpty()) {
                try {
                    syncMachine.addLiteral(model.createProperty(cimNamespace + "RotatingMachine.p"),
                            Double.parseDouble(activePower));
                } catch (NumberFormatException e) {
                    log.warn("Invalid active power value: {}", activePower);
                }
            }

            Resource terminal = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1");
            terminal.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
            terminal.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), syncMachine);
            terminal.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 1);

            if (bus != null && !bus.isEmpty()) {
                String cnId = sanitizeId(bus) + "_CN";
                Resource cn = model.getResource(BASE_URI + "ConnectivityNode/" + cnId);

                if (cn == null || !cn.hasProperty(RDF.type)) {
                    cn = model.createResource(BASE_URI + "ConnectivityNode/" + cnId);
                    cn.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
                    log.debug("Created ConnectivityNode: {}", cnId);
                }

                terminal.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn);
                log.info("Connected generator {} (P={} MW) to ConnectivityNode {} (bus: {})",
                        id, activePower != null ? activePower : "N/A", cn.getLocalName(), bus);
            } else {
                log.warn("Generator {} has no bus specified - will not be connected to network", id);
            }

            count++;
        }

        return count;
    }

    private int importLoads(Sheet sheet, Model model) {
        log.debug("Importing loads from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        int count = 0;

        // Detect if the p column has kWh/year unit (annual energy → convert to MW average)
        boolean pIsKwhPerYear = false;
        Integer pColIdx = columns.containsKey("p") ? columns.get("p") : (columns.containsKey("mw") ? columns.get("mw") : null);
        if (pColIdx != null && pColIdx >= 0) {
            Row headerRow = sheet.getRow(0);
            String rawPHeader = headerRow != null ? getCellValue(headerRow, pColIdx) : null;
            if (rawPHeader != null) {
                String lh = rawPHeader.toLowerCase();
                pIsKwhPerYear = lh.contains("kwh/a") || lh.contains("kwh/year") || lh.contains("kwha");
                if (pIsKwhPerYear) {
                    log.info("Load p column '{}' is in kWh/year - will convert to MW (÷8760000)", rawPHeader);
                }
            }
        }

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String p = getCellValue(row, columns.getOrDefault("p", columns.getOrDefault("mw", -1)));
            String q = getCellValue(row, columns.getOrDefault("q", columns.getOrDefault("mvar", -1)));
            String bus = getCellValue(row, columns.getOrDefault("bus", columns.getOrDefault("node", -1)));

            log.debug("Load row {}: id={}, bus={}, p={}, q={}", i, id, bus, p, q);

            if (id == null || id.isEmpty()) {
                id = "LOAD_" + i;
            }

            Resource load = model.createResource(BASE_URI + "EnergyConsumer/" + sanitizeId(id));
            load.addProperty(RDF.type, model.createResource(cimNamespace + "EnergyConsumer"));

            if (name != null && !name.isEmpty()) {
                load.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            if (p != null && !p.isEmpty()) {
                try {
                    double pValue = Double.parseDouble(p);
                    if (pIsKwhPerYear) {
                        // kWh/year → average kW → MW: divide by 8760 h/year × 1000 kW/MW
                        pValue = pValue / 8_760_000.0;
                    }
                    load.addLiteral(model.createProperty(cimNamespace + "EnergyConsumer.p"), pValue);
                } catch (NumberFormatException e) {
                    log.warn("Invalid P value: {}", p);
                }
            }

            if (q != null && !q.isEmpty()) {
                try {
                    load.addLiteral(model.createProperty(cimNamespace + "EnergyConsumer.q"),
                            Double.parseDouble(q));
                } catch (NumberFormatException e) {
                    log.warn("Invalid Q value: {}", q);
                }
            }

            Resource terminal = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1");
            terminal.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
            terminal.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), load);
            terminal.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 1);

            if (bus != null && !bus.isEmpty()) {
                String cnId = sanitizeId(bus) + "_CN";
                Resource cn = model.getResource(BASE_URI + "ConnectivityNode/" + cnId);

                if (cn == null || !cn.hasProperty(RDF.type)) {
                    cn = model.createResource(BASE_URI + "ConnectivityNode/" + cnId);
                    cn.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
                    log.debug("Created ConnectivityNode: {}", cnId);
                }

                terminal.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn);
                log.info("Connected load {} (P={} MW, Q={} MVAr) to ConnectivityNode {} (bus: {})",
                        id, p != null ? p : "0", q != null ? q : "0", cn.getLocalName(), bus);
            } else {
                log.warn("Load {} has no bus specified - will not be connected to network", id);
            }

            count++;
        }

        return count;
    }

    private int importVoltageLevels(Sheet sheet, Model model) {
        log.debug("Importing voltage levels from sheet: {}", sheet.getSheetName());

        Map<String, Integer> columns = getColumnMapping(sheet);
        int count = 0;

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String voltage = getCellValue(row, columns.getOrDefault("voltage", -1));
            String substation = getCellValue(row, columns.getOrDefault("substation", -1));

            if (id == null || id.isEmpty()) {
                id = "VL_" + i;
            }

            Resource voltageLevel = model.createResource(BASE_URI + "VoltageLevel/" + sanitizeId(id));
            voltageLevel.addProperty(RDF.type, model.createResource(cimNamespace + "VoltageLevel"));

            if (name != null && !name.isEmpty()) {
                voltageLevel.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"),
                        model.createLiteral(name));
            }

            if (voltage != null && !voltage.isEmpty()) {
                try {
                    double voltageValue = Double.parseDouble(voltage.replaceAll("[^0-9.]", ""));
                    Resource baseVoltage = model.createResource(BASE_URI + "BaseVoltage/" + (int)voltageValue + "kV");
                    baseVoltage.addProperty(RDF.type, model.createResource(cimNamespace + "BaseVoltage"));
                    baseVoltage.addLiteral(model.createProperty(cimNamespace + "BaseVoltage.nominalVoltage"), voltageValue);

                    voltageLevel.addProperty(model.createProperty(cimNamespace + "VoltageLevel.BaseVoltage"), baseVoltage);
                } catch (NumberFormatException e) {
                    log.warn("Invalid voltage value: {}", voltage);
                }
            }

            if (substation != null && !substation.isEmpty()) {
                Resource substationRes = model.createResource(BASE_URI + "Substation/" + sanitizeId(substation));
                voltageLevel.addProperty(model.createProperty(cimNamespace + "VoltageLevel.Substation"), substationRes);
            }

            count++;
        }

        return count;
    }

    private void createLineTerminals(Model model, Resource line, String lineId, String fromBus, String toBus) {
        Resource terminal1 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(lineId) + "_T1");
        terminal1.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
        terminal1.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), line);
        terminal1.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 1);

        if (fromBus != null && !fromBus.isEmpty()) {
            String cn1Id = sanitizeId(fromBus) + "_CN";
            Resource cn1 = model.getResource(BASE_URI + "ConnectivityNode/" + cn1Id);

            if (cn1 == null || !cn1.hasProperty(RDF.type)) {
                cn1 = model.createResource(BASE_URI + "ConnectivityNode/" + cn1Id);
                cn1.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
                log.debug("Created ConnectivityNode: {}", cn1Id);
            }

            terminal1.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn1);
            log.debug("Connected line {} terminal 1 to ConnectivityNode {} (bus: {})", lineId, cn1.getLocalName(), fromBus);
        } else {
            log.warn("Line {} has no 'from' bus specified", lineId);
        }

        Resource terminal2 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(lineId) + "_T2");
        terminal2.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
        terminal2.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), line);
        terminal2.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 2);

        if (toBus != null && !toBus.isEmpty()) {
            String cn2Id = sanitizeId(toBus) + "_CN";
            Resource cn2 = model.getResource(BASE_URI + "ConnectivityNode/" + cn2Id);

            if (cn2 == null || !cn2.hasProperty(RDF.type)) {
                cn2 = model.createResource(BASE_URI + "ConnectivityNode/" + cn2Id);
                cn2.addProperty(RDF.type, model.createResource(cimNamespace + "ConnectivityNode"));
                log.debug("Created ConnectivityNode: {}", cn2Id);
            }

            terminal2.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"), cn2);
            log.debug("Connected line {} terminal 2 to ConnectivityNode {} (bus: {})", lineId, cn2.getLocalName(), toBus);
        } else {
            log.warn("Line {} has no 'to' bus specified", lineId);
        }
    }

    /**
     * Detects the type of a sheet by name keywords first, then by column headers as fallback.
     */
    private String detectSheetType(String sheetNameLower, Sheet sheet) {
        // Name-based detection (expanded with German, Dutch, Spanish, Italian variants)
        if (sheetNameLower.matches(".*\\b(substation|substat|umspannwerk|umspannstation|substatie|unterwerk|station)\\b.*"))
            return "substation";
        if (sheetNameLower.matches(".*\\b(bus|buses|busbar|sammelschiene|knooppunt|sbarra)\\b.*"))
            return "bus";
        if (sheetNameLower.matches(".*\\b(line|lines|leitung|leitungen|linie|linies|lijn|linea|lineas)\\b.*"))
            return "line";
        if (sheetNameLower.matches(".*\\b(transformer|transformers|transfo|transformateur|transformateurs|trafo|trafos|transformator)\\b.*"))
            return "transformer";
        if (sheetNameLower.matches(".*\\b(generator|generators|gen|generation|generateur|generateurs|erzeuger|erzeugung|centrale)\\b.*"))
            return "generator";
        if (sheetNameLower.matches(".*\\b(load|loads|last|lasten|verbruik|carga)\\b.*"))
            return "load";
        if (sheetNameLower.matches(".*\\b(voltage|spannungsebene|spannung|spanning|voltaje)\\b.*"))
            return "voltage";

        // Column-header-based fallback detection
        Map<String, Integer> cols = getColumnMapping(sheet);

        // PyPSA/pandapower transformer: has v0 AND v1 (HV and LV voltages) + bus0 + bus1
        boolean hasPypsaTransformerCols = (cols.containsKey("v0") || cols.containsKey("v_nom"))
                && cols.containsKey("v1") && cols.containsKey("bus0") && cols.containsKey("bus1");
        if (hasPypsaTransformerCols) return "transformer";

        // PyPSA/pandapower consumer: has demand_power or profile column
        if (cols.containsKey("demand_power") || cols.containsKey("demandpower")
                || cols.containsKey("profile") || cols.containsKey("london_data"))
            return "load";

        // PyPSA/pandapower nodes (buses): has id_, v_nom, type (no bus0/bus1 from-to)
        if ((cols.containsKey("v_nom") || cols.containsKey("vnom")) && cols.containsKey("id_")
                && !cols.containsKey("bus0") && !cols.containsKey("bus1"))
            return "bus";

        if (cols.containsKey("hv_bus") || cols.containsKey("lv_bus") || cols.containsKey("rated_s")
                || cols.containsKey("hvbus") || cols.containsKey("lvbus") || cols.containsKey("rateds"))
            return "transformer";
        if (cols.containsKey("max_p") || cols.containsKey("min_p") || cols.containsKey("maxp")
                || cols.containsKey("minp") || cols.containsKey("pmax") || cols.containsKey("pmin"))
            return "generator";
        if (cols.containsKey("from") || cols.containsKey("to") || cols.containsKey("from_bus")
                || cols.containsKey("to_bus")
                || cols.containsKey("von") || cols.containsKey("nach"))
            return "line";
        // PyPSA/pandapower lines: bus0 + bus1 + length (after aliasing bus0→from already done but raw check)
        if (cols.containsKey("bus0") && cols.containsKey("bus1"))
            return "line";
        if (cols.containsKey("substation") || cols.containsKey("region"))
            return (cols.containsKey("voltage") || cols.containsKey("spannung"))
                    ? "bus" : "substation";
        if ((cols.containsKey("p") || cols.containsKey("mw")) && cols.containsKey("bus"))
            return "load";
        if (cols.containsKey("bus") || cols.containsKey("voltage"))
            return "bus";

        return null; // unrecognized
    }

    private Map<String, Integer> getColumnMapping(Sheet sheet) {
        Map<String, Integer> mapping = new HashMap<>();
        Row headerRow = sheet.getRow(0);

        if (headerRow == null) {
            log.warn("No header row found in sheet: {}", sheet.getSheetName());
            return mapping;
        }

        // Alias map: many column names → canonical key used in import methods
        Map<String, String> ALIASES = new HashMap<>();
        // ID aliases
        ALIASES.put("identifier", "id"); ALIASES.put("key", "id"); ALIASES.put("uuid", "id");
        ALIASES.put("code", "id"); ALIASES.put("nummer", "id"); 
        // PyPSA/pandapower: id_ (trailing underscore) → id
        ALIASES.put("id_", "id");
        // Name aliases
        ALIASES.put("bezeichnung", "name"); ALIASES.put("beschreibung", "name");
        ALIASES.put("label", "name"); ALIASES.put("title", "name"); ALIASES.put("bezeichner", "name");
        // Region aliases
        ALIASES.put("area", "region"); ALIASES.put("zone", "region"); ALIASES.put("gebiet", "region");
        ALIASES.put("bereich", "region"); ALIASES.put("region", "region");
        // Voltage aliases
        ALIASES.put("spannung", "voltage"); ALIASES.put("kv", "voltage");
        ALIASES.put("nominal_voltage", "voltage"); ALIASES.put("nominalvoltage", "voltage");
        ALIASES.put("base_voltage", "voltage"); ALIASES.put("basevoltage", "voltage");
        ALIASES.put("vn_kv", "voltage"); ALIASES.put("vnom", "voltage");
        // PyPSA/pandapower: v_nom → voltage
        ALIASES.put("v_nom", "voltage"); ALIASES.put("vnom_kv", "voltage"); ALIASES.put("v0", "voltage");
        // Substation aliases
        ALIASES.put("umspannwerk", "substation");
        ALIASES.put("substationid", "substation"); ALIASES.put("station", "substation");
        // Bus aliases
        ALIASES.put("node", "bus"); ALIASES.put("busbar", "bus");
        ALIASES.put("sammelschiene", "bus"); ALIASES.put("knotenpunkt", "bus");
        // PyPSA/pandapower: bus0 → bus (primary bus for loads/consumers)
        ALIASES.put("bus0", "bus");
        // From/To bus aliases
        ALIASES.put("from_bus", "from"); ALIASES.put("frombus", "from"); ALIASES.put("bus_from", "from");
        ALIASES.put("von", "from"); ALIASES.put("start", "from");
        ALIASES.put("startbus", "from"); ALIASES.put("startnode", "from");
        ALIASES.put("to_bus", "to"); ALIASES.put("tobus", "to"); ALIASES.put("bus_to", "to");
        ALIASES.put("nach", "to"); ALIASES.put("end", "to");
        ALIASES.put("endbus", "to"); ALIASES.put("endnode", "to");
        // PyPSA/pandapower: bus1 → to (second bus for lines)
        ALIASES.put("bus1", "to");
        // Line parameters
        ALIASES.put("laenge", "length"); ALIASES.put("len", "length");
        ALIASES.put("resistance", "r"); ALIASES.put("reactance", "x");
        // Transformer HV/LV bus
        ALIASES.put("hv_bus", "hv_bus"); ALIASES.put("hvbus", "hv_bus"); ALIASES.put("bus_hv", "hv_bus");
        ALIASES.put("high_voltage_bus", "hv_bus"); ALIASES.put("os_bus", "hv_bus");
        ALIASES.put("lv_bus", "lv_bus"); ALIASES.put("lvbus", "lv_bus"); ALIASES.put("bus_lv", "lv_bus");
        ALIASES.put("low_voltage_bus", "lv_bus"); ALIASES.put("us_bus", "lv_bus");
        ALIASES.put("rated_s", "rated_s"); ALIASES.put("rateds", "rated_s");
        ALIASES.put("sn_mva", "rated_s"); ALIASES.put("snmva", "rated_s"); ALIASES.put("mva", "rated_s");
        // PyPSA/pandapower: s_nom → rated_s
        ALIASES.put("s_nom", "rated_s"); ALIASES.put("snom", "rated_s");
        // Generator power
        ALIASES.put("max_p", "max_p"); ALIASES.put("maxp", "max_p"); ALIASES.put("pmax", "max_p");
        ALIASES.put("p_max_mw", "max_p"); ALIASES.put("pmaxmw", "max_p"); ALIASES.put("max_mw", "max_p");
        ALIASES.put("min_p", "min_p"); ALIASES.put("minp", "min_p"); ALIASES.put("pmin", "min_p");
        ALIASES.put("p_min_mw", "min_p"); ALIASES.put("pminmw", "min_p"); ALIASES.put("min_mw", "min_p");
        ALIASES.put("p_mw", "p"); ALIASES.put("pmw", "p"); ALIASES.put("active_power", "p");
        ALIASES.put("mw", "p"); ALIASES.put("activepuissance", "p");
        // PyPSA/pandapower: demand_power → p (annual demand kWh → treat as p in kW)
        ALIASES.put("demand_power", "p"); ALIASES.put("demandpower", "p");
        ALIASES.put("q_mvar", "q"); ALIASES.put("qmvar", "q"); ALIASES.put("reactive_power", "q");
        ALIASES.put("mvar", "q"); ALIASES.put("reactivepuissance", "q");

        log.debug("Reading header row from sheet: {}", sheet.getSheetName());
        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            Cell cell = headerRow.getCell(i);
            if (cell != null) {
                String rawValue = getCellValue(headerRow, i);
                if (rawValue != null && !rawValue.isEmpty()) {
                    String name = rawValue.toLowerCase().trim()
                            .replaceAll("\\s*\\([^)]*\\)", "")  // strip unit annotations: (kV), (kWh/a), (Ohm/km), etc.
                            .replaceAll("\\s+", "_")
                            .replaceAll("[^a-z0-9_]", "")
                            .replaceAll("_+", "_")
                            .replaceAll("^_|_$", "");
                    if (name.isEmpty()) continue;
                    mapping.put(name, i);
                    // Also map without underscores for flexible header matching
                    String nameNoUnderscore = name.replace("_", "");
                    if (!nameNoUnderscore.equals(name)) {
                        mapping.put(nameNoUnderscore, i);
                    }
                    // Apply alias mappings so callers get canonical keys
                    String canonical = ALIASES.get(name);
                    if (canonical != null && !mapping.containsKey(canonical)) {
                        mapping.put(canonical, i);
                    }
                    String canonicalNoUnderscore = ALIASES.get(nameNoUnderscore);
                    if (canonicalNoUnderscore != null && !mapping.containsKey(canonicalNoUnderscore)) {
                        mapping.put(canonicalNoUnderscore, i);
                    }
                    log.trace("Mapped column '{}' (normalized: '{}') to index {}", rawValue, name, i);
                }
            }
        }

        log.info("Column mapping for sheet '{}': {} columns found - {}",
                sheet.getSheetName(), mapping.size(), mapping.keySet());
        return mapping;
    }

    private String getCellValue(Row row, int colIndex) {
        if (colIndex < 0 || row == null) return null;

        Cell cell = row.getCell(colIndex);
        if (cell == null) return null;

        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> {
                double value = cell.getNumericCellValue();
                if (value == (long) value) {
                    yield String.valueOf((long) value);
                } else {
                    yield String.valueOf(value);
                }
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield String.valueOf(cell.getNumericCellValue());
                } catch (Exception e) {
                    yield cell.getStringCellValue();
                }
            }
            default -> null;
        };
    }

    private boolean isRowEmpty(Row row) {
        if (row == null) return true;

        for (int i = 0; i < row.getLastCellNum(); i++) {
            Cell cell = row.getCell(i);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                String value = getCellValue(row, i);
                if (value != null && !value.isEmpty()) {
                    return false;
                }
            }
        }
        return true;
    }

    private String sanitizeId(String id) {
        if (id == null) return "unknown";
        return id.replaceAll("[^a-zA-Z0-9_-]", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Excel Analysis - returns sheet structure without importing
    // ─────────────────────────────────────────────────────────────────────

    public ExcelAnalysis analyzeExcel(MultipartFile file) throws IOException {
        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            List<SheetAnalysis> sheets = new ArrayList<>();
            Map<String, String> allAliases = buildAliasMap();

            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                Sheet sheet = workbook.getSheetAt(i);
                String sheetName = sheet.getSheetName();
                String detected = detectSheetType(sheetName.toLowerCase().trim(), sheet);

                Row headerRow = sheet.getRow(0);
                List<String> rawColumns = new ArrayList<>();
                Map<String, String> recognized = new LinkedHashMap<>();
                List<String> unknown = new ArrayList<>();

                if (headerRow != null) {
                    for (int c = 0; c < headerRow.getLastCellNum(); c++) {
                        String raw = getCellValue(headerRow, c);
                        if (raw == null || raw.isBlank()) continue;
                        rawColumns.add(raw);

                        String norm = raw.toLowerCase().trim()
                                .replaceAll("\\s+", "_").replaceAll("[^a-z0-9_]", "");
                        String canonical = allAliases.getOrDefault(norm,
                                allAliases.get(norm.replace("_", "")));
                        if (canonical != null) {
                            recognized.put(raw, canonical);
                        } else if (!norm.isEmpty()) {
                            unknown.add(raw);
                        }
                    }
                }

                sheets.add(SheetAnalysis.builder()
                        .sheetName(sheetName)
                        .detectedType(detected)
                        .rawColumns(rawColumns)
                        .recognizedColumns(recognized)
                        .unknownColumns(unknown)
                        .rowCount(Math.max(0, sheet.getLastRowNum()))
                        .build());
            }

            return ExcelAnalysis.builder()
                    .fileName(file.getOriginalFilename())
                    .sheets(sheets)
                    .build();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Import with custom column mapping
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Import Excel with user-provided column mappings.
     * @param customMappings  map of sheetName → {rawColumnName → canonicalKey}
     *                        e.g. {"Lines": {"Leitungsname": "name", "Anfang": "from"}}
     */
    public ImportResult importExcelWithMapping(
            MultipartFile file,
            Map<String, Map<String, String>> customMappings) throws IOException {

        // Inject custom mappings into the alias table temporarily
        Map<String, String> extraAliases = new HashMap<>();
        if (customMappings != null) {
            customMappings.values().forEach(sheetMap ->
                    sheetMap.forEach((raw, canonical) -> {
                        String norm = raw.toLowerCase().trim()
                                .replaceAll("\\s+", "_").replaceAll("[^a-z0-9_]", "");
                        extraAliases.put(norm, canonical);
                        extraAliases.put(norm.replace("_", ""), canonical);
                    }));
        }

        // Also inject sheet-type overrides if provided
        Map<String, String> sheetTypeOverrides = new HashMap<>();
        if (customMappings != null) {
            customMappings.forEach((sheetName, colMap) -> {
                String typeHint = colMap.remove("__sheet_type__");
                if (typeHint != null) sheetTypeOverrides.put(sheetName.toLowerCase(), typeHint);
            });
        }

        return importExcelInternal(file, extraAliases, sheetTypeOverrides);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal import with optional extra aliases / sheet-type overrides
    // ─────────────────────────────────────────────────────────────────────

    private ImportResult importExcelInternal(
            MultipartFile file,
            Map<String, String> extraAliases,
            Map<String, String> sheetTypeOverrides) throws IOException {

        log.info("Importing Excel file (with custom mapping): {}", file.getOriginalFilename());
        long startTime = System.currentTimeMillis();

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Model model = ModelFactory.createDefaultModel();
            model.setNsPrefix("cim", cimNamespace);
            model.setNsPrefix("rdf", RDF.getURI());
            model.setNsPrefix("rdfs", RDFS.getURI());

            int totalEntities = 0;
            List<String> importedSheets = new ArrayList<>();
            List<String> errors = new ArrayList<>();

            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                Sheet sheet = workbook.getSheetAt(i);
                String sheetName = sheet.getSheetName();
                String sheetNameLower = sheetName.toLowerCase().trim();

                try {
                    long triplesBefore = model.size();
                    String detectedType = sheetTypeOverrides.containsKey(sheetNameLower)
                            ? sheetTypeOverrides.get(sheetNameLower)
                            : detectSheetType(sheetNameLower, sheet);

                    if (detectedType == null) {
                        log.warn("Skipping unrecognized sheet: '{}'", sheetName);
                        continue;
                    }

                    // Build augmented column mapping
                    Map<String, Integer> colMap = getColumnMappingWithExtras(sheet, extraAliases);

                    int count = switch (detectedType) {
                        case "substation"  -> importSubstationsWithMap(sheet, model, colMap);
                        case "bus"         -> importBusesWithMap(sheet, model, colMap);
                        case "line"        -> importLinesWithMap(sheet, model, colMap);
                        case "transformer" -> importTransformersWithMap(sheet, model, colMap);
                        case "generator"   -> importGeneratorsWithMap(sheet, model, colMap);
                        case "load"        -> importLoadsWithMap(sheet, model, colMap);
                        case "voltage"     -> importVoltageLevels(sheet, model);
                        default -> 0;
                    };

                    if (count > 0) {
                        totalEntities += count;
                        importedSheets.add(sheetName + " (" + count + " entities)");
                    }
                    log.info("Sheet '{}' ({}): {} entities, {} triples added",
                            sheetName, detectedType, count, model.size() - triplesBefore);

                } catch (Exception e) {
                    String err = "Error in sheet " + sheetName + ": " + e.getMessage();
                    log.error(err, e);
                    errors.add(err);
                }
            }

            if (model.size() > 0) {
                jenaService.addModel(model);
                log.info("Added {} triples to knowledge graph", model.size());
            } else {
                errors.add("No triples were created. Check column mappings and file format.");
            }

            long elapsed = System.currentTimeMillis() - startTime;
            return ImportResult.builder()
                    .success(errors.isEmpty() && model.size() > 0)
                    .fileName(file.getOriginalFilename())
                    .entitiesImported(totalEntities)
                    .triplesCreated(model.size())
                    .sheetsProcessed(importedSheets)
                    .errors(errors)
                    .executionTimeMs(elapsed)
                    .build();
        }
    }

    /** Build column mapping with extra user-provided aliases injected. */
    private Map<String, Integer> getColumnMappingWithExtras(Sheet sheet, Map<String, String> extraAliases) {
        Map<String, Integer> mapping = new HashMap<>();
        Row headerRow = sheet.getRow(0);
        if (headerRow == null) return mapping;

        Map<String, String> aliases = buildAliasMap();
        aliases.putAll(extraAliases); // user mappings override defaults

        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            String raw = getCellValue(headerRow, i);
            if (raw == null || raw.isBlank()) continue;
            String norm = raw.toLowerCase().trim()
                    .replaceAll("\\s+", "_").replaceAll("[^a-z0-9_]", "");
            mapping.put(norm, i);
            String normNoUnd = norm.replace("_", "");
            if (!normNoUnd.equals(norm)) mapping.put(normNoUnd, i);
            String canonical = aliases.getOrDefault(norm, aliases.get(normNoUnd));
            if (canonical != null) mapping.putIfAbsent(canonical, i);
        }
        return mapping;
    }

    // ─────────────────────────────────────────────────────────────────────
    // "With map" wrappers - importX methods that accept a pre-built colMap
    // ─────────────────────────────────────────────────────────────────────

    private int importSubstationsWithMap(Sheet sheet, Model model, Map<String, Integer> columns) {
        int count = 0;
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;
            String id   = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            if (id == null || id.isEmpty()) id = "SUB_" + i;
            Resource sub = model.createResource(BASE_URI + "Substation/" + sanitizeId(id));
            sub.addProperty(RDF.type, model.createResource(cimNamespace + "Substation"));
            if (name != null && !name.isEmpty())
                sub.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"), model.createLiteral(name));
            String region = getCellValue(row, columns.getOrDefault("region", -1));
            if (region != null && !region.isEmpty()) {
                Resource r = model.createResource(BASE_URI + "SubGeographicalRegion/" + sanitizeId(region));
                r.addProperty(RDF.type, model.createResource(cimNamespace + "SubGeographicalRegion"));
                sub.addProperty(model.createProperty(cimNamespace + "Substation.Region"), r);
            }
            count++;
        }
        return count;
    }

    private int importBusesWithMap(Sheet sheet, Model model, Map<String, Integer> columns) {
        int count = 0;
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;
            String id      = getCellValue(row, columns.getOrDefault("id", 0));
            String name    = getCellValue(row, columns.getOrDefault("name", 1));
            String voltage = getCellValue(row, columns.getOrDefault("voltage", -1));
            String sub     = getCellValue(row, columns.getOrDefault("substation", -1));
            if (id == null || id.isEmpty()) id = "BUS_" + i;
            Resource bus = model.createResource(BASE_URI + "BusbarSection/" + sanitizeId(id));
            bus.addProperty(RDF.type, model.createResource(cimNamespace + "BusbarSection"));
            if (name != null && !name.isEmpty())
                bus.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"), model.createLiteral(name));
            if (voltage != null && !voltage.isEmpty()) {
                try {
                    double voltageKv = Double.parseDouble(voltage.replaceAll("[^0-9.]", ""));
                    Resource vl = model.createResource(BASE_URI + "VoltageLevel/" + sanitizeId(id) + "_VL");
                    vl.addProperty(RDF.type, model.createResource(cimNamespace + "VoltageLevel"));

                    Resource bv = model.createResource(BASE_URI + "BaseVoltage/" + (int) voltageKv + "kV");
                    bv.addProperty(RDF.type, model.createResource(cimNamespace + "BaseVoltage"));
                    bv.addLiteral(model.createProperty(cimNamespace + "BaseVoltage.nominalVoltage"), voltageKv);
                    vl.addProperty(model.createProperty(cimNamespace + "VoltageLevel.BaseVoltage"), bv);

                    bus.addProperty(model.createProperty(cimNamespace + "Equipment.EquipmentContainer"), vl);
                } catch (NumberFormatException ignored) {}
            }
            if (sub != null && !sub.isEmpty()) {
                Resource subRes = model.createResource(BASE_URI + "Substation/" + sanitizeId(sub));
                bus.addProperty(model.createProperty(cimNamespace + "Equipment.EquipmentContainer"), subRes);
            }
            count++;
        }
        return count;
    }

    private int importLinesWithMap(Sheet sheet, Model model, Map<String, Integer> columns) {
        int count = 0;
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;
            String id   = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String from = getCellValue(row, columns.getOrDefault("from", -1));
            String to   = getCellValue(row, columns.getOrDefault("to", -1));
            String r    = getCellValue(row, columns.getOrDefault("r", -1));
            String x    = getCellValue(row, columns.getOrDefault("x", -1));
            if (id == null || id.isEmpty()) id = "LINE_" + i;
            Resource line = model.createResource(BASE_URI + "ACLineSegment/" + sanitizeId(id));
            line.addProperty(RDF.type, model.createResource(cimNamespace + "ACLineSegment"));
            if (name != null && !name.isEmpty())
                line.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"), model.createLiteral(name));
            if (from != null && !from.isEmpty()) {
                Resource t1 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1");
                t1.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
                t1.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"),
                        model.createResource(BASE_URI + "ConnectivityNode/" + sanitizeId(from) + "_CN"));
                line.addProperty(model.createProperty(cimNamespace + "ConductingEquipment.Terminals"), t1);
            }
            if (to != null && !to.isEmpty()) {
                Resource t2 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T2");
                t2.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
                t2.addProperty(model.createProperty(cimNamespace + "Terminal.ConnectivityNode"),
                        model.createResource(BASE_URI + "ConnectivityNode/" + sanitizeId(to) + "_CN"));
                line.addProperty(model.createProperty(cimNamespace + "ConductingEquipment.Terminals"), t2);
            }
            try { if (r != null && !r.isEmpty()) line.addProperty(model.createProperty(cimNamespace + "ACLineSegment.r"), model.createTypedLiteral(Double.parseDouble(r))); } catch (NumberFormatException ignored) {}
            try { if (x != null && !x.isEmpty()) line.addProperty(model.createProperty(cimNamespace + "ACLineSegment.x"), model.createTypedLiteral(Double.parseDouble(x))); } catch (NumberFormatException ignored) {}
            count++;
        }
        return count;
    }

    private int importTransformersWithMap(Sheet sheet, Model model, Map<String, Integer> columns) {
        int count = 0;
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;
            String id    = getCellValue(row, columns.getOrDefault("id", 0));
            String name  = getCellValue(row, columns.getOrDefault("name", 1));
            String hvBus = getCellValue(row, columns.getOrDefault("hv_bus", -1));
            String lvBus = getCellValue(row, columns.getOrDefault("lv_bus", -1));
            String rated = getCellValue(row, columns.getOrDefault("rated_s", -1));
            if (id == null || id.isEmpty()) id = "TRAFO_" + i;
            Resource trafo = model.createResource(BASE_URI + "PowerTransformer/" + sanitizeId(id));
            trafo.addProperty(RDF.type, model.createResource(cimNamespace + "PowerTransformer"));
            if (name != null && !name.isEmpty())
                trafo.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"), model.createLiteral(name));
            if (hvBus != null && !hvBus.isEmpty()) {
                Resource w = model.createResource(BASE_URI + "PowerTransformerEnd/" + sanitizeId(id) + "_HV");
                w.addProperty(RDF.type, model.createResource(cimNamespace + "PowerTransformerEnd"));
                w.addProperty(model.createProperty(cimNamespace + "TransformerEnd.Terminal"),
                        model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1"));
                trafo.addProperty(model.createProperty(cimNamespace + "PowerTransformer.PowerTransformerEnd"), w);
            }
            if (lvBus != null && !lvBus.isEmpty()) {
                Resource w = model.createResource(BASE_URI + "PowerTransformerEnd/" + sanitizeId(id) + "_LV");
                w.addProperty(RDF.type, model.createResource(cimNamespace + "PowerTransformerEnd"));
                w.addProperty(model.createProperty(cimNamespace + "TransformerEnd.Terminal"),
                        model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T2"));
                trafo.addProperty(model.createProperty(cimNamespace + "PowerTransformer.PowerTransformerEnd"), w);
            }
            try { if (rated != null && !rated.isEmpty()) trafo.addProperty(model.createProperty(cimNamespace + "PowerTransformer.ratedS"), model.createTypedLiteral(Double.parseDouble(rated))); } catch (NumberFormatException ignored) {}
            count++;
        }
        return count;
    }

    private int importGeneratorsWithMap(Sheet sheet, Model model, Map<String, Integer> columns) {
        int count = 0;
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;
            String id   = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String maxP = getCellValue(row, columns.getOrDefault("max_p", -1));
            String minP = getCellValue(row, columns.getOrDefault("min_p", -1));
            if (id == null || id.isEmpty()) id = "GEN_" + i;
            Resource gen = model.createResource(BASE_URI + "GeneratingUnit/" + sanitizeId(id));
            gen.addProperty(RDF.type, model.createResource(cimNamespace + "GeneratingUnit"));
            if (name != null && !name.isEmpty())
                gen.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"), model.createLiteral(name));
            try { if (maxP != null && !maxP.isEmpty()) gen.addProperty(model.createProperty(cimNamespace + "GeneratingUnit.maxOperatingP"), model.createTypedLiteral(Double.parseDouble(maxP))); } catch (NumberFormatException ignored) {}
            try { if (minP != null && !minP.isEmpty()) gen.addProperty(model.createProperty(cimNamespace + "GeneratingUnit.minOperatingP"), model.createTypedLiteral(Double.parseDouble(minP))); } catch (NumberFormatException ignored) {}
            count++;
        }
        return count;
    }

    private int importLoadsWithMap(Sheet sheet, Model model, Map<String, Integer> columns) {
        int count = 0;
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;
            String id   = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", 1));
            String p    = getCellValue(row, columns.getOrDefault("p", -1));
            String q    = getCellValue(row, columns.getOrDefault("q", -1));
            if (id == null || id.isEmpty()) id = "LOAD_" + i;
            Resource load = model.createResource(BASE_URI + "EnergyConsumer/" + sanitizeId(id));
            load.addProperty(RDF.type, model.createResource(cimNamespace + "EnergyConsumer"));
            if (name != null && !name.isEmpty())
                load.addProperty(model.createProperty(cimNamespace + "IdentifiedObject.name"), model.createLiteral(name));
            try { if (p != null && !p.isEmpty()) load.addProperty(model.createProperty(cimNamespace + "EnergyConsumer.pfixed"), model.createTypedLiteral(Double.parseDouble(p))); } catch (NumberFormatException ignored) {}
            try { if (q != null && !q.isEmpty()) load.addProperty(model.createProperty(cimNamespace + "EnergyConsumer.qfixed"), model.createTypedLiteral(Double.parseDouble(q))); } catch (NumberFormatException ignored) {}
            count++;
        }
        return count;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Shared alias map (extracted so analyzeExcel can use it too)
    // ─────────────────────────────────────────────────────────────────────

    private Map<String, String> buildAliasMap() {
        Map<String, String> a = new HashMap<>();
        a.put("identifier","id"); a.put("key","id"); a.put("uuid","id"); a.put("code","id"); a.put("nummer","id");
        a.put("bezeichnung","name"); a.put("beschreibung","name"); a.put("label","name"); a.put("title","name");
        a.put("area","region"); a.put("zone","region"); a.put("gebiet","region"); a.put("bereich","region"); a.put("region","region");
        a.put("spannung","voltage"); a.put("kv","voltage"); a.put("nominal_voltage","voltage");
        a.put("base_voltage","voltage"); a.put("vn_kv","voltage"); a.put("vnom","voltage"); a.put("nominalvoltage","voltage"); a.put("basevoltage","voltage");
        a.put("umspannwerk","substation"); a.put("substationid","substation"); a.put("station","substation");
        a.put("node","bus"); a.put("busbar","bus"); a.put("sammelschiene","bus"); a.put("knotenpunkt","bus");
        a.put("from_bus","from"); a.put("frombus","from"); a.put("bus_from","from"); a.put("von","from"); a.put("start","from"); a.put("startbus","from");
        a.put("to_bus","to"); a.put("tobus","to"); a.put("bus_to","to"); a.put("nach","to"); a.put("end","to"); a.put("endbus","to");
        a.put("laenge","length"); a.put("len","length"); a.put("resistance","r"); a.put("reactance","x");
        a.put("hv_bus","hv_bus"); a.put("hvbus","hv_bus"); a.put("bus_hv","hv_bus"); a.put("os_bus","hv_bus"); a.put("high_voltage_bus","hv_bus");
        a.put("lv_bus","lv_bus"); a.put("lvbus","lv_bus"); a.put("bus_lv","lv_bus"); a.put("us_bus","lv_bus"); a.put("low_voltage_bus","lv_bus");
        a.put("rated_s","rated_s"); a.put("rateds","rated_s"); a.put("sn_mva","rated_s"); a.put("snmva","rated_s"); a.put("mva","rated_s");
        a.put("max_p","max_p"); a.put("maxp","max_p"); a.put("pmax","max_p"); a.put("p_max_mw","max_p"); a.put("max_mw","max_p");
        a.put("min_p","min_p"); a.put("minp","min_p"); a.put("pmin","min_p"); a.put("p_min_mw","min_p"); a.put("min_mw","min_p");
        a.put("p_mw","p"); a.put("pmw","p"); a.put("active_power","p"); a.put("mw","p");
        a.put("q_mvar","q"); a.put("qmvar","q"); a.put("reactive_power","q"); a.put("mvar","q");
        return a;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Data classes
    // ─────────────────────────────────────────────────────────────────────

    @lombok.Builder @lombok.Data
    public static class ExcelAnalysis {
        private String fileName;
        private List<SheetAnalysis> sheets;
    }

    @lombok.Builder @lombok.Data
    public static class SheetAnalysis {
        private String sheetName;
        private String detectedType;
        private List<String> rawColumns;
        private Map<String, String> recognizedColumns;  // raw → canonical
        private List<String> unknownColumns;
        private int rowCount;
    }

    @lombok.Builder
    @lombok.Data
    public static class ImportResult {
        private boolean success;
        private String fileName;
        private int entitiesImported;
        private long triplesCreated;
        private List<String> sheetsProcessed;
        private List<String> errors;
        private long executionTimeMs;
    }
}
