# archimate2

> ArchiMate 2.x shape library for draw.io. Uses the older `archimate` stencil prefix (pre-3.0 notation).

## Style Pattern

The ArchiMate 2 library in draw.io uses the `mxgraph.archimate` prefix (without the `3`). Shapes follow a different convention from ArchiMate 3.

**Base prefix** (always include):
```
html=1;outlineConnect=0;whiteSpace=wrap;
```

**Full elements** use dedicated shape names per layer, e.g.:
- `shape=mxgraph.archimate.business;` with `bType=` for Business layer
- `shape=mxgraph.archimate.application;` with `appType=` for Application layer
- `shape=mxgraph.archimate.tech;` with `tType=` for Technology layer
- `shape=mxgraph.archimate.motivational;` with `mType=` for Motivation elements

**Default size**: `width="150" height="75"` (varies by shape)

> **Recommendation**: For new diagrams, prefer the **archimate3** library which uses the modern ArchiMate 3.2 notation. The archimate2 library is provided for backward compatibility.

---

## Layer Colors

| Layer | Fill Color | Hex |
|-------|-----------|-----|
| Business | Light Yellow | `#FFFF99` |
| Application | Light Blue | `#80FFFF` |
| Technology | Light Green | `#80FF80` |
| Motivation | Light Purple | `#CCCCFF` |
| Implementation & Migration | Light Pink | `#FFE0E0` |

---

## Business Layer

| Element | Style |
|---------|-------|
| Business Actor | `shape=mxgraph.archimate.business;bType=actor;fillColor=#FFFF99;` |
| Business Role | `shape=mxgraph.archimate.business;bType=role;fillColor=#FFFF99;` |
| Business Collaboration | `shape=mxgraph.archimate.business;bType=collab;fillColor=#FFFF99;` |
| Business Interface | `shape=mxgraph.archimate.business;bType=interface;fillColor=#FFFF99;` |
| Business Process | `shape=mxgraph.archimate.business;bType=process;fillColor=#FFFF99;` |
| Business Function | `shape=mxgraph.archimate.business;bType=function;fillColor=#FFFF99;` |
| Business Interaction | `shape=mxgraph.archimate.business;bType=interaction;fillColor=#FFFF99;` |
| Business Event | `shape=mxgraph.archimate.business;bType=event;fillColor=#FFFF99;` |
| Business Service | `shape=mxgraph.archimate.business;bType=service;fillColor=#FFFF99;` |
| Business Object | `shape=mxgraph.archimate.business;bType=object;fillColor=#FFFF99;` |
| Contract | `shape=mxgraph.archimate.business;bType=contract;fillColor=#FFFF99;` |
| Representation | `shape=mxgraph.archimate.business;bType=representation;fillColor=#FFFF99;` |
| Product | `shape=mxgraph.archimate.business;bType=product;fillColor=#FFFF99;` |
| Location | `shape=mxgraph.archimate.business;bType=location;fillColor=#FFFF99;` |

---

## Application Layer

| Element | Style |
|---------|-------|
| Application Component | `shape=mxgraph.archimate.application;appType=comp;fillColor=#80FFFF;` |
| Application Collaboration | `shape=mxgraph.archimate.application;appType=collab;fillColor=#80FFFF;` |
| Application Interface | `shape=mxgraph.archimate.application;appType=interface;fillColor=#80FFFF;` |
| Application Function | `shape=mxgraph.archimate.application;appType=function;fillColor=#80FFFF;` |
| Application Interaction | `shape=mxgraph.archimate.application;appType=interaction;fillColor=#80FFFF;` |
| Application Service | `shape=mxgraph.archimate.application;appType=service;fillColor=#80FFFF;` |
| Data Object | `shape=mxgraph.archimate.application;appType=object;fillColor=#80FFFF;` |

---

## Technology Layer

| Element | Style |
|---------|-------|
| Node | `shape=mxgraph.archimate.tech;tType=node;fillColor=#80FF80;` |
| Device | `shape=mxgraph.archimate.tech;tType=device;fillColor=#80FF80;` |
| System Software | `shape=mxgraph.archimate.tech;tType=sysSw;fillColor=#80FF80;` |
| Infrastructure Interface | `shape=mxgraph.archimate.tech;tType=interface;fillColor=#80FF80;` |
| Network | `shape=mxgraph.archimate.tech;tType=network;fillColor=#80FF80;` |
| Communication Path | `shape=mxgraph.archimate.tech;tType=commPath;fillColor=#80FF80;` |
| Infrastructure Function | `shape=mxgraph.archimate.tech;tType=infrastructureFunction;fillColor=#80FF80;` |
| Infrastructure Service | `shape=mxgraph.archimate.tech;tType=service;fillColor=#80FF80;` |
| Artifact | `shape=mxgraph.archimate.tech;tType=artifact;fillColor=#80FF80;` |

---

## Motivation Aspect

| Element | Style |
|---------|-------|
| Stakeholder | `shape=mxgraph.archimate.motivational;mType=stakeholder;fillColor=#CCCCFF;` |
| Driver | `shape=mxgraph.archimate.motivational;mType=driver;fillColor=#CCCCFF;` |
| Assessment | `shape=mxgraph.archimate.motivational;mType=assessment;fillColor=#CCCCFF;` |
| Goal | `shape=mxgraph.archimate.motivational;mType=goal;fillColor=#CCCCFF;` |
| Requirement | `shape=mxgraph.archimate.motivational;mType=requirement;fillColor=#CCCCFF;` |
| Constraint | `shape=mxgraph.archimate.motivational;mType=constraint;fillColor=#CCCCFF;` |
| Principle | `shape=mxgraph.archimate.motivational;mType=principle;fillColor=#CCCCFF;` |

---

## Implementation & Migration

| Element | Style |
|---------|-------|
| Work Package | `shape=mxgraph.archimate.implAndMigr;imType=workPackage;fillColor=#FFE0E0;` |
| Deliverable | `shape=mxgraph.archimate.implAndMigr;imType=deliverable;fillColor=#FFE0E0;` |
| Plateau | `shape=mxgraph.archimate.implAndMigr;imType=plateau;fillColor=#FFE0E0;` |
| Gap | `shape=mxgraph.archimate.implAndMigr;imType=gap;fillColor=#FFE0E0;` |

---

## XML Examples

### Business Actor
```xml
<mxCell id="10" value="Customer" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#FFFF99;shape=mxgraph.archimate.business;bType=actor;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="150" height="75" as="geometry"/>
</mxCell>
```

### Application Component
```xml
<mxCell id="20" value="CRM System" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#80FFFF;shape=mxgraph.archimate.application;appType=comp;" vertex="1" parent="1">
  <mxGeometry x="100" y="200" width="150" height="75" as="geometry"/>
</mxCell>
```

### Infrastructure Node
```xml
<mxCell id="30" value="Server" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#80FF80;shape=mxgraph.archimate.tech;tType=node;" vertex="1" parent="1">
  <mxGeometry x="100" y="300" width="150" height="75" as="geometry"/>
</mxCell>
```
