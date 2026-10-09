(function () {
  var section = document.getElementById('influencers');
  var root = section && section.closest('.shopify-section');
  if (!root || root.dataset.interactionsReady) return;
  root.dataset.interactionsReady = 'true';
  root.classList.add('tw-home-interactive');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var seen = new WeakSet();
  var observer = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      if (!reduced.matches && entry.target.animate) {
        entry.target.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.2,.7,.2,1)'});
      }
    });
  }, {threshold:.08}) : null;
  function watch(scope) {
    if (!observer || reduced.matches) return;
    scope.querySelectorAll('.sh,.inf-card,.dc,.hero__c').forEach(function (node) {
      if (seen.has(node)) return;
      seen.add(node);observer.observe(node);
    });
  }
  watch(root);
  var pending = false;
  var mutations = new MutationObserver(function (entries) {
    if (pending || !entries.some(function (entry) {return Array.from(entry.addedNodes).some(function (node) {return node.nodeType === 1;});})) return;
    pending = true;
    requestAnimationFrame(function () {pending = false;watch(root);});
  });
  mutations.observe(root,{childList:true,subtree:true});
  var top = document.createElement('button');
  top.type = 'button';top.className = 'tw-home-top';top.textContent = '↑ 맨 위로';top.hidden = true;
  top.setAttribute('aria-label','페이지 맨 위로 이동');
  document.body.appendChild(top);
  var scrollPending = false;
  function update() {top.hidden = window.scrollY < 650;scrollPending = false;}
  window.addEventListener('scroll',function () {if (!scrollPending) {scrollPending=true;requestAnimationFrame(update);}}, {passive:true});
  top.addEventListener('click',function () {
    window.scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'});
    var heading = root.querySelector('h1');
    if (heading) {heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  });
  reduced.addEventListener('change',function () {
    if (reduced.matches) root.getAnimations({subtree:true}).forEach(function (animation) {animation.cancel();});
    else watch(root);
  });
  update();
})();
