import pandapower as pp
import math
import logging
from .models import NetworkInput, BusType, BranchType

logger = logging.getLogger(__name__)


def convert_to_pandapower(network: NetworkInput) -> tuple[pp.pandapowerNet, dict[str, int], dict[str, tuple[str, int]]]:
    """
    Convert a CIM NetworkInput (JSON from Spring Boot) into a pandapower network.

    Returns:
        Tuple of (pandapower network, mapping from original bus ID to pandapower bus index)
    """
    # Validate that at least one slack bus exists (required for power flow convergence)
    slack_buses = [b for b in network.buses if b.type == BusType.SLACK]
    if not slack_buses:
        raise ValueError(
            "Network has no slack bus (reference bus). "
            "At least one bus must be of type SLACK for power flow calculation."
        )

    net = pp.create_empty_network(name=network.name, f_hz=50.0, sn_mva=network.baseMva)
    bus_id_to_pp_idx: dict[str, int] = {}
    # Maps branch.id -> ("line"|"trafo", pandapower element index)
    branch_result_map: dict[str, tuple[str, int]] = {}

    # --- Create buses ---
    for bus in network.buses:
        vn_kv = bus.baseVoltageKv if bus.baseVoltageKv > 0 else 110.0

        pp_idx = pp.create_bus(
            net,
            vn_kv=vn_kv,
            name=bus.name,
            in_service=bus.inService,
            min_vm_pu=bus.voltageMin,
            max_vm_pu=bus.voltageMax,
        )
        bus_id_to_pp_idx[bus.id] = pp_idx

        # Slack bus -> external grid
        if bus.type == BusType.SLACK:
            vm_pu = bus.voltageMagnitude if bus.voltageMagnitude > 0 else 1.0
            pp.create_ext_grid(
                net,
                bus=pp_idx,
                vm_pu=vm_pu,
                va_degree=bus.voltageAngle,
                name=f"ExtGrid_{bus.name}",
            )

        # PV bus -> generator (always create, even with P=0, to maintain voltage control)
        if bus.type == BusType.PV:
            vm_pu = bus.voltageMagnitude if bus.voltageMagnitude > 0 else 1.0
            pp.create_gen(
                net,
                bus=pp_idx,
                p_mw=bus.generationMw,
                vm_pu=vm_pu,
                name=f"Gen_{bus.name}",
                min_q_mvar=bus.generationMinMvar,
                max_q_mvar=bus.generationMaxMvar,
                in_service=True,
            )

        # PQ bus with generation -> static generator
        if bus.type == BusType.PQ and bus.generationMw > 0:
            pp.create_sgen(
                net,
                bus=pp_idx,
                p_mw=bus.generationMw,
                q_mvar=bus.generationMvar,
                name=f"SGen_{bus.name}",
            )

        # Loads
        if bus.loadMw > 0 or bus.loadMvar > 0:
            pp.create_load(
                net,
                bus=pp_idx,
                p_mw=bus.loadMw,
                q_mvar=bus.loadMvar,
                name=f"Load_{bus.name}",
            )

    # --- Create branches ---
    for branch in network.branches:
        from_idx = bus_id_to_pp_idx.get(branch.fromBusId)
        to_idx = bus_id_to_pp_idx.get(branch.toBusId)

        if from_idx is None or to_idx is None:
            logger.warning(
                f"Skipping branch {branch.id}: bus not found "
                f"(from={branch.fromBusId}, to={branch.toBusId})"
            )
            continue

        if branch.type == BranchType.LINE:
            from_bus = next((b for b in network.buses if b.id == branch.fromBusId), None)
            to_bus = next((b for b in network.buses if b.id == branch.toBusId), None)
            if from_bus and to_bus:
                v_ratio = max(from_bus.baseVoltageKv, to_bus.baseVoltageKv) / max(min(from_bus.baseVoltageKv, to_bus.baseVoltageKv), 1.0)
                if v_ratio > 1.5:
                    logger.warning(
                        f"Line {branch.name} connects different voltage levels "
                        f"({from_bus.baseVoltageKv}kV to {to_bus.baseVoltageKv}kV), "
                        f"converting to transformer"
                    )
                    trafo_idx = len(net.trafo)
                    _create_transformer(net, network, branch, from_idx, to_idx)
                    branch_result_map[branch.id] = ("trafo", trafo_idx)
                    continue
            line_idx = len(net.line)
            _create_line(net, network, branch, from_idx, to_idx)
            branch_result_map[branch.id] = ("line", line_idx)
        elif branch.type == BranchType.TRANSFORMER:
            trafo_idx = len(net.trafo)
            _create_transformer(net, network, branch, from_idx, to_idx)
            branch_result_map[branch.id] = ("trafo", trafo_idx)

    logger.info(
        f"Converted network: {len(net.bus)} buses, {len(net.line)} lines, "
        f"{len(net.trafo)} transformers, {len(net.gen)} generators, "
        f"{len(net.ext_grid)} ext_grids, {len(net.load)} loads, "
        f"{len(net.sgen)} sgens"
    )

    return net, bus_id_to_pp_idx, branch_result_map


def _create_line(
    net: pp.pandapowerNet,
    network: NetworkInput,
    branch,
    from_idx: int,
    to_idx: int,
):
    """
    Create a pandapower line from a CIM branch.

    Branch.resistance and Branch.reactance always arrive in per-unit on the system base
    (the CIM extractor converts the ohmic CIM values). pandapower wants physical ohms,
    so they are scaled back with Z_base = Vn^2 / baseMva and passed with length_km=1.0.
    """
    from_bus_data = next((b for b in network.buses if b.id == branch.fromBusId), None)
    vn_kv = from_bus_data.baseVoltageKv if from_bus_data and from_bus_data.baseVoltageKv > 0 else 110.0

    z_base = (vn_kv ** 2) / network.baseMva if network.baseMva > 0 else 1.0
    r_ohm = branch.resistance * z_base
    x_ohm = branch.reactance * z_base

    # Susceptance arrives per-unit; back to Siemens with Y_base = 1 / Z_base, then to C in nF
    c_nf = 0.0
    if branch.susceptance != 0 and z_base > 0:
        # B = 2*pi*f*C => C = B / (2*pi*f), then to nF
        b_siemens = abs(branch.susceptance) / z_base
        c_nf = b_siemens * 1e9 / (2 * math.pi * 50)
    else:
        # Default susceptance based on voltage level and typical line parameters
        # Typical C ≈ 10-13 nF/km for overhead lines; we estimate from impedance
        if x_ohm > 0 and vn_kv > 0:
            # Rough estimate: C ≈ 1/(X * (2*pi*f)) * typical_ratio
            c_nf = 10.0 * (vn_kv / 110.0)  # Scale with voltage level

    # Max current from rating
    max_i_ka = branch.ratingMva / (vn_kv * math.sqrt(3)) if vn_kv > 0 else 1.0

    # Ensure valid values
    if abs(x_ohm) < 1e-6:
        x_ohm = 0.001
    if abs(r_ohm) < 1e-8:
        r_ohm = 0.0001

    pp.create_line_from_parameters(
        net,
        from_bus=from_idx,
        to_bus=to_idx,
        length_km=1.0,
        r_ohm_per_km=max(r_ohm, 0.0001),
        x_ohm_per_km=max(abs(x_ohm), 0.001),
        c_nf_per_km=max(c_nf, 0.0),
        max_i_ka=max(max_i_ka, 0.001),
        name=branch.name,
        in_service=branch.inService,
    )
    logger.info(f"Line {branch.name}: R={r_ohm:.4f}Ω, X={x_ohm:.4f}Ω, C={c_nf:.1f}nF, Vn={vn_kv}kV")


def _create_transformer(
    net: pp.pandapowerNet,
    network: NetworkInput,
    branch,
    from_idx: int,
    to_idx: int,
):
    """Create a pandapower transformer from a CIM branch."""
    from_bus_data = next((b for b in network.buses if b.id == branch.fromBusId), None)
    to_bus_data = next((b for b in network.buses if b.id == branch.toBusId), None)

    from_kv = from_bus_data.baseVoltageKv if from_bus_data else 220.0
    to_kv = to_bus_data.baseVoltageKv if to_bus_data else 110.0

    hv_kv = max(from_kv, to_kv)
    lv_kv = min(from_kv, to_kv)

    # A transformer whose two ends sit at the same nominal voltage is a legitimate 1:1 unit
    # (bus coupler, phase shifter). Inventing a ratio here would contradict the bus voltages
    # pandapower already holds and makes the Jacobian singular, so the rated values are kept
    # exactly as the buses report them.

    sn_mva = branch.ratingMva if branch.ratingMva > 0 else 100.0

    # Transformer impedances arrive per-unit on the system base (baseMva), referred to the HV side.
    # pandapower expects per-unit on the transformer's own MVA base (sn_mva).
    # Convert: Z_trafo_pu = Z_sys_pu * (sn_mva / baseMva)
    r_pu = branch.resistance
    x_pu = branch.reactance
    sys_base_mva = network.baseMva if network.baseMva > 0 else 100.0

    # Re-base from system MVA to transformer MVA
    rebase = sn_mva / sys_base_mva
    r_pu_trafo = r_pu * rebase
    x_pu_trafo = x_pu * rebase

    vkr_percent = abs(r_pu_trafo) * 100
    z_pu_trafo = math.sqrt(r_pu_trafo ** 2 + x_pu_trafo ** 2)
    vk_percent = z_pu_trafo * 100

    # Ensure vk >= vkr and clamp to physically realistic range
    if vk_percent < vkr_percent:
        vk_percent = vkr_percent * 1.1
    vkr_percent = max(vkr_percent, 0.1)
    vk_percent = max(vk_percent, 0.5)
    vk_percent = min(vk_percent, 25.0)  # real transformers: 4-20%

    # Determine HV/LV bus mapping
    if from_kv >= to_kv:
        hv_bus = from_idx
        lv_bus = to_idx
    else:
        hv_bus = to_idx
        lv_bus = from_idx

    pp.create_transformer_from_parameters(
        net,
        hv_bus=hv_bus,
        lv_bus=lv_bus,
        sn_mva=sn_mva,
        vn_hv_kv=hv_kv,
        vn_lv_kv=lv_kv,
        vkr_percent=vkr_percent,
        vk_percent=vk_percent,
        pfe_kw=0,
        i0_percent=0,
        name=branch.name,
        in_service=branch.inService,
    )
