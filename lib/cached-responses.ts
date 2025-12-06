export interface CachedResponse {
    promptText: string
    hasImage: boolean
    xml: string
}

export const CACHED_EXAMPLE_RESPONSES: CachedResponse[] = [
    {
        promptText:
            "Give me a **animated connector** diagram of transformer's architecture",
        hasImage: false,
        xml: `<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>


  <mxCell id="title" value="Transformer Architecture" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=20;fontStyle=1;" vertex="1" parent="1">
    <mxGeometry x="300" y="20" width="250" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="input_embed" value="Input Embedding" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" vertex="1" parent="1">
    <mxGeometry x="80" y="480" width="120" height="40" as="geometry"/>
  </mxCell>


  <mxCell id="pos_enc_left" value="Positional Encoding" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" vertex="1" parent="1">
    <mxGeometry x="80" y="420" width="120" height="40" as="geometry"/>
  </mxCell>


  <mxCell id="encoder_box" value="ENCODER" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;verticalAlign=top;fontSize=12;fontStyle=1;" vertex="1" parent="1">
    <mxGeometry x="60" y="180" width="160" height="220" as="geometry"/>
  </mxCell>


  <mxCell id="mha_enc" value="Multi-Head&#xa;Attention" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="80" y="330" width="120" height="50" as="geometry"/>
  </mxCell>


  <mxCell id="add_norm1_enc" value="Add &amp; Norm" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="80" y="280" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="ff_enc" value="Feed Forward" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="80" y="240" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="add_norm2_enc" value="Add &amp; Norm" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="80" y="200" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="nx_enc" value="Nx" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=11;fontStyle=2;" vertex="1" parent="1">
    <mxGeometry x="30" y="275" width="30" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="output_embed" value="Output Embedding" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" vertex="1" parent="1">
    <mxGeometry x="650" y="480" width="120" height="40" as="geometry"/>
  </mxCell>


  <mxCell id="pos_enc_right" value="Positional Encoding" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" vertex="1" parent="1">
    <mxGeometry x="650" y="420" width="120" height="40" as="geometry"/>
  </mxCell>


  <mxCell id="decoder_box" value="DECODER" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;verticalAlign=top;fontSize=12;fontStyle=1;" vertex="1" parent="1">
    <mxGeometry x="630" y="140" width="160" height="260" as="geometry"/>
  </mxCell>


  <mxCell id="masked_mha_dec" value="Masked Multi-Head&#xa;Attention" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="650" y="340" width="120" height="50" as="geometry"/>
  </mxCell>


  <mxCell id="add_norm1_dec" value="Add &amp; Norm" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="650" y="290" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="mha_dec" value="Multi-Head&#xa;Attention" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="650" y="240" width="120" height="40" as="geometry"/>
  </mxCell>


  <mxCell id="add_norm2_dec" value="Add &amp; Norm" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="650" y="200" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="ff_dec" value="Feed Forward" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="650" y="160" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="add_norm3_dec" value="Add &amp; Norm" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;" vertex="1" parent="1">
    <mxGeometry x="650" y="120" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="nx_dec" value="Nx" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=11;fontStyle=2;" vertex="1" parent="1">
    <mxGeometry x="790" y="255" width="30" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="linear" value="Linear" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=11;" vertex="1" parent="1">
    <mxGeometry x="650" y="80" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="softmax" value="Softmax" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=11;" vertex="1" parent="1">
    <mxGeometry x="650" y="40" width="120" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="output" value="Output Probabilities" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;fontStyle=1;" vertex="1" parent="1">
    <mxGeometry x="640" y="0" width="140" height="30" as="geometry"/>
  </mxCell>


  <mxCell id="conn1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#6c8ebf;flowAnimation=1;" edge="1" parent="1" source="input_embed" target="pos_enc_left">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#6c8ebf;flowAnimation=1;" edge="1" parent="1" source="pos_enc_left" target="mha_enc">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn3" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#82b366;flowAnimation=1;" edge="1" parent="1" source="mha_enc" target="add_norm1_enc">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn4" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#d6b656;flowAnimation=1;" edge="1" parent="1" source="add_norm1_enc" target="ff_enc">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn5" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#82b366;flowAnimation=1;" edge="1" parent="1" source="ff_enc" target="add_norm2_enc">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>


  <mxCell id="conn_cross" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=3;strokeColor=#9673a6;flowAnimation=1;dashed=1;" edge="1" parent="1" source="add_norm2_enc" target="mha_dec">
    <mxGeometry relative="1" as="geometry">
      <Array as="points">
        <mxPoint x="400" y="215"/>
        <mxPoint x="400" y="260"/>
      </Array>
    </mxGeometry>
  </mxCell>
  <mxCell id="cross_label" value="K, V" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=10;fontStyle=1;fillColor=#ffffff;" vertex="1" connectable="0" parent="conn_cross">
    <mxGeometry x="-0.1" y="1" relative="1" as="geometry">
      <mxPoint x="10" y="-9" as="offset"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="conn6" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#d79b00;flowAnimation=1;" edge="1" parent="1" source="output_embed" target="pos_enc_right">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn7" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#d79b00;flowAnimation=1;" edge="1" parent="1" source="pos_enc_right" target="masked_mha_dec">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn8" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#82b366;flowAnimation=1;" edge="1" parent="1" source="masked_mha_dec" target="add_norm1_dec">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn9" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#d6b656;flowAnimation=1;" edge="1" parent="1" source="add_norm1_dec" target="mha_dec">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn10" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#82b366;flowAnimation=1;" edge="1" parent="1" source="mha_dec" target="add_norm2_dec">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn11" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#d6b656;flowAnimation=1;" edge="1" parent="1" source="add_norm2_dec" target="ff_dec">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn12" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#82b366;flowAnimation=1;" edge="1" parent="1" source="ff_dec" target="add_norm3_dec">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn13" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#b85450;flowAnimation=1;" edge="1" parent="1" source="add_norm3_dec" target="linear">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn14" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#b85450;flowAnimation=1;" edge="1" parent="1" source="linear" target="softmax">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>

  <mxCell id="conn15" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#6c8ebf;flowAnimation=1;" edge="1" parent="1" source="softmax" target="output">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>


  <mxCell id="res1_enc" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=1.5;strokeColor=#999999;dashed=1;flowAnimation=1;" edge="1" parent="1" source="mha_enc" target="add_norm1_enc">
    <mxGeometry relative="1" as="geometry">
      <Array as="points">
        <mxPoint x="50" y="355"/>
        <mxPoint x="50" y="295"/>
      </Array>
    </mxGeometry>
  </mxCell>

  <mxCell id="res2_enc" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=1.5;strokeColor=#999999;dashed=1;flowAnimation=1;" edge="1" parent="1" source="ff_enc" target="add_norm2_enc">
    <mxGeometry relative="1" as="geometry">
      <Array as="points">
        <mxPoint x="50" y="255"/>
        <mxPoint x="50" y="215"/>
      </Array>
    </mxGeometry>
  </mxCell>


  <mxCell id="res1_dec" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=1.5;strokeColor=#999999;dashed=1;flowAnimation=1;" edge="1" parent="1" source="masked_mha_dec" target="add_norm1_dec">
    <mxGeometry relative="1" as="geometry">
      <Array as="points">
        <mxPoint x="800" y="365"/>
        <mxPoint x="800" y="305"/>
      </Array>
    </mxGeometry>
  </mxCell>

  <mxCell id="res2_dec" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=1.5;strokeColor=#999999;dashed=1;flowAnimation=1;" edge="1" parent="1" source="mha_dec" target="add_norm2_dec">
    <mxGeometry relative="1" as="geometry">
      <Array as="points">
        <mxPoint x="800" y="260"/>
        <mxPoint x="800" y="215"/>
      </Array>
    </mxGeometry>
  </mxCell>

  <mxCell id="res3_dec" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=1.5;strokeColor=#999999;dashed=1;flowAnimation=1;" edge="1" parent="1" source="ff_dec" target="add_norm3_dec">
    <mxGeometry relative="1" as="geometry">
      <Array as="points">
        <mxPoint x="800" y="175"/>
        <mxPoint x="800" y="135"/>
      </Array>
    </mxGeometry>
  </mxCell>


  <mxCell id="input_label" value="Inputs" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;fontStyle=1;" vertex="1" parent="1">
    <mxGeometry x="110" y="530" width="60" height="20" as="geometry"/>
  </mxCell>

  <mxCell id="output_label" value="Outputs&#xa;(shifted right)" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;fontStyle=1;" vertex="1" parent="1">
    <mxGeometry x="660" y="530" width="100" height="30" as="geometry"/>
  </mxCell>
</root>`,
    },
    {
        promptText: "Replicate this in aws style",
        hasImage: true,
        xml: `<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>


  <mxCell id="2" value="AWS" style="sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud;strokeColor=#232F3E;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#232F3E;dashed=0;rounded=1;arcSize=5;" vertex="1" parent="1">
    <mxGeometry x="340" y="40" width="880" height="520" as="geometry"/>
  </mxCell>


  <mxCell id="3" value="User" style="sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#232F3D;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.user;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="80" y="240" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="4" value="EC2" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#ED7100;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="560" y="240" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="5" value="S3" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#7AA116;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="960" y="120" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="6" value="bedrock" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#01A88D;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.bedrock;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="960" y="260" width="78" height="78" as="geometry"/>
  </mxCell>


  <mxCell id="7" value="DynamoDB" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#C925D1;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;rounded=1;" vertex="1" parent="1">
    <mxGeometry x="960" y="400" width="78" height="78" as="geometry"/>
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
  </mxCell>
</root>`,
    },
    {
        promptText: "Replicate this flowchart.",
        hasImage: true,
        xml: `<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>


  <mxCell id="2" value="Lamp doesn't work" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffcccc;strokeColor=#000000;strokeWidth=2;fontSize=18;fontStyle=0;" vertex="1" parent="1">
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
  </mxCell>
</root>`,
    },
    {
        promptText: "Draw a cat for me",
        hasImage: false,
        xml: `<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>


  <mxCell id="2" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#FFE6CC;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
    <mxGeometry x="300" y="150" width="120" height="120" as="geometry"/>
  </mxCell>


  <mxCell id="3" value="" style="triangle;whiteSpace=wrap;html=1;fillColor=#FFE6CC;strokeColor=#000000;strokeWidth=2;rotation=30;" vertex="1" parent="1">
    <mxGeometry x="280" y="120" width="50" height="60" as="geometry"/>
  </mxCell>


  <mxCell id="4" value="" style="triangle;whiteSpace=wrap;html=1;fillColor=#FFE6CC;strokeColor=#000000;strokeWidth=2;rotation=-30;" vertex="1" parent="1">
    <mxGeometry x="390" y="120" width="50" height="60" as="geometry"/>
  </mxCell>


  <mxCell id="5" value="" style="triangle;whiteSpace=wrap;html=1;fillColor=#FFB6C1;strokeColor=none;rotation=30;" vertex="1" parent="1">
    <mxGeometry x="290" y="135" width="30" height="35" as="geometry"/>
  </mxCell>


  <mxCell id="6" value="" style="triangle;whiteSpace=wrap;html=1;fillColor=#FFB6C1;strokeColor=none;rotation=-30;" vertex="1" parent="1">
    <mxGeometry x="400" y="135" width="30" height="35" as="geometry"/>
  </mxCell>


  <mxCell id="7" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;" vertex="1" parent="1">
    <mxGeometry x="325" y="185" width="15" height="15" as="geometry"/>
  </mxCell>


  <mxCell id="8" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;" vertex="1" parent="1">
    <mxGeometry x="380" y="185" width="15" height="15" as="geometry"/>
  </mxCell>


  <mxCell id="9" value="" style="triangle;whiteSpace=wrap;html=1;fillColor=#FFB6C1;strokeColor=#000000;strokeWidth=1;rotation=180;" vertex="1" parent="1">
    <mxGeometry x="350" y="210" width="20" height="15" as="geometry"/>
  </mxCell>


  <mxCell id="10" value="" style="curved=1;endArrow=none;html=1;strokeColor=#000000;strokeWidth=2;exitX=0.5;exitY=1;exitDx=0;exitDy=0;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="360" y="220" as="sourcePoint"/>
      <mxPoint x="340" y="235" as="targetPoint"/>
      <Array as="points">
        <mxPoint x="355" y="230"/>
      </Array>
    </mxGeometry>
  </mxCell>


  <mxCell id="11" value="" style="curved=1;endArrow=none;html=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="360" y="220" as="sourcePoint"/>
      <mxPoint x="380" y="235" as="targetPoint"/>
      <Array as="points">
        <mxPoint x="365" y="230"/>
      </Array>
    </mxGeometry>
  </mxCell>


  <mxCell id="12" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.5;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="310" y="200" as="sourcePoint"/>
      <mxPoint x="260" y="195" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="13" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.5;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="310" y="210" as="sourcePoint"/>
      <mxPoint x="260" y="210" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="14" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.5;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="310" y="220" as="sourcePoint"/>
      <mxPoint x="260" y="225" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="15" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.5;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="410" y="200" as="sourcePoint"/>
      <mxPoint x="460" y="195" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="16" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.5;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="410" y="210" as="sourcePoint"/>
      <mxPoint x="460" y="210" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="17" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.5;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="410" y="220" as="sourcePoint"/>
      <mxPoint x="460" y="225" as="targetPoint"/>
    </mxGeometry>
  </mxCell>


  <mxCell id="18" value="" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE6CC;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
    <mxGeometry x="285" y="250" width="150" height="180" as="geometry"/>
  </mxCell>


  <mxCell id="19" value="" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=none;" vertex="1" parent="1">
    <mxGeometry x="315" y="280" width="90" height="120" as="geometry"/>
  </mxCell>


  <mxCell id="20" value="" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE6CC;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
    <mxGeometry x="300" y="410" width="40" height="50" as="geometry"/>
  </mxCell>


  <mxCell id="21" value="" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE6CC;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
    <mxGeometry x="380" y="410" width="40" height="50" as="geometry"/>
  </mxCell>


  <mxCell id="22" value="" style="curved=1;endArrow=none;html=1;strokeColor=#000000;strokeWidth=3;fillColor=#FFE6CC;" edge="1" parent="1">
    <mxGeometry width="50" height="50" relative="1" as="geometry">
      <mxPoint x="285" y="340" as="sourcePoint"/>
      <mxPoint x="240" y="260" as="targetPoint"/>
      <Array as="points">
        <mxPoint x="260" y="350"/>
        <mxPoint x="240" y="320"/>
        <mxPoint x="235" y="290"/>
      </Array>
    </mxGeometry>
  </mxCell>

</root>`,
    },
]

export function findCachedResponse(
    promptText: string,
    hasImage: boolean,
): CachedResponse | undefined {
    return CACHED_EXAMPLE_RESPONSES.find(
        (c) =>
            c.promptText === promptText &&
            c.hasImage === hasImage &&
            c.xml !== "",
    )
}
