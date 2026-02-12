# archimate3

> ArchiMate 3.2 shape library for draw.io. Matches the default `archimate3` library at `app.diagrams.net/?libs=archimate3`.

## Style Pattern

All elements share a common base style prefix. Each element is a rectangle (or rounded rect / octagon) with an icon badge in the top-right corner.

**Base prefix** (always include):
```
html=1;outlineConnect=0;whiteSpace=wrap;
```

**Full element** uses `shape=mxgraph.archimate3.application` with two key parameters:
- `appType=` — determines the icon badge (e.g. `comp`, `proc`, `actor`, `node`)
- `archiType=` — determines the border shape:
  - `square` = rectangle (structure elements)
  - `rounded` = rounded rectangle (behavior elements)
  - `oct` = octagon (motivation elements)

**Default size**: `width="150" height="75"`

---

## Layer Colors

| Layer | Fill Color | Hex |
|-------|-----------|-----|
| Strategy | Wheat | `#F5DEAA` |
| Business | Light Yellow | `#FFFF99` |
| Application | Cyan | `#99FFFF` |
| Technology & Physical | Light Green | `#AFFFAF` |
| Motivation | Light Purple | `#CCCCFF` |
| Implementation & Migration | Light Pink | `#FFE0E0` |
| Generic / Composite | Grey | `#EBEBEB` |
| Location | Pink | `#EFD1E4` |

---

## Strategy Layer

| Element | `appType` | `archiType` | Style |
|---------|-----------|-------------|-------|
| Resource | `resource` | `square` | `shape=mxgraph.archimate3.application;appType=resource;archiType=square;fillColor=#F5DEAA;` |
| Capability | `capability` | `rounded` | `shape=mxgraph.archimate3.application;appType=capability;archiType=rounded;fillColor=#F5DEAA;` |
| Value Stream | `valueStream` | `rounded` | `shape=mxgraph.archimate3.application;appType=valueStream;archiType=rounded;fillColor=#F5DEAA;` |
| Course of Action | `course` | `rounded` | `shape=mxgraph.archimate3.application;appType=course;archiType=rounded;fillColor=#F5DEAA;` |

---

## Business Layer

| Element | `appType` | `archiType` | Style |
|---------|-----------|-------------|-------|
| Business Actor | `actor` | `square` | `shape=mxgraph.archimate3.application;appType=actor;archiType=square;fillColor=#FFFF99;` |
| Business Role | `role` | `square` | `shape=mxgraph.archimate3.application;appType=role;archiType=square;fillColor=#FFFF99;` |
| Business Collaboration | `collab` | `square` | `shape=mxgraph.archimate3.application;appType=collab;archiType=square;fillColor=#FFFF99;` |
| Business Interface | `interface` | `square` | `shape=mxgraph.archimate3.application;appType=interface;archiType=square;fillColor=#FFFF99;` |
| Business Process | `proc` | `rounded` | `shape=mxgraph.archimate3.application;appType=proc;archiType=rounded;fillColor=#FFFF99;` |
| Business Function | `func` | `rounded` | `shape=mxgraph.archimate3.application;appType=func;archiType=rounded;fillColor=#FFFF99;` |
| Business Interaction | `interaction` | `rounded` | `shape=mxgraph.archimate3.application;appType=interaction;archiType=rounded;fillColor=#FFFF99;` |
| Business Event | `event` | `rounded` | `shape=mxgraph.archimate3.application;appType=event;archiType=rounded;fillColor=#FFFF99;` |
| Business Service | `serv` | `rounded` | `shape=mxgraph.archimate3.application;appType=serv;archiType=rounded;fillColor=#FFFF99;` |
| Business Object | `passive` | `square` | `shape=mxgraph.archimate3.application;appType=passive;archiType=square;fillColor=#FFFF99;` |
| Contract | `contract` | `square` | `shape=mxgraph.archimate3.application;appType=contract;archiType=square;fillColor=#FFFF99;` |
| Representation | `representation` | `square` | `shape=mxgraph.archimate3.application;appType=representation;archiType=square;fillColor=#FFFF99;` |
| Product | `product` | `square` | `shape=mxgraph.archimate3.application;appType=product;archiType=square;fillColor=#FFFF99;` |

---

## Application Layer

| Element | `appType` | `archiType` | Style |
|---------|-----------|-------------|-------|
| Application Component | `comp` | `square` | `shape=mxgraph.archimate3.application;appType=comp;archiType=square;fillColor=#99FFFF;` |
| Application Collaboration | `collab` | `square` | `shape=mxgraph.archimate3.application;appType=collab;archiType=square;fillColor=#99FFFF;` |
| Application Interface | `interface` | `square` | `shape=mxgraph.archimate3.application;appType=interface;archiType=square;fillColor=#99FFFF;` |
| Application Function | `func` | `rounded` | `shape=mxgraph.archimate3.application;appType=func;archiType=rounded;fillColor=#99FFFF;` |
| Application Interaction | `interaction` | `rounded` | `shape=mxgraph.archimate3.application;appType=interaction;archiType=rounded;fillColor=#99FFFF;` |
| Application Process | `proc` | `rounded` | `shape=mxgraph.archimate3.application;appType=proc;archiType=rounded;fillColor=#99FFFF;` |
| Application Event | `event` | `rounded` | `shape=mxgraph.archimate3.application;appType=event;archiType=rounded;fillColor=#99FFFF;` |
| Application Service | `serv` | `rounded` | `shape=mxgraph.archimate3.application;appType=serv;archiType=rounded;fillColor=#99FFFF;` |
| Data Object | `passive` | `square` | `shape=mxgraph.archimate3.application;appType=passive;archiType=square;fillColor=#99FFFF;` |

---

## Technology & Physical Layer

| Element | `appType` | `archiType` | Style |
|---------|-----------|-------------|-------|
| Node | `node` | `square` | `shape=mxgraph.archimate3.application;appType=node;archiType=square;fillColor=#AFFFAF;` |
| Device | `device` | _(built-in)_ | `shape=mxgraph.archimate3.application;appType=device;fillColor=#AFFFAF;` |
| System Software | `sysSw` | `square` | `shape=mxgraph.archimate3.application;appType=sysSw;archiType=square;fillColor=#AFFFAF;` |
| Technology Collaboration | `collab` | `square` | `shape=mxgraph.archimate3.application;appType=collab;archiType=square;fillColor=#AFFFAF;` |
| Technology Interface | `interface` | `square` | `shape=mxgraph.archimate3.application;appType=interface;archiType=square;fillColor=#AFFFAF;` |
| Path | `path` | `square` | `shape=mxgraph.archimate3.application;appType=path;archiType=square;fillColor=#AFFFAF;` |
| Communication Network | `netw` | `square` | `shape=mxgraph.archimate3.application;appType=netw;archiType=square;fillColor=#AFFFAF;` |
| Technology Function | `func` | `square` | `shape=mxgraph.archimate3.application;appType=func;archiType=square;fillColor=#AFFFAF;` |
| Technology Process | `proc` | `rounded` | `shape=mxgraph.archimate3.application;appType=proc;archiType=rounded;fillColor=#AFFFAF;` |
| Technology Interaction | `interaction` | `rounded` | `shape=mxgraph.archimate3.application;appType=interaction;archiType=rounded;fillColor=#AFFFAF;` |
| Technology Event | `event` | `rounded` | `shape=mxgraph.archimate3.application;appType=event;archiType=rounded;fillColor=#AFFFAF;` |
| Technology Service | `serv` | `rounded` | `shape=mxgraph.archimate3.application;appType=serv;archiType=rounded;fillColor=#AFFFAF;` |
| Artifact | `artifact` | `square` | `shape=mxgraph.archimate3.application;appType=artifact;archiType=square;fillColor=#AFFFAF;` |
| Equipment | `equipment` | `square` | `shape=mxgraph.archimate3.application;appType=equipment;archiType=square;fillColor=#AFFFAF;` |
| Facility | `facility` | `square` | `shape=mxgraph.archimate3.application;appType=facility;archiType=square;fillColor=#AFFFAF;` |
| Distribution Network | `distribution` | `square` | `shape=mxgraph.archimate3.application;appType=distribution;archiType=square;fillColor=#AFFFAF;` |
| Material | `material` | `square` | `shape=mxgraph.archimate3.application;appType=material;archiType=square;fillColor=#AFFFAF;` |

---

## Motivation Aspect

All motivation elements use `archiType=oct` (octagon border).

| Element | `appType` | Style |
|---------|-----------|-------|
| Stakeholder | `role` | `shape=mxgraph.archimate3.application;appType=role;archiType=oct;fillColor=#CCCCFF;` |
| Driver | `driver` | `shape=mxgraph.archimate3.application;appType=driver;archiType=oct;fillColor=#CCCCFF;` |
| Assessment | `assess` | `shape=mxgraph.archimate3.application;appType=assess;archiType=oct;fillColor=#CCCCFF;` |
| Goal | `goal` | `shape=mxgraph.archimate3.application;appType=goal;archiType=oct;fillColor=#CCCCFF;` |
| Outcome | `outcome` | `shape=mxgraph.archimate3.application;appType=outcome;archiType=oct;fillColor=#CCCCFF;` |
| Principle | `principle` | `shape=mxgraph.archimate3.application;appType=principle;archiType=oct;fillColor=#CCCCFF;` |
| Requirement | `requirement` | `shape=mxgraph.archimate3.application;appType=requirement;archiType=oct;fillColor=#CCCCFF;` |
| Constraint | `constraint` | `shape=mxgraph.archimate3.application;appType=constraint;archiType=oct;fillColor=#CCCCFF;` |
| Meaning | `meaning` | `shape=mxgraph.archimate3.application;appType=meaning;archiType=oct;fillColor=#CCCCFF;` |
| Value | `amValue` | `shape=mxgraph.archimate3.application;appType=amValue;archiType=oct;fillColor=#CCCCFF;` |

---

## Implementation & Migration Layer

| Element | `appType` | `archiType` | Style |
|---------|-----------|-------------|-------|
| Work Package | `workPackage` | `rounded` | `shape=mxgraph.archimate3.application;appType=workPackage;archiType=rounded;fillColor=#FFE0E0;` |
| Deliverable | `deliverable` | _(default)_ | `shape=mxgraph.archimate3.application;appType=deliverable;fillColor=#FFE0E0;` |
| Implementation Event | `event` | `rounded` | `shape=mxgraph.archimate3.application;appType=event;archiType=rounded;fillColor=#FFE0E0;` |
| Plateau | `plateau` | _(default)_ | `shape=mxgraph.archimate3.application;appType=plateau;fillColor=#FFE0E0;` |
| Gap | `gap` | _(default)_ | `shape=mxgraph.archimate3.application;appType=gap;fillColor=#FFE0E0;` |

---

## Other / Composite

| Element | Style |
|---------|-------|
| Location | `shape=mxgraph.archimate3.application;appType=location;archiType=square;fillColor=#EFD1E4;` |
| Grouping | `shape=mxgraph.archimate3.application;appType=grouping;archiType=square;dashed=1;fillColor=none;` |
| Generic Active Structure | `shape=mxgraph.archimate3.application;appType=generic;archiType=square;fillColor=#EBEBEB;` |
| Generic Behavior | `shape=mxgraph.archimate3.application;appType=generic;archiType=rounded;fillColor=#EBEBEB;` |
| Generic Passive Structure | `shape=mxgraph.archimate3.application;appType=passive;archiType=square;fillColor=#EBEBEB;` |
| Generic Motivation | `shape=mxgraph.archimate3.application;appType=generic;archiType=oct;fillColor=#EBEBEB;` |

---

## Relationships (Edges)

All relationship edges should include: `edgeStyle=elbowEdgeStyle;elbow=vertical;rounded=0;html=1;`

| Relationship | Key Style Properties |
|-------------|---------------------|
| **Composition** | `startArrow=diamondThin;startFill=1;startSize=10;endArrow=none;endFill=0;` |
| **Aggregation** | `startArrow=diamondThin;startFill=0;startSize=10;endArrow=none;endFill=0;` |
| **Assignment** | `endArrow=block;endFill=1;startArrow=oval;startFill=1;` |
| **Realization** | `endArrow=block;endFill=0;dashed=1;` |
| **Serving** | `endArrow=open;endFill=1;` |
| **Access (no direction)** | `endArrow=none;dashed=1;dashPattern=1 4;` |
| **Access (read-write)** | `endArrow=open;endFill=0;dashed=1;startArrow=open;startFill=0;dashPattern=1 4;` |
| **Access (one-way)** | `endArrow=open;endFill=0;dashed=1;dashPattern=1 4;` |
| **Influence** | `endArrow=open;endFill=0;dashed=1;dashPattern=6 4;` (label: `+/-`) |
| **Association** | `endArrow=none;` |
| **Triggering** | `endArrow=openAsync;endFill=0;` |
| **Flow** | `endArrow=block;endFill=1;dashed=1;dashPattern=6 4;` |
| **Specialization** | `endArrow=block;endFill=0;` |

---

## XML Examples

### Business Actor
```xml
<mxCell id="10" value="Customer" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#FFFF99;shape=mxgraph.archimate3.application;appType=actor;archiType=square;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="150" height="75" as="geometry"/>
</mxCell>
```

### Application Component
```xml
<mxCell id="20" value="CRM System" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99FFFF;shape=mxgraph.archimate3.application;appType=comp;archiType=square;" vertex="1" parent="1">
  <mxGeometry x="100" y="200" width="150" height="75" as="geometry"/>
</mxCell>
```

### Node (Technology)
```xml
<mxCell id="30" value="Application Server" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#AFFFAF;shape=mxgraph.archimate3.application;appType=node;archiType=square;" vertex="1" parent="1">
  <mxGeometry x="100" y="300" width="150" height="75" as="geometry"/>
</mxCell>
```

### Goal (Motivation)
```xml
<mxCell id="40" value="Increase Revenue" style="html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#CCCCFF;shape=mxgraph.archimate3.application;appType=goal;archiType=oct;" vertex="1" parent="1">
  <mxGeometry x="100" y="400" width="150" height="75" as="geometry"/>
</mxCell>
```

### Serving Relationship
```xml
<mxCell id="50" style="edgeStyle=elbowEdgeStyle;html=1;endArrow=open;elbow=vertical;endFill=1;rounded=0;" edge="1" source="20" target="10" parent="1">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

### Composition Relationship
```xml
<mxCell id="60" style="html=1;startArrow=diamondThin;startFill=1;edgeStyle=elbowEdgeStyle;elbow=vertical;startSize=10;endArrow=none;endFill=0;rounded=0;" edge="1" source="10" target="20" parent="1">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```
