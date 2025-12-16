import puppeteer from 'puppeteer';
import fs from 'fs';

const testXml = `<mxfile>
  <diagram name="Test" id="test">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Hello World" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

async function testExport() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  // Enable console logging
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Use the viewer.diagrams.net approach - open a URL that renders the diagram
  // This is the official way to render diagrams server-side
  const encodedXml = encodeURIComponent(testXml);

  // Alternative approach: Use the embed viewer with proper script loading
  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: white; }
        #diagram-container { padding: 20px; background: white; display: inline-block; }
    </style>
</head>
<body>
    <div id="diagram-container">
        <div class="mxgraph" style="max-width:100%;border:1px solid transparent;">
        </div>
    </div>
    <script type="text/javascript">
        // Store the XML to render
        window.diagramXml = ${JSON.stringify(testXml)};
    </script>
    <script type="text/javascript" src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

  // After the viewer script loads, it should auto-process .mxgraph elements
  // But we need to set the data-mxgraph attribute after the script loads
  await page.evaluate((xml) => {
    const config = {
      highlight: '#0000ff',
      nav: false,
      resize: true,
      toolbar: '',
      edit: '_blank',
      xml: xml
    };
    const mxgraphDiv = document.querySelector('.mxgraph');
    mxgraphDiv.setAttribute('data-mxgraph', JSON.stringify(config));

    // Trigger GraphViewer to process this element
    if (typeof GraphViewer !== 'undefined') {
      console.log('GraphViewer available, creating viewer...');
      GraphViewer.createViewerForElement(mxgraphDiv);
    } else {
      console.log('GraphViewer not available!');
    }
  }, testXml);

  // Wait for rendering
  await new Promise(r => setTimeout(r, 3000));

  // Check what we have
  const containerInfo = await page.evaluate(() => {
    const container = document.getElementById('diagram-container');
    const svgs = container.getElementsByTagName('svg');
    return {
      innerHTML: container.innerHTML.substring(0, 1000),
      svgCount: svgs.length,
      hasSvg: svgs.length > 0,
      firstSvgOuterHTML: svgs[0] ? svgs[0].outerHTML.substring(0, 500) : null
    };
  });

  console.log('Container info:', JSON.stringify(containerInfo, null, 2));

  // Take screenshot
  const container = await page.$('#diagram-container');
  if (container) {
    const screenshot = await container.screenshot({ type: 'png', encoding: 'base64' });
    fs.writeFileSync('/tmp/test-diagram.png', Buffer.from(screenshot, 'base64'));
    console.log('Wrote /tmp/test-diagram.png, size:', screenshot.length, 'base64 chars');
  }

  await browser.close();
}

testExport().catch(console.error);
