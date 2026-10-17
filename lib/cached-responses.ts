export interface CachedResponse {
    promptText: string
    hasImage: boolean
    // Name of the bundled example file the prompt is sent with
    fileName?: string
    xml: string
}

export const CACHED_EXAMPLE_RESPONSES: CachedResponse[] = [
    {
        promptText:
            "Give me a **animated connector** diagram of transformer's architecture",
        hasImage: false,
        xml: `<mxCell id="title" parent="1" style="text;align=center;verticalAlign=middle;fontSize=20;fontStyle=1;fontColor=#1A1A1A;whiteSpace=wrap;html=1;" value="Transformer Architecture" vertex="1">
  <mxGeometry height="30" width="600" x="95" y="8" as="geometry" />
</mxCell>
<mxCell id="subtitle" parent="1" style="text;align=center;verticalAlign=middle;fontSize=12;fontColor=#666666;whiteSpace=wrap;html=1;" value="Encoder-decoder model from &quot;Attention Is All You Need&quot; (Vaswani et al., 2017)" vertex="1">
  <mxGeometry height="20" width="600" x="95" y="36" as="geometry" />
</mxCell>
<mxCell id="legend" parent="1" style="rounded=1;absoluteArcSize=1;arcSize=12;fillColor=#ffffff;strokeColor=#CCCCCC;verticalAlign=top;align=left;spacingLeft=10;spacingTop=4;fontStyle=1;fontColor=#4D4D4D;whiteSpace=wrap;html=1;" value="Legend" vertex="1">
  <mxGeometry height="150" width="260" x="54" y="96" as="geometry" />
</mxCell>
<mxCell id="lg_e1" edge="1" parent="1" style="strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="72" y="134" as="sourcePoint" />
    <mxPoint x="122" y="134" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="lg_t1" parent="1" style="text;align=left;verticalAlign=middle;fontSize=11;fontColor=#333333;whiteSpace=wrap;html=1;" value="Main data flow" vertex="1">
  <mxGeometry height="20" width="170" x="134" y="124" as="geometry" />
</mxCell>
<mxCell id="lg_e2" edge="1" parent="1" style="strokeColor=#999999;strokeWidth=1.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="72" y="162" as="sourcePoint" />
    <mxPoint x="122" y="162" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="lg_t2" parent="1" style="text;align=left;verticalAlign=middle;fontSize=11;fontColor=#333333;whiteSpace=wrap;html=1;" value="Residual (skip) connection" vertex="1">
  <mxGeometry height="20" width="170" x="134" y="152" as="geometry" />
</mxCell>
<mxCell id="lg_e3" edge="1" parent="1" style="strokeColor=#d79b00;strokeWidth=2.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="72" y="190" as="sourcePoint" />
    <mxPoint x="122" y="190" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="lg_t3" parent="1" style="text;align=left;verticalAlign=middle;fontSize=11;fontColor=#333333;whiteSpace=wrap;html=1;" value="Encoder output (K, V) to decoder" vertex="1">
  <mxGeometry height="20" width="170" x="134" y="180" as="geometry" />
</mxCell>
<mxCell id="lg_t4" parent="1" style="text;align=left;verticalAlign=middle;fontSize=11;fontColor=#333333;whiteSpace=wrap;html=1;" value="&lt;b&gt;N×&lt;/b&gt;: each layer is stacked N = 6 times" vertex="1">
  <mxGeometry height="24" width="236" x="70" y="210" as="geometry" />
</mxCell>
<mxCell id="enc_frame" parent="1" style="rounded=1;absoluteArcSize=1;arcSize=18;fillColor=#FAFAFA;strokeColor=#B3B3B3;verticalAlign=top;align=left;spacingLeft=10;spacingTop=2;fontStyle=1;fontColor=#4D4D4D;whiteSpace=wrap;html=1;" value="Encoder" vertex="1">
  <mxGeometry height="294" width="260" x="54" y="340" as="geometry" />
</mxCell>
<mxCell id="dec_frame" parent="1" style="rounded=1;absoluteArcSize=1;arcSize=18;fillColor=#FAFAFA;strokeColor=#B3B3B3;verticalAlign=top;align=left;spacingLeft=10;spacingTop=2;fontStyle=1;fontColor=#4D4D4D;whiteSpace=wrap;html=1;" value="Decoder" vertex="1">
  <mxGeometry height="422" width="260" x="476" y="212" as="geometry" />
</mxCell>
<mxCell id="enc_n" parent="1" style="text;align=center;verticalAlign=middle;fontSize=16;fontStyle=1;fontColor=#4D4D4D;whiteSpace=wrap;html=1;" value="N×" vertex="1">
  <mxGeometry height="30" width="44" x="6" y="472" as="geometry" />
</mxCell>
<mxCell id="dec_n" parent="1" style="text;align=center;verticalAlign=middle;fontSize=16;fontStyle=1;fontColor=#4D4D4D;whiteSpace=wrap;html=1;" value="N×" vertex="1">
  <mxGeometry height="30" width="44" x="740" y="408" as="geometry" />
</mxCell>
<mxCell id="enc_in" parent="1" style="rounded=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;whiteSpace=wrap;html=1;" value="Inputs" vertex="1">
  <mxGeometry height="32" width="190" x="94" y="744" as="geometry" />
</mxCell>
<mxCell id="enc_emb" parent="1" style="rounded=1;fillColor=#f8cecc;strokeColor=#b85450;whiteSpace=wrap;html=1;" value="Input Embedding" vertex="1">
  <mxGeometry height="34" width="190" x="94" y="694" as="geometry" />
</mxCell>
<mxCell id="enc_add" parent="1" style="shape=orEllipse;perimeter=ellipsePerimeter;fillColor=#ffffff;strokeColor=#4D4D4D;strokeWidth=1.5;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="26" width="26" x="176" y="652" as="geometry" />
</mxCell>
<mxCell id="enc_d1" parent="1" style="ellipse;fillColor=#4D4D4D;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="185" y="608" as="geometry" />
</mxCell>
<mxCell id="enc_mha" parent="1" style="rounded=1;fillColor=#ffe6cc;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="Multi-Head Attention" vertex="1">
  <mxGeometry height="40" width="190" x="94" y="550" as="geometry" />
</mxCell>
<mxCell id="enc_an1" parent="1" style="rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;whiteSpace=wrap;html=1;" value="Add &amp;amp; Norm" vertex="1">
  <mxGeometry height="28" width="190" x="94" y="502" as="geometry" />
</mxCell>
<mxCell id="enc_d2" parent="1" style="ellipse;fillColor=#4D4D4D;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="185" y="476" as="geometry" />
</mxCell>
<mxCell id="enc_ff" parent="1" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;" value="Feed Forward" vertex="1">
  <mxGeometry height="40" width="190" x="94" y="418" as="geometry" />
</mxCell>
<mxCell id="enc_an2" parent="1" style="rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;whiteSpace=wrap;html=1;" value="Add &amp;amp; Norm" vertex="1">
  <mxGeometry height="28" width="190" x="94" y="370" as="geometry" />
</mxCell>
<mxCell id="pe" parent="1" style="rounded=1;fillColor=#e1d5e7;strokeColor=#9673a6;whiteSpace=wrap;html=1;" value="Positional Encoding" vertex="1">
  <mxGeometry height="36" width="140" x="325" y="647" as="geometry" />
</mxCell>
<mxCell id="dec_out" parent="1" style="rounded=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;whiteSpace=wrap;html=1;" value="Outputs (shifted right)" vertex="1">
  <mxGeometry height="32" width="190" x="506" y="744" as="geometry" />
</mxCell>
<mxCell id="dec_emb" parent="1" style="rounded=1;fillColor=#f8cecc;strokeColor=#b85450;whiteSpace=wrap;html=1;" value="Output Embedding" vertex="1">
  <mxGeometry height="34" width="190" x="506" y="694" as="geometry" />
</mxCell>
<mxCell id="dec_add" parent="1" style="shape=orEllipse;perimeter=ellipsePerimeter;fillColor=#ffffff;strokeColor=#4D4D4D;strokeWidth=1.5;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="26" width="26" x="588" y="652" as="geometry" />
</mxCell>
<mxCell id="dec_d1" parent="1" style="ellipse;fillColor=#4D4D4D;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="597" y="608" as="geometry" />
</mxCell>
<mxCell id="dec_mmha" parent="1" style="rounded=1;fillColor=#ffe6cc;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="Masked Multi-Head Attention" vertex="1">
  <mxGeometry height="40" width="190" x="506" y="550" as="geometry" />
</mxCell>
<mxCell id="dec_an1" parent="1" style="rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;whiteSpace=wrap;html=1;" value="Add &amp;amp; Norm" vertex="1">
  <mxGeometry height="28" width="190" x="506" y="502" as="geometry" />
</mxCell>
<mxCell id="dec_d2" parent="1" style="ellipse;fillColor=#4D4D4D;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="597" y="476" as="geometry" />
</mxCell>
<mxCell id="dec_xmha" parent="1" style="rounded=1;fillColor=#ffe6cc;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="Multi-Head Cross-Attention" vertex="1">
  <mxGeometry height="40" width="190" x="506" y="418" as="geometry" />
</mxCell>
<mxCell id="dec_an2" parent="1" style="rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;whiteSpace=wrap;html=1;" value="Add &amp;amp; Norm" vertex="1">
  <mxGeometry height="28" width="190" x="506" y="370" as="geometry" />
</mxCell>
<mxCell id="dec_d3" parent="1" style="ellipse;fillColor=#4D4D4D;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="597" y="344" as="geometry" />
</mxCell>
<mxCell id="dec_ff" parent="1" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;" value="Feed Forward" vertex="1">
  <mxGeometry height="40" width="190" x="506" y="286" as="geometry" />
</mxCell>
<mxCell id="dec_an3" parent="1" style="rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;whiteSpace=wrap;html=1;" value="Add &amp;amp; Norm" vertex="1">
  <mxGeometry height="28" width="190" x="506" y="238" as="geometry" />
</mxCell>
<mxCell id="dec_lin" parent="1" style="rounded=1;fillColor=#d5e8d4;strokeColor=#82b366;whiteSpace=wrap;html=1;" value="Linear" vertex="1">
  <mxGeometry height="30" width="190" x="506" y="162" as="geometry" />
</mxCell>
<mxCell id="dec_soft" parent="1" style="rounded=1;fillColor=#d5e8d4;strokeColor=#82b366;whiteSpace=wrap;html=1;" value="Softmax" vertex="1">
  <mxGeometry height="30" width="190" x="506" y="114" as="geometry" />
</mxCell>
<mxCell id="dec_prob" parent="1" style="rounded=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;whiteSpace=wrap;html=1;" value="Output Probabilities" vertex="1">
  <mxGeometry height="30" width="190" x="506" y="66" as="geometry" />
</mxCell>
<mxCell id="q_lab" parent="1" style="text;align=right;verticalAlign=middle;fontSize=11;fontStyle=1;fontColor=#9C6500;whiteSpace=wrap;html=1;" value="Q" vertex="1">
  <mxGeometry height="18" width="24" x="571" y="458" as="geometry" />
</mxCell>
<mxCell id="e1" edge="1" parent="1" source="enc_in" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="enc_emb">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e2" edge="1" parent="1" source="enc_emb" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="enc_add">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e3" edge="1" parent="1" source="enc_add" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=none;html=1;" target="enc_d1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e4" edge="1" parent="1" source="enc_d1" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="enc_mha">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e5" edge="1" parent="1" source="enc_mha" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="enc_an1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e6" edge="1" parent="1" source="enc_an1" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=none;html=1;" target="enc_d2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e7" edge="1" parent="1" source="enc_d2" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="enc_ff">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e8" edge="1" parent="1" source="enc_ff" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="enc_an2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e9" edge="1" parent="1" source="enc_an2" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0;entryY=0.5;strokeColor=#d79b00;strokeWidth=2.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;fontSize=11;fontColor=#9C6500;labelBackgroundColor=#ffffff;html=1;" target="dec_xmha" value="Encoder output&lt;br&gt;(Keys, Values)">
  <mxGeometry relative="1" x="-0.15" as="geometry">
    <Array as="points">
      <mxPoint x="189" y="316" />
      <mxPoint x="395" y="316" />
      <mxPoint x="395" y="438" />
    </Array>
  </mxGeometry>
</mxCell>
<mxCell id="r1" edge="1" parent="1" source="enc_d1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#999999;strokeWidth=1.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=0;exitY=0.5;entryX=0;entryY=0.5;html=1;" target="enc_an1">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="74" y="612" />
      <mxPoint x="74" y="516" />
    </Array>
  </mxGeometry>
</mxCell>
<mxCell id="r2" edge="1" parent="1" source="enc_d2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#999999;strokeWidth=1.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=0;exitY=0.5;entryX=0;entryY=0.5;html=1;" target="enc_an2">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="74" y="480" />
      <mxPoint x="74" y="384" />
    </Array>
  </mxGeometry>
</mxCell>
<mxCell id="p1" edge="1" parent="1" source="pe" style="edgeStyle=orthogonalEdgeStyle;exitY=0.5;entryY=0.5;strokeColor=#9673a6;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=0;entryX=1;html=1;" target="enc_add">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="p2" edge="1" parent="1" source="pe" style="edgeStyle=orthogonalEdgeStyle;exitY=0.5;entryY=0.5;strokeColor=#9673a6;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=1;entryX=0;html=1;" target="dec_add">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d1" edge="1" parent="1" source="dec_out" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_emb">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d2" edge="1" parent="1" source="dec_emb" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_add">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d3" edge="1" parent="1" source="dec_add" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=none;html=1;" target="dec_d1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d4" edge="1" parent="1" source="dec_d1" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_mmha">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d5" edge="1" parent="1" source="dec_mmha" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_an1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d6" edge="1" parent="1" source="dec_an1" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=none;html=1;" target="dec_d2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d7" edge="1" parent="1" source="dec_d2" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_xmha">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d8" edge="1" parent="1" source="dec_xmha" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_an2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d9" edge="1" parent="1" source="dec_an2" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=none;html=1;" target="dec_d3">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d10" edge="1" parent="1" source="dec_d3" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_ff">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d11" edge="1" parent="1" source="dec_ff" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_an3">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d12" edge="1" parent="1" source="dec_an3" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_lin">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d13" edge="1" parent="1" source="dec_lin" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_soft">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="d14" edge="1" parent="1" source="dec_soft" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;strokeColor=#4D4D4D;strokeWidth=2;flowAnimation=1;endArrow=block;endFill=1;endSize=5;html=1;" target="dec_prob">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="r3" edge="1" parent="1" source="dec_d1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#999999;strokeWidth=1.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=1;exitY=0.5;entryX=1;entryY=0.5;html=1;" target="dec_an1">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="716" y="612" />
      <mxPoint x="716" y="516" />
    </Array>
  </mxGeometry>
</mxCell>
<mxCell id="r4" edge="1" parent="1" source="dec_d2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#999999;strokeWidth=1.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=1;exitY=0.5;entryX=1;entryY=0.5;html=1;" target="dec_an2">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="716" y="480" />
      <mxPoint x="716" y="384" />
    </Array>
  </mxGeometry>
</mxCell>
<mxCell id="r5" edge="1" parent="1" source="dec_d3" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#999999;strokeWidth=1.5;flowAnimation=1;endArrow=block;endFill=1;endSize=5;exitX=1;exitY=0.5;entryX=1;entryY=0.5;html=1;" target="dec_an3">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="716" y="348" />
      <mxPoint x="716" y="252" />
    </Array>
  </mxGeometry>
</mxCell>`,
    },
    {
        promptText: "Replicate this in aws style",
        hasImage: true,
        fileName: "architecture.png",
        xml: `<mxCell id="2" value="AWS" style="sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud;strokeColor=#232F3E;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#232F3E;dashed=0;rounded=1;arcSize=5;" vertex="1" parent="1">
    <mxGeometry x="140" y="40" width="670" height="520" as="geometry"/>
  </mxCell>


  <mxCell id="3" value="User" style="sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#232F3D;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.user;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="20" y="240" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="4" value="EC2" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#ED7100;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="330" y="240" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="5" value="S3" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#7AA116;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="660" y="120" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="6" value="bedrock" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#01A88D;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.bedrock;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="660" y="260" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="7" value="DynamoDB" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#C925D1;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="660" y="400" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="8" value="" style="endArrow=classic;html=1;rounded=0;strokeColor=#232F3E;strokeWidth=2;exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;" edge="1" parent="1" source="3" target="4">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="400" y="350" as="sourcePoint"/>
      <mxPoint x="450" y="300" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="9" value="" style="endArrow=classic;html=1;rounded=0;strokeColor=#232F3E;strokeWidth=2;exitX=1;exitY=0.25;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;" edge="1" parent="1" source="4" target="5">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="700" y="350" as="sourcePoint"/>
      <mxPoint x="750" y="300" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="10" value="" style="endArrow=classic;html=1;rounded=0;strokeColor=#232F3E;strokeWidth=2;exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;" edge="1" parent="1" source="4" target="6">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="700" y="350" as="sourcePoint"/>
      <mxPoint x="750" y="300" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="11" value="" style="endArrow=classic;html=1;rounded=0;strokeColor=#232F3E;strokeWidth=2;exitX=1;exitY=0.75;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;" edge="1" parent="1" source="4" target="7">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="700" y="350" as="sourcePoint"/>
      <mxPoint x="750" y="300" as="targetPoint"/>
    </mxGeometry>
  </mxCell>`,
    },
    {
        promptText: "Replicate this flowchart.",
        hasImage: true,
        fileName: "example.png",
        xml: `<mxCell id="2" value="Lamp doesn't work" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffcccc;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
    <mxGeometry x="140" y="40" width="180" height="60" as="geometry"/>
  </mxCell>


  <mxCell id="3" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;strokeWidth=2;endArrow=block;endFill=1;" edge="1" parent="1" source="2" target="4">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>


  <mxCell id="4" value="Lamp&lt;br&gt;plugged in?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffff99;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
    <mxGeometry x="130" y="150" width="200" height="200" as="geometry"/>
  </mxCell>


  <mxCell id="5" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;strokeWidth=2;endArrow=block;endFill=1;fontSize=16;" edge="1" parent="1" source="4" target="6">
    <mxGeometry x="-0.2" relative="1" as="geometry">
      <mxPoint as="offset"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="6" value="Plug in lamp" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#99ff99;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
    <mxGeometry x="420" y="220" width="200" height="60" as="geometry"/>
  </mxCell>


  <mxCell id="7" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;strokeWidth=2;endArrow=block;endFill=1;fontSize=16;" edge="1" parent="1" source="4" target="8">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>


  <mxCell id="8" value="Bulb&lt;br&gt;burned out?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffff99;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
    <mxGeometry x="130" y="400" width="200" height="200" as="geometry"/>
  </mxCell>


  <mxCell id="9" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;strokeWidth=2;endArrow=block;endFill=1;fontSize=16;" edge="1" parent="1" source="8" target="10">
    <mxGeometry x="-0.2" relative="1" as="geometry">
      <mxPoint as="offset"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="10" value="Replace bulb" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#99ff99;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
    <mxGeometry x="420" y="470" width="200" height="60" as="geometry"/>
  </mxCell>


  <mxCell id="11" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;strokeWidth=2;endArrow=block;endFill=1;fontSize=16;" edge="1" parent="1" source="8" target="12">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>


  <mxCell id="12" value="Repair lamp" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#99ff99;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
    <mxGeometry x="130" y="650" width="200" height="60" as="geometry"/>
  </mxCell>`,
    },
    {
        promptText: "Summarize this paper as a diagram",
        hasImage: true,
        fileName: "chain-of-thought.txt",
        xml: `<mxCell id="title" parent="1" style="text;align=center;verticalAlign=middle;fontSize=20;fontStyle=1;whiteSpace=wrap;html=1;" value="Chain-of-Thought Prompting Elicits Reasoning in Large Language Models&lt;br&gt;&lt;span style=&quot;font-size:12px;font-weight:normal;color:#555555&quot;&gt;Jason Wei et al.&lt;/span&gt;" vertex="1">
  <mxGeometry height="44" width="760" x="20" y="8" as="geometry" />
</mxCell>
<mxCell id="sec1" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#f8cecc;strokeColor=#b85450;swimlaneFillColor=#fdf2f1;whiteSpace=wrap;html=1;" value="1. Problem" vertex="1">
  <mxGeometry height="260" width="270" x="20" y="58" as="geometry" />
</mxCell>
<mxCell id="p1" parent="sec1" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#b85450;whiteSpace=wrap;html=1;" value="&lt;b&gt;Scaling alone is not enough&lt;/b&gt;&lt;br&gt;Bigger LLMs still struggle with arithmetic, commonsense and symbolic reasoning" vertex="1">
  <mxGeometry height="58" width="246" x="12" y="40" as="geometry" />
</mxCell>
<mxCell id="p0" parent="sec1" style="text;fontSize=11;fontStyle=1;fontColor=#666666;verticalAlign=middle;whiteSpace=wrap;html=1;" value="Prior approaches" vertex="1">
  <mxGeometry height="18" width="246" x="12" y="106" as="geometry" />
</mxCell>
<mxCell id="p2" parent="sec1" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#b85450;whiteSpace=wrap;html=1;" value="&lt;b&gt;Finetuning&lt;/b&gt;&lt;br&gt;Needs large datasets of written explanations; costly and task-specific" vertex="1">
  <mxGeometry height="56" width="246" x="12" y="128" as="geometry" />
</mxCell>
<mxCell id="p3" parent="sec1" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#b85450;whiteSpace=wrap;html=1;" value="&lt;b&gt;Standard few-shot prompting&lt;/b&gt;&lt;br&gt;Question and answer pairs with no reasoning; fails on multi-step problems" vertex="1">
  <mxGeometry height="56" width="246" x="12" y="192" as="geometry" />
</mxCell>
<mxCell id="sec2" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#dae8fc;strokeColor=#6c8ebf;swimlaneFillColor=#f3f8fe;whiteSpace=wrap;html=1;" value="2. Method: Chain-of-Thought (CoT) Prompting" vertex="1">
  <mxGeometry height="260" width="440" x="340" y="58" as="geometry" />
</mxCell>
<mxCell id="m1" parent="sec2" style="rounded=1;arcSize=6;fontSize=12;align=left;verticalAlign=top;spacing=8;fillColor=#f5f5f5;strokeColor=#999999;whiteSpace=wrap;html=1;" value="&lt;b&gt;Standard prompting&lt;/b&gt;&lt;br&gt;&lt;br&gt;Q: Roger has 5 balls. He buys 2 cans of 3 balls. How many now?&lt;br&gt;A: 11.&lt;br&gt;&lt;br&gt;&lt;font color=&quot;#777777&quot;&gt;Answer only, no steps shown&lt;/font&gt;" vertex="1">
  <mxGeometry height="160" width="200" x="12" y="40" as="geometry" />
</mxCell>
<mxCell id="m2" parent="sec2" style="rounded=1;arcSize=6;fontSize=12;align=left;verticalAlign=top;spacing=8;fillColor=#ffffff;strokeColor=#6c8ebf;strokeWidth=2;whiteSpace=wrap;html=1;" value="&lt;b&gt;Chain-of-thought prompting&lt;/b&gt;&lt;br&gt;&lt;br&gt;Q: (same question)&lt;br&gt;A: &lt;font color=&quot;#1f5fa8&quot;&gt;&lt;i&gt;Roger started with 5 balls. 2 cans of 3 tennis balls each is 6 tennis balls. 5 + 6 = 11.&lt;/i&gt;&lt;/font&gt; The answer is 11.&lt;br&gt;&lt;br&gt;&lt;font color=&quot;#777777&quot;&gt;Blue: reasoning steps&lt;/font&gt;" vertex="1">
  <mxGeometry height="160" width="200" x="228" y="40" as="geometry" />
</mxCell>
<mxCell id="m3" parent="sec2" style="rounded=1;arcSize=6;fontSize=11;spacing=6;fillColor=#dae8fc;strokeColor=#6c8ebf;verticalAlign=middle;align=center;whiteSpace=wrap;html=1;" value="Only the exemplars change, with no finetuning. For new questions, the model writes its own reasoning steps before answering." vertex="1">
  <mxGeometry height="40" width="416" x="12" y="210" as="geometry" />
</mxCell>
<mxCell id="sec3" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#e1d5e7;strokeColor=#9673a6;swimlaneFillColor=#f8f4fa;whiteSpace=wrap;html=1;" value="3. Experimental Setup" vertex="1">
  <mxGeometry height="122" width="760" x="20" y="356" as="geometry" />
</mxCell>
<mxCell id="s1" parent="sec3" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#9673a6;whiteSpace=wrap;html=1;" value="&lt;b&gt;Models&lt;/b&gt;&lt;br&gt;GPT-3 175B, LaMDA 137B, PaLM 540B, UL2 20B, Codex" vertex="1">
  <mxGeometry height="70" width="200" x="12" y="40" as="geometry" />
</mxCell>
<mxCell id="s0" parent="sec3" style="text;fontSize=11;fontStyle=1;fontColor=#666666;verticalAlign=middle;whiteSpace=wrap;html=1;" value="Benchmarks in 3 reasoning domains" vertex="1">
  <mxGeometry height="18" width="522" x="226" y="40" as="geometry" />
</mxCell>
<mxCell id="s2" parent="sec3" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#9673a6;whiteSpace=wrap;html=1;" value="&lt;b&gt;Arithmetic&lt;/b&gt;&lt;br&gt;GSM8K, SVAMP, ASDiv, AQuA, MAWPS" vertex="1">
  <mxGeometry height="50" width="168" x="226" y="60" as="geometry" />
</mxCell>
<mxCell id="s3" parent="sec3" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#9673a6;whiteSpace=wrap;html=1;" value="&lt;b&gt;Commonsense&lt;/b&gt;&lt;br&gt;CSQA, StrategyQA, Date, Sports" vertex="1">
  <mxGeometry height="50" width="168" x="403" y="60" as="geometry" />
</mxCell>
<mxCell id="s4" parent="sec3" style="rounded=1;arcSize=6;fontSize=11;align=left;verticalAlign=top;spacing=6;fillColor=#ffffff;strokeColor=#9673a6;whiteSpace=wrap;html=1;" value="&lt;b&gt;Symbolic&lt;/b&gt;&lt;br&gt;Last Letter Concatenation, Coin Flip" vertex="1">
  <mxGeometry height="50" width="168" x="580" y="60" as="geometry" />
</mxCell>
<mxCell id="sec4" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#d5e8d4;strokeColor=#82b366;swimlaneFillColor=#f4faf2;whiteSpace=wrap;html=1;" value="4. Key Results" vertex="1">
  <mxGeometry height="306" width="760" x="20" y="516" as="geometry" />
</mxCell>
<mxCell id="r1" parent="sec4" style="rounded=1;arcSize=6;fillColor=#ffffff;strokeColor=#82b366;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="148" width="420" x="12" y="40" as="geometry" />
</mxCell>
<mxCell id="r1t" parent="sec4" style="text;fontSize=12;fontStyle=1;align=left;verticalAlign=middle;whiteSpace=wrap;html=1;" value="Arithmetic: GSM8K accuracy, PaLM 540B" vertex="1">
  <mxGeometry height="20" width="400" x="22" y="46" as="geometry" />
</mxCell>
<mxCell id="b1l" parent="sec4" style="text;align=right;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="Standard prompting" vertex="1">
  <mxGeometry height="20" width="134" x="22" y="74" as="geometry" />
</mxCell>
<mxCell id="b1" parent="sec4" style="rounded=0;strokeColor=none;fillColor=#bfbfbf;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="47" x="164" y="74" as="geometry" />
</mxCell>
<mxCell id="b1v" parent="sec4" style="text;align=left;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="17.9%" vertex="1">
  <mxGeometry height="20" width="104" x="217" y="74" as="geometry" />
</mxCell>
<mxCell id="b2l" parent="sec4" style="text;align=right;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="Finetuned GPT-3" vertex="1">
  <mxGeometry height="20" width="134" x="22" y="102" as="geometry" />
</mxCell>
<mxCell id="b2" parent="sec4" style="rounded=0;strokeColor=none;fillColor=#8c8c8c;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="143" x="164" y="102" as="geometry" />
</mxCell>
<mxCell id="b2v" parent="sec4" style="text;align=left;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="55% (prior best)" vertex="1">
  <mxGeometry height="20" width="104" x="313" y="102" as="geometry" />
</mxCell>
<mxCell id="b3l" parent="sec4" style="text;align=right;verticalAlign=middle;fontSize=11;fontStyle=1;whiteSpace=wrap;html=1;" value="Chain-of-thought" vertex="1">
  <mxGeometry height="20" width="134" x="22" y="130" as="geometry" />
</mxCell>
<mxCell id="b3" parent="sec4" style="rounded=0;strokeColor=none;fillColor=#82b366;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="148" x="164" y="130" as="geometry" />
</mxCell>
<mxCell id="b3v" parent="sec4" style="text;align=left;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="&lt;b&gt;56.9% (new best)&lt;/b&gt;" vertex="1">
  <mxGeometry height="20" width="104" x="318" y="130" as="geometry" />
</mxCell>
<mxCell id="b4l" parent="sec4" style="text;align=right;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="CoT + calculator" vertex="1">
  <mxGeometry height="20" width="134" x="22" y="158" as="geometry" />
</mxCell>
<mxCell id="b4" parent="sec4" style="rounded=0;strokeColor=none;fillColor=#4e8a3e;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="152" x="164" y="158" as="geometry" />
</mxCell>
<mxCell id="b4v" parent="sec4" style="text;align=left;verticalAlign=middle;fontSize=11;whiteSpace=wrap;html=1;" value="58.6%" vertex="1">
  <mxGeometry height="20" width="100" x="322" y="158" as="geometry" />
</mxCell>
<mxCell id="r2" parent="sec4" style="rounded=1;arcSize=6;fontSize=12;align=left;verticalAlign=top;spacing=8;fillColor=#ffffff;strokeColor=#82b366;whiteSpace=wrap;html=1;" value="&lt;b&gt;Commonsense (PaLM 540B)&lt;/b&gt;&lt;br&gt;&lt;br&gt;• StrategyQA: 75.6%, above the prior best of 69.4%&lt;br&gt;• Sports Understanding: 95.4%, above an unaided sports enthusiast (84%)&lt;br&gt;• CSQA: small gain, since many questions need no multi-step logic" vertex="1">
  <mxGeometry height="148" width="302" x="446" y="40" as="geometry" />
</mxCell>
<mxCell id="r3" parent="sec4" style="rounded=1;arcSize=6;fontSize=12;align=left;verticalAlign=top;spacing=8;fillColor=#ffffff;strokeColor=#82b366;whiteSpace=wrap;html=1;" value="&lt;b&gt;Symbolic: out-of-domain generalization&lt;/b&gt;&lt;br&gt;&lt;br&gt;• Coin Flip exemplars show only 2 flips&lt;br&gt;• With CoT, models track coins flipped 3 or 4 times&lt;br&gt;• Standard prompting fails on these longer sequences" vertex="1">
  <mxGeometry height="96" width="736" x="12" y="198" as="geometry" />
</mxCell>
<mxCell id="sec5" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#ffe6cc;strokeColor=#d79b00;swimlaneFillColor=#fffaf3;whiteSpace=wrap;html=1;" value="5. Emergent Ability of Scale" vertex="1">
  <mxGeometry height="216" width="240" x="20" y="860" as="geometry" />
</mxCell>
<mxCell id="small" parent="sec5" style="rounded=1;arcSize=6;fontSize=11;spacing=6;align=center;verticalAlign=middle;fillColor=#f8cecc;strokeColor=#b85450;whiteSpace=wrap;html=1;" value="&lt;b&gt;Small models&lt;br&gt;(under 10B)&lt;/b&gt;&lt;br&gt;No gain, often worse: fluent but illogical reasoning" vertex="1">
  <mxGeometry height="62" width="216" x="12" y="40" as="geometry" />
</mxCell>
<mxCell id="large" parent="sec5" style="rounded=1;arcSize=6;fontSize=11;spacing=6;align=center;verticalAlign=middle;fillColor=#d5e8d4;strokeColor=#82b366;whiteSpace=wrap;html=1;" value="&lt;b&gt;Large models&lt;br&gt;(about 100B+)&lt;/b&gt;&lt;br&gt;Big gains, e.g. GPT-3 175B and PaLM 540B" vertex="1">
  <mxGeometry height="62" width="216" x="12" y="142" as="geometry" />
</mxCell>
<mxCell id="scaleTxt" parent="sec5" style="text;align=center;verticalAlign=middle;fontSize=10;fontColor=#666666;whiteSpace=wrap;html=1;" value="scale up" vertex="1">
  <mxGeometry height="16" width="56" x="128" y="114" as="geometry" />
</mxCell>
<mxCell id="eScale" edge="1" parent="1" source="small" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;html=1;" target="large">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="sec6" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#ffe6cc;strokeColor=#d79b00;swimlaneFillColor=#fffaf3;whiteSpace=wrap;html=1;" value="6. Why It Works: Ablations" vertex="1">
  <mxGeometry height="216" width="240" x="280" y="860" as="geometry" />
</mxCell>
<mxCell id="a1" parent="sec6" style="rounded=1;arcSize=10;fontSize=11;align=left;verticalAlign=middle;spacingLeft=8;fillColor=#ffffff;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="&lt;b&gt;Equation only&lt;/b&gt; (no words): worse than CoT" vertex="1">
  <mxGeometry height="34" width="216" x="12" y="38" as="geometry" />
</mxCell>
<mxCell id="a2" parent="sec6" style="rounded=1;arcSize=10;fontSize=11;align=left;verticalAlign=middle;spacingLeft=8;fillColor=#ffffff;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="&lt;b&gt;Dots only&lt;/b&gt; (extra compute, no content): no gain" vertex="1">
  <mxGeometry height="34" width="216" x="12" y="76" as="geometry" />
</mxCell>
<mxCell id="a3" parent="sec6" style="rounded=1;arcSize=10;fontSize=11;align=left;verticalAlign=middle;spacingLeft=8;fillColor=#ffffff;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="&lt;b&gt;Reasoning after the answer&lt;/b&gt;: same as baseline" vertex="1">
  <mxGeometry height="34" width="216" x="12" y="114" as="geometry" />
</mxCell>
<mxCell id="a4" parent="sec6" style="text;fontSize=11;fontStyle=1;fontColor=#b46504;align=center;verticalAlign=middle;whiteSpace=wrap;html=1;" value="Takeaway: the reasoning steps themselves matter, and they must come before the answer." vertex="1">
  <mxGeometry height="52" width="216" x="12" y="152" as="geometry" />
</mxCell>
<mxCell id="sec7" parent="1" style="swimlane;startSize=30;rounded=1;arcSize=3;fontSize=14;fontStyle=1;fillColor=#ffe6cc;strokeColor=#d79b00;swimlaneFillColor=#fffaf3;whiteSpace=wrap;html=1;" value="7. Error Analysis and Robustness" vertex="1">
  <mxGeometry height="216" width="240" x="540" y="860" as="geometry" />
</mxCell>
<mxCell id="er1" parent="sec7" style="rounded=1;arcSize=10;fontSize=11;align=left;verticalAlign=middle;spacingLeft=8;fillColor=#ffffff;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="&lt;b&gt;Math error types&lt;/b&gt;: semantic understanding, one step missing, calculation errors" vertex="1">
  <mxGeometry height="52" width="216" x="12" y="38" as="geometry" />
</mxCell>
<mxCell id="er2" parent="sec7" style="rounded=1;arcSize=10;fontSize=11;align=left;verticalAlign=middle;spacingLeft=8;fillColor=#ffffff;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="&lt;b&gt;PaLM 62B to 540B&lt;/b&gt;: far fewer semantic and missing-step errors" vertex="1">
  <mxGeometry height="52" width="216" x="12" y="96" as="geometry" />
</mxCell>
<mxCell id="er3" parent="sec7" style="rounded=1;arcSize=10;fontSize=11;align=left;verticalAlign=middle;spacingLeft=8;fillColor=#ffffff;strokeColor=#d79b00;whiteSpace=wrap;html=1;" value="&lt;b&gt;Robust&lt;/b&gt; to different annotators and exemplars; prompt style still causes some variance" vertex="1">
  <mxGeometry height="52" width="216" x="12" y="154" as="geometry" />
</mxCell>
<mxCell id="concl" parent="1" style="rounded=1;arcSize=20;fillColor=#1e4e79;strokeColor=none;fontColor=#ffffff;fontSize=13;whiteSpace=wrap;html=1;" value="&lt;b&gt;Conclusion:&lt;/b&gt; asking a model to show its work unlocks multi-step reasoning without finetuning, and this reasoning is an emergent ability of sufficiently large language models." vertex="1">
  <mxGeometry height="50" width="760" x="20" y="1088" as="geometry" />
</mxCell>
<mxCell id="e12" edge="1" parent="1" source="sec1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;html=1;" target="sec2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e23" edge="1" parent="1" source="sec2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=0.5;exitY=1;entryX=0.7105;entryY=0;html=1;" target="sec3">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e34" edge="1" parent="1" source="sec3" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;html=1;" target="sec4">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e45" edge="1" parent="1" source="sec4" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=0.1579;exitY=1;entryX=0.5;entryY=0;html=1;" target="sec5">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e46" edge="1" parent="1" source="sec4" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;html=1;" target="sec6">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e47" edge="1" parent="1" source="sec4" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;exitX=0.8421;exitY=1;entryX=0.5;entryY=0;html=1;" target="sec7">
  <mxGeometry relative="1" as="geometry" />
</mxCell>`,
    },
    {
        promptText: "Draw a cat for me",
        hasImage: false,
        xml: `<mxCell id="shadow" parent="1" style="ellipse;fillColor=#F3E9DC;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="36" width="380" x="240" y="522" as="geometry" />
</mxCell>
<mxCell id="tailOut" edge="1" parent="1" style="endArrow=none;curved=1;strokeWidth=26;strokeColor=#C9772E;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="610" y="510" />
      <mxPoint x="640" y="400" />
    </Array>
    <mxPoint x="480" y="500" as="sourcePoint" />
    <mxPoint x="590" y="345" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="tailIn" edge="1" parent="1" style="endArrow=none;curved=1;strokeWidth=20;strokeColor=#FFB570;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="610" y="510" />
      <mxPoint x="640" y="400" />
    </Array>
    <mxPoint x="480" y="500" as="sourcePoint" />
    <mxPoint x="590" y="345" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="tailTip" parent="1" style="ellipse;fillColor=#E8913F;strokeColor=#C9772E;strokeWidth=3;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="26" width="26" x="577" y="332" as="geometry" />
</mxCell>
<mxCell id="body" parent="1" style="ellipse;fillColor=#FFB570;strokeColor=#C9772E;strokeWidth=3;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="240" width="240" x="280" y="300" as="geometry" />
</mxCell>
<mxCell id="belly" parent="1" style="ellipse;fillColor=#FFF1DE;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="150" width="120" x="340" y="360" as="geometry" />
</mxCell>
<mxCell id="pawL" parent="1" style="ellipse;fillColor=#FFB570;strokeColor=#C9772E;strokeWidth=3;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="44" width="70" x="322" y="500" as="geometry" />
</mxCell>
<mxCell id="pawR" parent="1" style="ellipse;fillColor=#FFB570;strokeColor=#C9772E;strokeWidth=3;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="44" width="70" x="408" y="500" as="geometry" />
</mxCell>
<mxCell id="toe1" edge="1" parent="1" style="endArrow=none;strokeWidth=2;strokeColor=#C9772E;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="347" y="530" as="sourcePoint" />
    <mxPoint x="347" y="540" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="toe2" edge="1" parent="1" style="endArrow=none;strokeWidth=2;strokeColor=#C9772E;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="367" y="530" as="sourcePoint" />
    <mxPoint x="367" y="540" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="toe3" edge="1" parent="1" style="endArrow=none;strokeWidth=2;strokeColor=#C9772E;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="433" y="530" as="sourcePoint" />
    <mxPoint x="433" y="540" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="toe4" edge="1" parent="1" style="endArrow=none;strokeWidth=2;strokeColor=#C9772E;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="453" y="530" as="sourcePoint" />
    <mxPoint x="453" y="540" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="collar" parent="1" style="rounded=1;arcSize=50;fillColor=#4FB3BF;strokeColor=#2E8C97;strokeWidth=2;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="156" x="322" y="330" as="geometry" />
</mxCell>
<mxCell id="earL" parent="1" style="triangle;direction=north;fillColor=#FFB570;strokeColor=#C9772E;strokeWidth=3;rotation=-18;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="110" width="110" x="262" y="68" as="geometry" />
</mxCell>
<mxCell id="earR" parent="1" style="triangle;direction=north;fillColor=#FFB570;strokeColor=#C9772E;strokeWidth=3;rotation=18;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="110" width="110" x="428" y="68" as="geometry" />
</mxCell>
<mxCell id="earInL" parent="1" style="triangle;direction=north;fillColor=#FFB3C6;strokeColor=none;rotation=-18;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="66" width="58" x="288" y="94" as="geometry" />
</mxCell>
<mxCell id="earInR" parent="1" style="triangle;direction=north;fillColor=#FFB3C6;strokeColor=none;rotation=18;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="66" width="58" x="454" y="94" as="geometry" />
</mxCell>
<mxCell id="head" parent="1" style="ellipse;fillColor=#FFB570;strokeColor=#C9772E;strokeWidth=3;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="230" width="300" x="250" y="110" as="geometry" />
</mxCell>
<mxCell id="stripeM" parent="1" style="rounded=1;arcSize=50;fillColor=#E8913F;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="34" width="10" x="395" y="114" as="geometry" />
</mxCell>
<mxCell id="stripeL" parent="1" style="rounded=1;arcSize=50;fillColor=#E8913F;strokeColor=none;rotation=-12;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="24" width="9" x="368" y="120" as="geometry" />
</mxCell>
<mxCell id="stripeR" parent="1" style="rounded=1;arcSize=50;fillColor=#E8913F;strokeColor=none;rotation=12;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="24" width="9" x="423" y="120" as="geometry" />
</mxCell>
<mxCell id="eyeL" parent="1" style="ellipse;fillColor=#3D2B1F;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="54" width="46" x="318" y="186" as="geometry" />
</mxCell>
<mxCell id="eyeR" parent="1" style="ellipse;fillColor=#3D2B1F;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="54" width="46" x="436" y="186" as="geometry" />
</mxCell>
<mxCell id="shineL1" parent="1" style="ellipse;fillColor=#FFFFFF;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="18" width="18" x="334" y="194" as="geometry" />
</mxCell>
<mxCell id="shineL2" parent="1" style="ellipse;fillColor=#FFFFFF;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="325" y="220" as="geometry" />
</mxCell>
<mxCell id="shineR1" parent="1" style="ellipse;fillColor=#FFFFFF;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="18" width="18" x="452" y="194" as="geometry" />
</mxCell>
<mxCell id="shineR2" parent="1" style="ellipse;fillColor=#FFFFFF;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="8" width="8" x="443" y="220" as="geometry" />
</mxCell>
<mxCell id="blushL" parent="1" style="ellipse;fillColor=#FFB3C6;strokeColor=none;opacity=80;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="22" width="42" x="296" y="246" as="geometry" />
</mxCell>
<mxCell id="blushR" parent="1" style="ellipse;fillColor=#FFB3C6;strokeColor=none;opacity=80;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="22" width="42" x="462" y="246" as="geometry" />
</mxCell>
<mxCell id="nose" parent="1" style="triangle;direction=south;fillColor=#FF8FAB;strokeColor=#D96A88;strokeWidth=1.5;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="15" width="22" x="389" y="248" as="geometry" />
</mxCell>
<mxCell id="mouth" edge="1" parent="1" style="endArrow=none;curved=1;strokeColor=#7A4A2A;strokeWidth=2.5;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="390" y="284" />
      <mxPoint x="400" y="262" />
      <mxPoint x="410" y="284" />
    </Array>
    <mxPoint x="382" y="270" as="sourcePoint" />
    <mxPoint x="418" y="270" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="wL1" edge="1" parent="1" style="endArrow=none;strokeColor=#7A4A2A;strokeWidth=2;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="292" y="256" as="sourcePoint" />
    <mxPoint x="212" y="244" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="wL2" edge="1" parent="1" style="endArrow=none;strokeColor=#7A4A2A;strokeWidth=2;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="292" y="266" as="sourcePoint" />
    <mxPoint x="206" y="268" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="wL3" edge="1" parent="1" style="endArrow=none;strokeColor=#7A4A2A;strokeWidth=2;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="292" y="276" as="sourcePoint" />
    <mxPoint x="212" y="292" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="wR1" edge="1" parent="1" style="endArrow=none;strokeColor=#7A4A2A;strokeWidth=2;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="508" y="256" as="sourcePoint" />
    <mxPoint x="588" y="244" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="wR2" edge="1" parent="1" style="endArrow=none;strokeColor=#7A4A2A;strokeWidth=2;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="508" y="266" as="sourcePoint" />
    <mxPoint x="594" y="268" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="wR3" edge="1" parent="1" style="endArrow=none;strokeColor=#7A4A2A;strokeWidth=2;html=1;" value="">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="508" y="276" as="sourcePoint" />
    <mxPoint x="588" y="292" as="targetPoint" />
  </mxGeometry>
</mxCell>
<mxCell id="bell" parent="1" style="ellipse;fillColor=#FFD54F;strokeColor=#C9A227;strokeWidth=2;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="22" width="22" x="389" y="340" as="geometry" />
</mxCell>
<mxCell id="bubble" parent="1" style="shape=mxgraph.basic.oval_callout;fillColor=#FFFFFF;strokeColor=#C9772E;strokeWidth=2;fontSize=22;fontStyle=1;fontColor=#C9772E;whiteSpace=wrap;html=1;" value="Meow!" vertex="1">
  <mxGeometry height="90" width="150" x="560" y="70" as="geometry" />
</mxCell>
<mxCell id="heart1" parent="1" style="shape=mxgraph.basic.heart;fillColor=#FF7A9A;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="26" width="28" x="610" y="190" as="geometry" />
</mxCell>
<mxCell id="heart2" parent="1" style="shape=mxgraph.basic.heart;fillColor=#FFB3C6;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="22" x="180" y="130" as="geometry" />
</mxCell>
<mxCell id="star1" parent="1" style="shape=mxgraph.basic.4_point_star;fillColor=#FFD54F;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="26" width="26" x="170" y="360" as="geometry" />
</mxCell>
<mxCell id="star2" parent="1" style="shape=mxgraph.basic.4_point_star;fillColor=#FFD54F;strokeColor=none;whiteSpace=wrap;html=1;" value="" vertex="1">
  <mxGeometry height="20" width="20" x="660" y="460" as="geometry" />
</mxCell>`,
    },
]

// The chat panel answers a built-in example from here, without a request.
// Examples that come with a file only match when that exact example file is
// attached, so a user's own file with the same prompt still goes to the model.
export function findCachedResponse(
    promptText: string,
    hasImage: boolean,
    fileName?: string,
): CachedResponse | undefined {
    return CACHED_EXAMPLE_RESPONSES.find(
        (c) =>
            c.promptText === promptText &&
            c.hasImage === hasImage &&
            (!c.fileName || c.fileName === fileName),
    )
}
