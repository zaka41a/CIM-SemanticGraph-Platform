import math
import hashlib
import logging
from fastapi import FastAPI, HTTPException
import pandapower as pp

from .models import (
    PowerFlowRequest,
    PowerFlowResponse,
    BusResult,
    BranchResult,
    SystemStatistics,
    Violation,
    BusType,
    BranchType,
    BusSearchRequest,
    BusSearchResponse,
)
from .converter import convert_to_pandapower
from .solver import run_power_flow
from . import semantic_bus_finder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Simple in-process result cache (keyed by MD5 of network JSON + method) ─────
_result_cache: dict[str, "PowerFlowResponse"] = {}
_MAX_CACHE = 20  # evict oldest when full


def _cache_key(request: "PowerFlowRequest") -> str:
    payload = request.network.model_dump_json() + request.method.value
    return hashlib.md5(payload.encode()).hexdigest()


def _cache_put(key: str, value: "PowerFlowResponse") -> None:
    if len(_result_cache) >= _MAX_CACHE:
        oldest = next(iter(_result_cache))
        del _result_cache[oldest]
    _result_cache[key] = value


app = FastAPI(
    title="CIM Power Flow Service",
    description="pandapower-based power flow calculation service for CIM networks",
    version="1.0.0",
)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "powerflow",
        "pandapower_version": pp.__version__,
        "semantic_search": semantic_bus_finder.is_available(),
    }


@app.post("/find-bus", response_model=BusSearchResponse)
async def find_bus(request: BusSearchRequest):
    """
    Find the best matching CIM bus for a natural language question.

    Uses Qdrant vector search (filtered to BusbarSection, TopologicalNode,
    ConnectivityNode) to return the most semantically relevant bus ID.

    Example:
        POST /find-bus
        {"question": "voltage at Berlin 380kV substation"}
        → {"found": true, "busId": "BUS_BERLIN_380", "score": 0.87, ...}
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    match = semantic_bus_finder.find_bus(request.question)

    if match:
        return BusSearchResponse(
            found=True,
            busId=match.bus_id,
            label=match.label,
            cimType=match.cim_type,
            uri=match.uri,
            score=round(match.score, 4),
            method=match.method,
            question=request.question,
            message=f"Bus '{match.label or match.bus_id}' found (score={match.score:.3f})",
        )

    # Semantic search unavailable or no match above threshold
    available = semantic_bus_finder.is_available()
    message = (
        "No bus found above similarity threshold. Try rephrasing the question."
        if available
        else "Semantic search not available — configure OPENAI_API_KEY and Qdrant."
    )
    return BusSearchResponse(
        found=False,
        question=request.question,
        message=message,
    )


@app.post("/calculate", response_model=PowerFlowResponse)
async def calculate(request: PowerFlowRequest):
    """Run power flow calculation on the provided network."""
    logger.info(
        f"Received power flow request: method={request.method}, "
        f"buses={len(request.network.buses)}, branches={len(request.network.branches)}"
    )

    if not request.network.buses:
        raise HTTPException(status_code=400, detail="Network has no buses")

    # Return cached result if the network + method are identical
    key = _cache_key(request)
    if key in _result_cache:
        logger.info("Returning cached power flow result (key=%s)", key[:8])
        return _result_cache[key]

    try:
        # Convert to pandapower network
        net, bus_mapping, branch_result_map = convert_to_pandapower(request.network)

        # Run power flow
        converged, iterations, exec_time_ms = run_power_flow(
            net, request.method, request.maxIterations, request.tolerance
        )

        # Build response
        response = build_response(
            net=net,
            bus_mapping=bus_mapping,
            branch_result_map=branch_result_map,
            network_input=request.network,
            converged=converged,
            iterations=iterations,
            exec_time_ms=exec_time_ms,
            method=request.method.value,
            tolerance=request.tolerance,
        )

        _cache_put(key, response)
        return response

    except Exception as e:
        logger.error(f"Power flow calculation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Calculation failed: {str(e)}")


@app.delete("/cache", status_code=204)
async def clear_cache():
    """Invalidate the power flow result cache (call after network data changes)."""
    _result_cache.clear()
    logger.info("Power flow cache cleared")


@app.post("/calculate/{bus_id}", response_model=PowerFlowResponse)
async def calculate_for_bus(bus_id: str, request: PowerFlowRequest):
    """Run power flow and focus results on a specific bus."""
    response = await calculate(request)
    response.targetBusId = bus_id
    return response


def build_response(
    net: pp.pandapowerNet,
    bus_mapping: dict[str, int],
    branch_result_map: dict[str, tuple[str, int]],
    network_input,
    converged: bool,
    iterations: int,
    exec_time_ms: int,
    method: str,
    tolerance: float = 1e-6,
) -> PowerFlowResponse:
    """Build the PowerFlowResponse from pandapower results."""

    # Reverse mapping: pp_idx -> original bus ID
    pp_idx_to_bus_id = {v: k for k, v in bus_mapping.items()}

    # Build bus results
    bus_results = []
    # Buses in an island with no source are returned as NaN by pandapower. They are a
    # connectivity fault, not a voltage fault, so they are tracked separately instead of
    # collapsing to 0.0 pu and producing one bogus VOLTAGE_LOW critical each.
    isolated_bus_ids: set[str] = set()
    for original_bus in network_input.buses:
        pp_idx = bus_mapping.get(original_bus.id)
        if pp_idx is None:
            continue

        if pp_idx in net.res_bus.index and _is_missing(net.res_bus.at[pp_idx, "vm_pu"]):
            isolated_bus_ids.add(original_bus.id)

        # Get results from pandapower
        vm_pu = _safe_float(net.res_bus.at[pp_idx, "vm_pu"] if pp_idx in net.res_bus.index else 1.0)
        va_deg = _safe_float(net.res_bus.at[pp_idx, "va_degree"] if pp_idx in net.res_bus.index else 0.0)
        p_mw = _safe_float(net.res_bus.at[pp_idx, "p_mw"] if pp_idx in net.res_bus.index else 0.0)
        q_mvar = _safe_float(net.res_bus.at[pp_idx, "q_mvar"] if pp_idx in net.res_bus.index else 0.0)

        vn_kv = original_bus.baseVoltageKv if original_bus.baseVoltageKv > 0 else 110.0
        v_kv = vm_pu * vn_kv

        within_limits = (
            original_bus.id not in isolated_bus_ids
            and original_bus.voltageMin <= vm_pu <= original_bus.voltageMax
        )

        bus_results.append(BusResult(
            busId=original_bus.id,
            busName=original_bus.name,
            busType=original_bus.type.value,
            voltageMagnitude=round(vm_pu, 6),
            voltageAngle=round(va_deg, 4),
            voltageKv=round(v_kv, 2),
            activePowerMw=round(p_mw, 4),
            reactivePowerMvar=round(q_mvar, 4),
            generationMw=original_bus.generationMw,
            generationMvar=original_bus.generationMvar,
            loadMw=original_bus.loadMw,
            loadMvar=original_bus.loadMvar,
            withinLimits=within_limits,
            voltagePercentage=round(vm_pu * 100, 2),
        ))

    # Build branch results using the exact pandapower element index from branch_result_map
    branch_results = []

    for branch in network_input.branches:
        mapping = branch_result_map.get(branch.id)
        from_p = from_q = to_p = to_q = pl_mw = ql_mvar = i_ka = loading = 0.0

        if mapping is not None:
            elem_type, idx = mapping
            if elem_type == "line" and idx < len(net.res_line):
                from_p  = _safe_float(net.res_line.at[idx, "p_from_mw"])
                from_q  = _safe_float(net.res_line.at[idx, "q_from_mvar"])
                to_p    = _safe_float(net.res_line.at[idx, "p_to_mw"])
                to_q    = _safe_float(net.res_line.at[idx, "q_to_mvar"])
                pl_mw   = _safe_float(net.res_line.at[idx, "pl_mw"])
                ql_mvar = _safe_float(net.res_line.at[idx, "ql_mvar"])
                i_ka    = _safe_float(net.res_line.at[idx, "i_ka"])
                loading = _safe_float(net.res_line.at[idx, "loading_percent"])
            elif elem_type == "trafo" and idx < len(net.res_trafo):
                from_p  = _safe_float(net.res_trafo.at[idx, "p_hv_mw"])
                from_q  = _safe_float(net.res_trafo.at[idx, "q_hv_mvar"])
                to_p    = _safe_float(net.res_trafo.at[idx, "p_lv_mw"])
                to_q    = _safe_float(net.res_trafo.at[idx, "q_lv_mvar"])
                pl_mw   = _safe_float(net.res_trafo.at[idx, "pl_mw"])
                ql_mvar = _safe_float(net.res_trafo.at[idx, "ql_mvar"])
                i_ka    = _safe_float(net.res_trafo.at[idx, "i_hv_ka"])
                loading = _safe_float(net.res_trafo.at[idx, "loading_percent"])

        branch_results.append(BranchResult(
            branchId=branch.id,
            branchName=branch.name,
            branchType=branch.type.value,
            fromBusId=branch.fromBusId,
            toBusId=branch.toBusId,
            fromActivePowerMw=round(from_p, 4),
            fromReactivePowerMvar=round(from_q, 4),
            toActivePowerMw=round(to_p, 4),
            toReactivePowerMvar=round(to_q, 4),
            lossActivePowerMw=round(pl_mw, 4),
            lossReactivePowerMvar=round(ql_mvar, 4),
            currentMagnitude=round(i_ka, 6),
            loadingPercentage=round(loading, 2),
            overloaded=loading > 100.0,
        ))

    # System statistics
    pv_count = sum(1 for b in network_input.buses if b.type == BusType.PV)
    pq_count = sum(1 for b in network_input.buses if b.type == BusType.PQ)
    slack_count = sum(1 for b in network_input.buses if b.type == BusType.SLACK)

    total_gen_mw = sum(b.generationMw for b in network_input.buses)
    total_gen_mvar = sum(b.generationMvar for b in network_input.buses)
    total_load_mw = sum(b.loadMw for b in network_input.buses)
    total_load_mvar = sum(b.loadMvar for b in network_input.buses)
    total_loss_mw = sum(br.lossActivePowerMw for br in branch_results)
    total_loss_mvar = sum(br.lossReactivePowerMvar for br in branch_results)
    loss_pct = (total_loss_mw / total_load_mw * 100) if total_load_mw > 0 else 0.0

    # Isolated buses carry no solved voltage, so including their placeholder 0.0 would
    # report the whole network as sitting at 0.000 pu minimum.
    energised = [br for br in bus_results if br.busId not in isolated_bus_ids]
    voltages = [br.voltageMagnitude for br in energised]
    min_v = min(voltages) if voltages else 1.0
    max_v = max(voltages) if voltages else 1.0
    avg_v = sum(voltages) / len(voltages) if voltages else 1.0

    min_v_bus = next((br.busId for br in energised if br.voltageMagnitude == min_v), "N/A")
    max_v_bus = next((br.busId for br in energised if br.voltageMagnitude == max_v), "N/A")

    statistics = SystemStatistics(
        totalBuses=len(network_input.buses),
        totalBranches=len(network_input.branches),
        pvBuses=pv_count,
        pqBuses=pq_count,
        slackBuses=slack_count,
        totalGenerationMw=round(total_gen_mw, 2),
        totalGenerationMvar=round(total_gen_mvar, 2),
        totalLoadMw=round(total_load_mw, 2),
        totalLoadMvar=round(total_load_mvar, 2),
        totalLossesMw=round(total_loss_mw, 4),
        totalLossesMvar=round(total_loss_mvar, 4),
        lossPercentage=round(loss_pct, 4),
        minVoltagePu=round(min_v, 6),
        maxVoltagePu=round(max_v, 6),
        avgVoltagePu=round(avg_v, 6),
        minVoltageBus=min_v_bus,
        maxVoltageBus=max_v_bus,
    )

    # Detect violations
    violations = []

    if isolated_bus_ids:
        sample = sorted(isolated_bus_ids)[0]
        violations.append(Violation(
            type="BUS_ISOLATED",
            severity="CRITICAL",
            elementId=sample,
            elementName=next((br.busName for br in bus_results if br.busId == sample), sample),
            actualValue=float(len(isolated_bus_ids)),
            limitValue=0.0,
            violationPercentage=round(len(isolated_bus_ids) / len(bus_results) * 100, 2)
            if bus_results else 0.0,
            description=(
                f"{len(isolated_bus_ids)} buses are in an island with no generation or slack "
                f"and were not energised by the solver"
            ),
        ))

    for br in bus_results:
        bus_input = next((b for b in network_input.buses if b.id == br.busId), None)
        if bus_input is None or br.busId in isolated_bus_ids:
            continue

        if br.voltageMagnitude < bus_input.voltageMin:
            violations.append(Violation(
                type="VOLTAGE_LOW",
                severity="CRITICAL" if br.voltageMagnitude < 0.90 else "WARNING",
                elementId=br.busId,
                elementName=br.busName,
                actualValue=br.voltageMagnitude,
                limitValue=bus_input.voltageMin,
                violationPercentage=round(
                    (bus_input.voltageMin - br.voltageMagnitude) / bus_input.voltageMin * 100, 2
                ),
                description=f"Bus voltage {br.voltageMagnitude:.3f} pu below minimum {bus_input.voltageMin:.3f} pu",
            ))
        elif br.voltageMagnitude > bus_input.voltageMax:
            violations.append(Violation(
                type="VOLTAGE_HIGH",
                severity="CRITICAL" if br.voltageMagnitude > 1.10 else "WARNING",
                elementId=br.busId,
                elementName=br.busName,
                actualValue=br.voltageMagnitude,
                limitValue=bus_input.voltageMax,
                violationPercentage=round(
                    (br.voltageMagnitude - bus_input.voltageMax) / bus_input.voltageMax * 100, 2
                ),
                description=f"Bus voltage {br.voltageMagnitude:.3f} pu exceeds maximum {bus_input.voltageMax:.3f} pu",
            ))

    for br in branch_results:
        if br.overloaded:
            violations.append(Violation(
                type="BRANCH_OVERLOAD",
                severity="CRITICAL" if br.loadingPercentage > 120 else "WARNING",
                elementId=br.branchId,
                elementName=br.branchName,
                actualValue=br.loadingPercentage,
                limitValue=100.0,
                violationPercentage=round(br.loadingPercentage - 100, 2),
                description=f"Branch loading {br.loadingPercentage:.1f}% exceeds rating",
            ))

    return PowerFlowResponse(
        converged=converged,
        iterations=iterations,
        tolerance=tolerance,
        executionTimeMs=exec_time_ms,
        calculationMethod=method,
        busResults=bus_results,
        branchResults=branch_results,
        statistics=statistics,
        violations=violations,
        networkId=network_input.networkId,
    )


def _is_missing(val) -> bool:
    """True when pandapower left a result empty, which it does for unsupplied buses."""
    if val is None:
        return True
    try:
        f = float(val)
    except (ValueError, TypeError):
        return True
    return math.isnan(f) or math.isinf(f)


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert a value to float, handling NaN and None."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default
