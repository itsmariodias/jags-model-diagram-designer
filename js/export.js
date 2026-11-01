/*
 * Export: standalone SVG (copy or download) and a 3× PNG download.
 */

/** Serialise the current diagram as a standalone SVG on a white background. */
function buildSVG() {
  // render without the selection outline so it doesn't end up in the export
  const prev = sel;
  sel = null;
  renderAll();
  const bb = diagramBox(),
    pad = 28, // the same white border as before the box was worked out from the nodes
    x = bb.x - pad,
    y = bb.y - pad,
    w = Math.ceil(bb.width + 2 * pad),
    hgt = Math.ceil(bb.height + 2 * pad);
  const out = document.createElementNS(SVGNS, 'svg');
  out.setAttribute('xmlns', SVGNS);
  out.setAttribute('width', w);
  out.setAttribute('height', hgt);
  out.setAttribute('viewBox', `${x} ${y} ${w} ${hgt}`);
  out.setAttribute('style', `color:${INK}`);
  el('rect', { x, y, width: w, height: hgt, fill: '#ffffff' }, out);
  const g = vp.cloneNode(true);
  g.removeAttribute('transform');
  g.removeAttribute('id');
  g.querySelectorAll('.hit,.ui').forEach(z => z.remove());
  g.querySelectorAll('[id]').forEach(z => z.removeAttribute('id'));
  out.appendChild(g);
  const str =
    '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out);
  sel = prev;
  renderAll();
  return { str, w, h: hgt };
}

async function pngBlob() {
  const { str, w, h } = buildSVG();
  const scale = 3;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

/** Trigger a browser download of a string or Blob. */
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Saved ' + name);
}

function copySVG() {
  const { str } = buildSVG();
  const fallback = () => toast('Clipboard blocked here, use Save SVG');
  try {
    navigator.clipboard.writeText(str).then(() => toast('SVG copied'), fallback);
  } catch (e) {
    fallback();
  }
}

function saveSVG() {
  download('model-diagram.svg', buildSVG().str, 'image/svg+xml');
}

async function savePNG() {
  try {
    download('model-diagram.png', await pngBlob());
  } catch (e) {
    toast('Could not render PNG');
  }
}
