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

                    if (sheetNameLower.contains("substation") || sheetNameLower.contains("poste")) {
                        log.info("Detected as Substations sheet");
                        count = importSubstations(sheet, model);
                    } else if (sheetNameLower.contains("bus") || sheetNameLower.contains("noeud") || sheetNameLower.contains("jeu")) {
                        log.info("Detected as Buses sheet");
                        count = importBuses(sheet, model);
                    } else if (sheetNameLower.contains("line") || sheetNameLower.contains("ligne")) {
                        log.info("Detected as Lines sheet");
                        count = importLines(sheet, model);
                    } else if (sheetNameLower.contains("transformer") || sheetNameLower.contains("transfo")) {
                        log.info("Detected as Transformers sheet");
                        count = importTransformers(sheet, model);
                    } else if (sheetNameLower.contains("generator") || sheetNameLower.contains("generateur") || sheetNameLower.contains("production")) {
                        log.info("Detected as Generators sheet");
                        count = importGenerators(sheet, model);
                    } else if (sheetNameLower.contains("load") || sheetNameLower.contains("charge") || sheetNameLower.contains("consommation")) {
                        log.info("Detected as Loads sheet");
                        count = importLoads(sheet, model);
                    } else if (sheetNameLower.contains("voltage") || sheetNameLower.contains("tension")) {
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
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));

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
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));
            String voltage = getCellValue(row, columns.getOrDefault("voltage", columns.getOrDefault("tension", -1)));
            String substation = getCellValue(row, columns.getOrDefault("substation", columns.getOrDefault("poste", -1)));

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
                Resource voltageLevel = model.createResource(BASE_URI + "VoltageLevel/" + sanitizeId(voltage) + "kV");
                voltageLevel.addProperty(RDF.type, model.createResource(cimNamespace + "VoltageLevel"));
                bus.addProperty(model.createProperty(cimNamespace + "Equipment.EquipmentContainer"), voltageLevel);
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
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));
            String fromBus = getCellValue(row, columns.getOrDefault("from", columns.getOrDefault("de", columns.getOrDefault("from_bus", -1))));
            String toBus = getCellValue(row, columns.getOrDefault("to", columns.getOrDefault("vers", columns.getOrDefault("to_bus", -1))));
            String length = getCellValue(row, columns.getOrDefault("length", columns.getOrDefault("longueur", -1)));
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
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));
            String hvBus = getCellValue(row, columns.getOrDefault("hv_bus", columns.getOrDefault("ht", -1)));
            String lvBus = getCellValue(row, columns.getOrDefault("lv_bus", columns.getOrDefault("bt", -1)));
            String ratedS = getCellValue(row, columns.getOrDefault("rated_s", columns.getOrDefault("puissance", -1)));

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

            if (hvBus != null && !hvBus.isEmpty()) {
                Resource terminal1 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T1");
                terminal1.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
                terminal1.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), trafo);
                terminal1.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 1);
            }

            if (lvBus != null && !lvBus.isEmpty()) {
                Resource terminal2 = model.createResource(BASE_URI + "Terminal/" + sanitizeId(id) + "_T2");
                terminal2.addProperty(RDF.type, model.createResource(cimNamespace + "Terminal"));
                terminal2.addProperty(model.createProperty(cimNamespace + "Terminal.ConductingEquipment"), trafo);
                terminal2.addLiteral(model.createProperty(cimNamespace + "Terminal.sequenceNumber"), 2);
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
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));
            String p = getCellValue(row, columns.getOrDefault("p", columns.getOrDefault("mw", -1)));
            String maxP = getCellValue(row, columns.getOrDefault("max_p", columns.getOrDefault("pmax", -1)));
            String minP = getCellValue(row, columns.getOrDefault("min_p", columns.getOrDefault("pmin", -1)));
            String bus = getCellValue(row, columns.getOrDefault("bus", columns.getOrDefault("noeud", columns.getOrDefault("node", -1))));

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

        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null || isRowEmpty(row)) continue;

            String id = getCellValue(row, columns.getOrDefault("id", 0));
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));
            String p = getCellValue(row, columns.getOrDefault("p", columns.getOrDefault("mw", -1)));
            String q = getCellValue(row, columns.getOrDefault("q", columns.getOrDefault("mvar", -1)));
            String bus = getCellValue(row, columns.getOrDefault("bus", columns.getOrDefault("noeud", columns.getOrDefault("node", -1))));

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
                    load.addLiteral(model.createProperty(cimNamespace + "EnergyConsumer.p"),
                            Double.parseDouble(p));
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
            String name = getCellValue(row, columns.getOrDefault("name", columns.getOrDefault("nom", 1)));
            String voltage = getCellValue(row, columns.getOrDefault("voltage", columns.getOrDefault("tension", -1)));
            String substation = getCellValue(row, columns.getOrDefault("substation", columns.getOrDefault("poste", -1)));

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

    private Map<String, Integer> getColumnMapping(Sheet sheet) {
        Map<String, Integer> mapping = new HashMap<>();
        Row headerRow = sheet.getRow(0);

        if (headerRow == null) {
            log.warn("No header row found in sheet: {}", sheet.getSheetName());
            return mapping;
        }

        log.debug("Reading header row from sheet: {}", sheet.getSheetName());
        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            Cell cell = headerRow.getCell(i);
            if (cell != null) {
                String rawValue = getCellValue(headerRow, i);
                if (rawValue != null && !rawValue.isEmpty()) {
                    String name = rawValue.toLowerCase().trim()
                            .replaceAll("\\s+", "_")
                            .replaceAll("[^a-z0-9_]", "");
                    mapping.put(name, i);
                    // Also map without underscores for flexible header matching
                    String nameNoUnderscore = name.replace("_", "");
                    if (!nameNoUnderscore.equals(name)) {
                        mapping.put(nameNoUnderscore, i);
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
