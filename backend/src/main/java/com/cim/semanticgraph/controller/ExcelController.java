package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.model.ImportHistory;
import com.cim.semanticgraph.service.ExcelImportService;
import com.cim.semanticgraph.service.ImportHistoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/excel")
@RequiredArgsConstructor
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
@Tag(name = "Excel Import", description = "Import power system data from Excel files")
public class ExcelController {

    private final ExcelImportService excelImportService;
    private final ImportHistoryService importHistoryService;

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Import Excel file",
               description = "Import power system network data from an Excel file (.xlsx)")
    public ResponseEntity<ExcelImportService.ImportResult> importExcel(
            @RequestParam("file") MultipartFile file) {

        log.info("Excel import request received. File: {}, Size: {} bytes",
                file.getOriginalFilename(), file.getSize());

        String filename = file.getOriginalFilename();

        ImportHistory historyRecord = null;
        if (filename != null) {
            historyRecord = importHistoryService.addImportRecord(
                    filename,
                    file.getSize(),
                    "Excel"
            );
        }

        long startTime = System.currentTimeMillis();

        if (file.isEmpty()) {
            if (historyRecord != null) {
                importHistoryService.updateImportFailure(historyRecord.getId(), "File is empty");
            }
            return ResponseEntity.badRequest().body(
                ExcelImportService.ImportResult.builder()
                    .success(false)
                    .errors(List.of("File is empty"))
                    .build()
            );
        }

        if (filename == null || (!filename.endsWith(".xlsx") && !filename.endsWith(".xls"))) {
            if (historyRecord != null) {
                importHistoryService.updateImportFailure(historyRecord.getId(),
                        "Invalid file format. Only .xlsx and .xls files are supported");
            }
            return ResponseEntity.badRequest().body(
                ExcelImportService.ImportResult.builder()
                    .success(false)
                    .errors(List.of("Invalid file format. Only .xlsx and .xls files are supported"))
                    .build()
            );
        }

        try {
            ExcelImportService.ImportResult result = excelImportService.importExcel(file);

            long endTime = System.currentTimeMillis();
            double duration = (endTime - startTime) / 1000.0;

            if (result.isSuccess()) {
                if (historyRecord != null) {
                    importHistoryService.updateImportSuccess(
                            historyRecord.getId(),
                            result.getTriplesCreated(),
                            duration
                    );
                }

                log.info("Excel import successful. Entities: {}, Triples: {}",
                        result.getEntitiesImported(), result.getTriplesCreated());
                return ResponseEntity.ok(result);
            } else {
                if (historyRecord != null) {
                    String errorMsg = String.join("; ", result.getErrors());
                    importHistoryService.updateImportFailure(historyRecord.getId(), errorMsg);
                }

                log.warn("Excel import completed with errors: {}", result.getErrors());
                return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT).body(result);
            }

        } catch (Exception e) {
            long endTime = System.currentTimeMillis();
            double duration = (endTime - startTime) / 1000.0;

            if (historyRecord != null) {
                importHistoryService.updateImportFailure(historyRecord.getId(), e.getMessage());
            }

            log.error("Error importing Excel file", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
                ExcelImportService.ImportResult.builder()
                    .success(false)
                    .fileName(filename)
                    .errors(List.of("Import failed: " + e.getMessage()))
                    .build()
            );
        }
    }

    @GetMapping("/format")
    @Operation(summary = "Get Excel format info",
               description = "Returns information about the expected Excel file format")
    public ResponseEntity<Map<String, Object>> getFormatInfo() {
        return ResponseEntity.ok(Map.of(
            "supportedFormats", List.of(".xlsx", ".xls"),
            "maxFileSize", "100MB",
            "sheets", List.of(
                Map.of(
                    "name", "Substations",
                    "columns", List.of("id", "name", "region"),
                    "description", "Electrical substations"
                ),
                Map.of(
                    "name", "Buses",
                    "columns", List.of("id", "name", "voltage", "substation"),
                    "description", "Bus bars / Nodes"
                ),
                Map.of(
                    "name", "Lines",
                    "columns", List.of("id", "name", "from", "to", "length", "r", "x"),
                    "description", "Transmission lines"
                ),
                Map.of(
                    "name", "Transformers",
                    "columns", List.of("id", "name", "hv_bus", "lv_bus", "rated_s"),
                    "description", "Power transformers"
                ),
                Map.of(
                    "name", "Generators",
                    "columns", List.of("id", "name", "bus", "max_p", "min_p"),
                    "description", "Generating units"
                ),
                Map.of(
                    "name", "Loads",
                    "columns", List.of("id", "name", "bus", "p", "q"),
                    "description", "Energy consumers"
                ),
                Map.of(
                    "name", "Voltage Levels",
                    "columns", List.of("id", "name", "voltage", "substation"),
                    "description", "Voltage levels"
                )
            ),
            "notes", List.of(
                "First row must contain column headers",
                "Sheet names are case-insensitive",
                "Empty rows are skipped"
            )
        ));
    }

    @GetMapping("/template")
    @Operation(summary = "Get Excel template info",
               description = "Returns information about available Excel templates")
    public ResponseEntity<Map<String, Object>> getTemplate() {
        return ResponseEntity.ok(Map.of(
            "message", "Use the /excel/format endpoint to see the expected format",
            "exampleSheets", List.of(
                "Substations: id, name, region",
                "Buses: id, name, voltage, substation",
                "Lines: id, name, from, to, length, r, x",
                "Generators: id, name, bus, max_p, min_p",
                "Loads: id, name, bus, p, q"
            )
        ));
    }
}
