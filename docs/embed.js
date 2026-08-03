/* Kawaii Shop Hop — optional script embed.
   <script src="https://ring.toothacheshop.com/embed.js" data-slug="your-slug" defer></script>
   Renders the same markup as the plain HTML snippet, in place. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = (s.getAttribute("data-slug") || "").trim();
  if (!slug) return;
  var host = "https://ring.toothacheshop.com";
  var d = document.createElement("div");
  d.className = "kawaii-shop-hop";
  d.style.cssText = "text-align:center;font:12px sans-serif;padding:14px 0";
  d.innerHTML =
    '<a href="' + host + '/prev/' + slug + '/">&#8592; prev</a>' +
    '<a href="' + host + '/" style="margin:0 10px"><img src="' + host +
    '/badge/badge.svg" alt="Kawaii Shop Hop" width="88" height="31" style="vertical-align:middle"></a>' +
    '<a href="' + host + '/next/' + slug + '/">next &#8594;</a>';
  s.parentNode.insertBefore(d, s);
})();
