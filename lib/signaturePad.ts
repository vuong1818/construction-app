// The signature pad: one canvas in a WebView, shared by every place a
// person signs (safety paperwork, worker documents). Posts {type:'signature', data}
// or {type:'empty'} back to React Native.
export const SIGNATURE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; -webkit-user-select:none; user-select:none; }
    html, body { width:100%; height:100%; background:#F8FAFC; overflow:hidden; }
    #wrap { display:flex; flex-direction:column; width:100%; height:100%; }
    canvas {
      flex:1; width:100%; background:white;
      border-bottom:1px solid #E2E8F0;
      display:block; cursor:crosshair;
    }
    .bar {
      display:flex; align-items:center; gap:8px;
      padding:10px 12px; background:#F1F5F9;
    }
    .hint { flex:1; font-size:13px; color:#64748B; font-family:Arial,sans-serif; }
    button {
      padding:9px 18px; border:none; border-radius:8px;
      font-size:13px; font-weight:700; cursor:pointer; font-family:Arial,sans-serif;
    }
    .clear { background:#EF4444; color:#fff; }
    .save  { background:#16356B; color:#fff; }
  </style>
</head>
<body>
<div id="wrap">
  <canvas id="sig"></canvas>
  <div class="bar">
    <span class="hint">Sign with your finger</span>
    <button class="clear" ontouchend="clearSig(event)">Clear</button>
    <button class="save"  ontouchend="saveSig(event)">Done</button>
  </div>
</div>
<script>
  var canvas = document.getElementById('sig');
  var ctx    = canvas.getContext('2d');
  var drawing = false;
  var hasDrawn = false;
  var lastX = 0, lastY = 0;
  var ratio  = window.devicePixelRatio || 1;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  window.addEventListener('resize', resize);
  resize();

  function pos(e) {
    var rect  = canvas.getBoundingClientRect();
    var touch = e.changedTouches ? e.changedTouches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    drawing = true;
    var p = pos(e);
    lastX = p.x; lastY = p.y;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!drawing) return;
    hasDrawn = true;
    var p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    drawing = false;
  }, { passive: false });

  function clearSig(e) {
    if (e) e.preventDefault();
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    hasDrawn = false;
  }

  function saveSig(e) {
    if (e) e.preventDefault();
    if (!hasDrawn) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'empty' }));
      return;
    }
    var data = canvas.toDataURL('image/png');
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', data: data }));
  }
</script>
</body>
</html>
`;
