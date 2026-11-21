/**
 * HTML document rendered inside the WebView. Pure string builder (no React Native imports)
 * so the exact same page can be loaded in a desktop browser for verification.
 *
 * Bridge protocol
 *  RN -> page  (via injectJavaScript):  window.unfold.begin(id) / .chunk(id, b64) / .end(id, mime)
 *                                         window.unfold.reset() / .setAutoRotate(bool)
 *  page -> RN  (via ReactNativeWebView.postMessage, JSON):
 *      { type: 'ready' }
 *      { type: 'progress', loaded: 0..1 }
 *      { type: 'loaded', dimensions: {x,y,z} }   // model units from the GLB, NOT calibrated cm
 *      { type: 'error', message }
 *      { type: 'snapshot', reqId, data }          // JPEG data URL of the current render (thumbnail)
 */
export function buildViewerHtml(lib: string): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin:0; height:100%; overflow:hidden; background:#07090B;
    -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
  body { background:
      radial-gradient(120% 80% at 50% 38%, #16262A 0%, #0C1215 45%, #07090B 100%); }
  model-viewer { width:100%; height:100%; background:transparent; --poster-color:transparent;
    --progress-bar-color: transparent; opacity:0; transition: opacity 900ms ease, transform 1100ms cubic-bezier(.2,.8,.2,1);
    transform: scale(.92); }
  model-viewer.shown { opacity:1; transform: scale(1); }
  .floor { position:absolute; left:50%; bottom:14%; width:60vmin; height:12vmin; transform:translateX(-50%);
    background: radial-gradient(closest-side, rgba(94,234,212,.10), transparent); pointer-events:none; }
</style>
</head><body>
<div class="floor"></div>
<model-viewer id="mv" camera-controls touch-action="none" interaction-prompt="none"
  shadow-intensity="1" shadow-softness="0.9" exposure="1.05" tone-mapping="neutral"
  environment-image="neutral" min-camera-orbit="auto auto 5%" max-camera-orbit="auto auto 400%"
  interpolation-decay="120" camera-orbit="-30deg 75deg auto"></model-viewer>
<script>${lib}</script>
<script>
(function(){
  var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){ console.log('[unfold]', JSON.stringify(m)); } };
  window.onerror = function(msg){ post({type:'error', message:String(msg)}); };
  var mv = document.getElementById('mv');
  var parts = {}, currentUrl = null;

  mv.addEventListener('progress', function(e){ post({type:'progress', loaded: e.detail.totalProgress}); });
  mv.addEventListener('load', function(){
    var d = mv.getDimensions();
    mv.classList.add('shown');
    post({type:'loaded', dimensions:{x:d.x, y:d.y, z:d.z}});
  });
  mv.addEventListener('error', function(e){
    var detail = e && e.detail; post({type:'error', message: (detail && (detail.type || detail.sourceError && detail.sourceError.message)) || 'Model failed to load'});
  });

  function b64ToBytes(b64){
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  window.unfold = {
    begin: function(id){ parts[id] = []; },
    chunk: function(id, b64){ parts[id].push(b64ToBytes(b64)); },
    end: function(id, mime){
      var blob = new Blob(parts[id], {type: mime || 'model/gltf-binary'}); delete parts[id];
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(blob);
      mv.classList.remove('shown');
      mv.src = currentUrl;
    },
    loadUrl: function(url){ mv.classList.remove('shown'); mv.src = url; },
    reset: function(){
      mv.cameraOrbit = '-30deg 75deg auto'; mv.cameraTarget = 'auto auto auto'; mv.fieldOfView = 'auto';
      mv.resetTurntableRotation && mv.resetTurntableRotation();
    },
    setAutoRotate: function(on){ if (on) mv.setAttribute('auto-rotate',''); else mv.removeAttribute('auto-rotate'); },
    snapshot: function(reqId){
      try { post({type:'snapshot', reqId: reqId, data: mv.toDataURL('image/jpeg', 0.82)}); }
      catch(e){ post({type:'snapshot', reqId: reqId, error: String(e && e.message || e)}); }
    },
    // Called after rotation / split-view resize. model-viewer's ResizeObserver already resizes the
    // renderer and camera aspect; re-framing keeps the whole object in view for the new aspect.
    relayout: function(){ if (mv.loaded && mv.updateFraming) mv.updateFraming(); }
  };
  var resizeTimer = null;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){ window.unfold.relayout(); }, 180);
  });
  post({type:'ready'});
})();
</script>
</body></html>`;
}
