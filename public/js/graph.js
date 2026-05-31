const Graph = (() => {
  let _animFrame = null;
  let _nodes = [];
  let _edges = [];

  function render() {
    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d');
    const notes = window._notes || [];

    cancelAnimationFrame(_animFrame);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w;
    canvas.height = h;

    if (notes.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No notes to display', w / 2, h / 2);
      return;
    }

    _nodes = notes.map((n, i) => ({
      id: n.id,
      label: n.title || '(untitled)',
      x: w / 2 + (Math.random() - 0.5) * w * 0.6,
      y: h / 2 + (Math.random() - 0.5) * h * 0.6,
      vx: 0,
      vy: 0,
    }));

    _edges = [];
    const nodeMap = Object.fromEntries(_nodes.map(n => [n.id, n]));
    for (const note of notes) {
      for (const linkId of (note.links || [])) {
        if (nodeMap[linkId]) _edges.push({ source: note.id, target: linkId });
      }
    }

    let tick = 0;
    function step() {
      simulate();
      draw(ctx, w, h);
      tick++;
      if (tick < 200) _animFrame = requestAnimationFrame(step);
      else draw(ctx, w, h);
    }
    step();

    canvas.onclick = e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const node of _nodes) {
        const dx = node.x - mx, dy = node.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          window._noteView?.open(node.id);
          return;
        }
      }
    };
  }

  function simulate() {
    const k = 80;
    const gravity = 0.02;

    for (let i = 0; i < _nodes.length; i++) {
      for (let j = i + 1; j < _nodes.length; j++) {
        const a = _nodes[i], b = _nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (k * k) / dist;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    const nodeMap = Object.fromEntries(_nodes.map(n => [n.id, n]));
    for (const edge of _edges) {
      const a = nodeMap[edge.source], b = nodeMap[edge.target];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - k) * 0.05;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    const canvas = document.getElementById('graph-canvas');
    const cx = canvas.width / 2, cy = canvas.height / 2;

    for (const node of _nodes) {
      node.vx += (cx - node.x) * gravity;
      node.vy += (cy - node.y) * gravity;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(20, Math.min(canvas.width - 20, node.x));
      node.y = Math.max(20, Math.min(canvas.height - 20, node.y));
    }
  }

  function draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    const nodeMap = Object.fromEntries(_nodes.map(n => [n.id, n]));

    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 1;
    for (const edge of _edges) {
      const a = nodeMap[edge.source], b = nodeMap[edge.target];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const node of _nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#1db954';
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#e8e8e8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label.slice(0, 20), node.x, node.y + 20);
    }
  }

  return { render };
})();

export default Graph;
