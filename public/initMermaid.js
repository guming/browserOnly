(() => {
  if (typeof mermaid === 'undefined') {
    console.warn('[initMermaid] Mermaid is not loaded');
    return;
  }

  // 初始化 Mermaid
  mermaid.initialize({
    startOnLoad: true,
    theme: 'default', // 可选：base, default, forest, dark 等
    securityLevel: 'loose', // 如果你渲染 HTML 内容，建议设置为 loose
  });

  console.log('[initMermaid] Mermaid initialized');
})();