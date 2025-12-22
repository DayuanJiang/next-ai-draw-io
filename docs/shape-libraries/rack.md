# rack

**Type:** mxgraph shapes
**Prefix:** `mxgraph.rack`

## Usage

```xml
<mxCell value="label" style="shape=mxgraph.rack.f5.arx_500;strokeColor=#666666;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="200" height="30" as="geometry" />
</mxCell>
```

Shapes are organized by vendor: `mxgraph.rack.{vendor}.{model}`

## Vendors

### F5

- `arx_500`
- `big_ip_1600`
- `big_ip_2000`
- `big_ip_4000`

### Dell

- `dell_poweredge_1u`
- `poweredge_630`
- `poweredge_730`

### HPE Aruba

HPE Aruba shapes have subcategories: `mxgraph.rack.hpe_aruba.{category}.{model}`

**gateways_controllers:**
- `aruba_7010_mobility_controller_front`
- `aruba_7010_mobility_controller_rear`
- `aruba_7024_mobility_controller_front`
- `aruba_7205_mobility_controller_front`

**security:**
- `aruba_clearpass_c1000_front`
- `aruba_clearpass_c2000_front`
- `aruba_clearpass_c3000_front`

**switches:**
- `j9772a_2530_48g_poeplus_switch`
- `j9773a_2530_24g_poeplus_switch`
- `jl253a_aruba_2930f_24g_4sfpplus_switch`

### General (rackGeneral)

Use `mxgraph.rackGeneral.{shape}` for generic rack items:
- `rackCabinet3`
- `plate`

(See draw.io Rack shape library for complete list)
