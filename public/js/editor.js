import { extractTagsFromHTML, renderTagChips, apiFetch, parseMarkdown } from './utils.js';

const Editor = (() => {
  let _notes = [];
  let _linkSearchStart = null;
  let _activeEditorBody = null;
  let _activeTagsPreview = null;
  let _selectedImg = null;
  let _imgDrag = null;
  let _imgResizeInit = false;

  function initImgResize() {
    const overlay = document.getElementById('img-resize-overlay');
    if (!overlay) return;

    overlay.querySelectorAll('.img-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!_selectedImg) return;
        const rect = _selectedImg.getBoundingClientRect();
        _imgDrag = { pos: handle.dataset.pos, startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height };
      });
    });

    document.addEventListener('mousemove', e => {
      if (!_imgDrag || !_selectedImg) return;
      const { pos, startX, startY, startW, startH } = _imgDrag;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const isCorner = (pos.length === 2);

      if (isCorner) {
        const dxRel = pos.includes('e') ? dx / startW : -dx / startW;
        const dyRel = pos.includes('s') ? dy / startH : -dy / startH;
        const scale = Math.max(0.05, 1 + (dxRel + dyRel) / 2);
        _selectedImg.style.width = `${Math.max(20, startW * scale)}px`;
        _selectedImg.style.height = `${Math.max(20, startH * scale)}px`;
      } else {
        if (pos === 'e') _selectedImg.style.width = `${Math.max(20, startW + dx)}px`;
        else if (pos === 'w') _selectedImg.style.width = `${Math.max(20, startW - dx)}px`;
        else if (pos === 's') _selectedImg.style.height = `${Math.max(20, startH + dy)}px`;
        else if (pos === 'n') _selectedImg.style.height = `${Math.max(20, startH - dy)}px`;
      }
      positionImgOverlay();
    });

    document.addEventListener('mouseup', () => { _imgDrag = null; });

    document.addEventListener('mousedown', e => {
      if (!_selectedImg) return;
      if (e.target === _selectedImg || overlay.contains(e.target)) return;
      deselectImg();
    });

    document.addEventListener('keydown', e => {
      if (!_selectedImg) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        _selectedImg.remove();
        deselectImg();
      }
    });

    window.addEventListener('scroll', positionImgOverlay, true);
    window.addEventListener('resize', positionImgOverlay);
  }

  function selectImg(img) {
    _selectedImg = img;
    positionImgOverlay();
    document.getElementById('img-resize-overlay').classList.remove('hidden');
  }

  function deselectImg() {
    _selectedImg = null;
    _imgDrag = null;
    document.getElementById('img-resize-overlay').classList.add('hidden');
  }

  function positionImgOverlay() {
    if (!_selectedImg) return;
    const rect = _selectedImg.getBoundingClientRect();
    const overlay = document.getElementById('img-resize-overlay');
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function initToolbar(toolbarEl, bodyEl, tagsPreviewEl) {
    if (!_imgResizeInit) { initImgResize(); initTableToolbar(); _imgResizeInit = true; }
    _activeEditorBody = bodyEl;
    _activeTagsPreview = tagsPreviewEl;

    toolbarEl.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        bodyEl.focus();
        applyCommand(btn.dataset.cmd, bodyEl, btn);
        updateToolbarState(toolbarEl, bodyEl);
        updateTagsPreview(bodyEl, tagsPreviewEl);
      });
    });

    bodyEl.addEventListener('keyup', () => {
      updateToolbarState(toolbarEl, bodyEl);
      updateTagsPreview(bodyEl, tagsPreviewEl);
    });

    bodyEl.addEventListener('mouseup', () => updateToolbarState(toolbarEl, bodyEl));

    bodyEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const node = range.commonAncestorContainer;
          const li = (node.nodeType === Node.TEXT_NODE ? node.parentNode : node).closest('li');
          if (li && li.querySelector('input[type="checkbox"]')) {
            if (e.key === 'Enter') {
              e.preventDefault();
              const newLi = document.createElement('li');
              const cb = document.createElement('input');
              cb.type = 'checkbox';
              const text = document.createTextNode('​');
              newLi.appendChild(cb);
              newLi.appendChild(text);
              li.after(newLi);
              const newRange = document.createRange();
              newRange.setStart(text, text.length);
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
              return;
            }
            if (e.key === 'Backspace' && range.collapsed) {
              const checkbox = li.querySelector('input[type="checkbox"]');
              let textContent = '';
              li.childNodes.forEach(n => { if (n !== checkbox) textContent += n.textContent; });
              if (!textContent.replace(/​/g, '').trim()) {
                e.preventDefault();
                const ul = li.parentNode;
                li.remove();
                if (ul && ul.children.length === 0) ul.remove();
                return;
              }
            }
          }
        }
      }
      handleLinkAutocomplete(e, bodyEl);
      handleTabKey(e);
    });

    bodyEl.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) uploadImageFile(file, bodyEl);
            return;
          }
        }
      }
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      insertTextAtCursor(text);
      updateTagsPreview(bodyEl, tagsPreviewEl);
    });

    bodyEl.addEventListener('click', e => {
      if (e.target.tagName === 'IMG') {
        selectImg(e.target);
        return;
      }
      if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
        setTimeout(() => {
          if (e.target.checked) e.target.setAttribute('checked', '');
          else e.target.removeAttribute('checked');
        }, 0);
        return;
      }
      const a = e.target.closest('a');
      if (!a || a.classList.contains('note-link')) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        window.open(a.href, '_blank', 'noopener');
        return;
      }
      showLinkDialog(null, a);
    });
  }

  function applyCommand(cmd, bodyEl, triggerEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    switch (cmd) {
      case 'bold': wrapInline('strong', sel); break;
      case 'italic': wrapInline('em', sel); break;
      case 'underline': wrapInline('u', sel); break;
      case 'strikethrough': wrapInline('s', sel); break;
      case 'code': wrapInline('code', sel); break;
      case 'h1': toggleBlock('h1', bodyEl, sel); break;
      case 'h2': toggleBlock('h2', bodyEl, sel); break;
      case 'h3': toggleBlock('h3', bodyEl, sel); break;
      case 'blockquote': toggleBlock('blockquote', bodyEl, sel); break;
      case 'ul': toggleList('ul', bodyEl, sel); break;
      case 'ol': toggleList('ol', bodyEl, sel); break;
      case 'checklist': insertChecklist(bodyEl, sel); break;
      case 'codeblock': insertCodeBlock(bodyEl, sel); break;
      case 'link': insertLink(sel, triggerEl); break;
      case 'hr': insertHR(bodyEl); break;
      case 'image': triggerImageUpload(bodyEl); break;
      case 'table': insertTable(bodyEl, sel); break;
    }
  }

  function insertTable(bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let i = 0; i < 3; i++) {
      const th = document.createElement('th');
      th.textContent = 'Header';
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let r = 0; r < 3; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < 3; c++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const block = closestBlock(range.commonAncestorContainer, bodyEl);
    if (block) {
      block.after(table);
    } else {
      range.insertNode(table);
    }

    const firstTh = table.querySelector('th');
    if (firstTh) {
      const newRange = document.createRange();
      newRange.selectNodeContents(firstTh);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    updateTableToolbar();
  }

  function wrapInline(tag, sel) {
    const range = sel.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;
    const existing = closestTag(ancestor, tag);

    if (range.collapsed) {
      if (existing) {
        unwrapNode(existing);
        return;
      }
      const wrapper = document.createElement(tag);
      wrapper.appendChild(document.createTextNode('​'));
      range.insertNode(wrapper);
      const newRange = document.createRange();
      newRange.setStart(wrapper.firstChild, 0);
      newRange.setEnd(wrapper.firstChild, wrapper.firstChild.length);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }

    if (existing) {
      unwrapNode(existing);
      return;
    }

    const wrapper = document.createElement(tag);
    try {
      range.surroundContents(wrapper);
    } catch {
      const frag = range.extractContents();
      wrapper.appendChild(frag);
      range.insertNode(wrapper);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.addRange(newRange);
  }

  function inTableCell(node) {
    let n = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (n) {
      const t = n.tagName?.toLowerCase();
      if (t === 'td' || t === 'th') return true;
      if (t === 'table') return false;
      n = n.parentNode;
    }
    return false;
  }

  function getSelectedBlocks(range, bodyEl) {
    if (range.collapsed) {
      if (inTableCell(range.commonAncestorContainer)) return [];
      const anchor = range.commonAncestorContainer;
      // If cursor is directly in a ul/ol (not inside a li), don't format
      const directList = (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentNode)?.closest?.('ul, ol');
      if (directList && !anchor.closest?.('li')) return [];
      const b = closestBlock(anchor, bodyEl);
      return b ? [b] : [];
    }
    const leafTags = new Set(['p','h1','h2','h3','li','blockquote','pre']);
    const result = [];
    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (!leafTags.has(node.tagName.toLowerCase())) continue;
      if (!range.intersectsNode(node)) continue;
      const hasBlockChild = [...node.children].some(c => leafTags.has(c.tagName?.toLowerCase()));
      if (hasBlockChild) continue;
      result.push(node);
    }
    if (result.length === 0) {
      const b = closestBlock(range.commonAncestorContainer, bodyEl);
      if (b) result.push(b);
    }
    return result;
  }

  function toggleBlock(tag, bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const blocks = getSelectedBlocks(range, bodyEl);
    if (!blocks.length) return;

    const allMatch = blocks.every(b => b.tagName.toLowerCase() === tag);
    const targetTag = allMatch ? 'p' : tag;
    let lastEl;

    for (const block of blocks) {
      const newEl = document.createElement(targetTag);
      if (block.tagName.toLowerCase() === 'li') {
        const clone = block.cloneNode(true);
        clone.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.remove());
        newEl.innerHTML = clone.innerHTML.trim() || '<br>';
        const list = block.closest('ul, ol');
        block.before(newEl);
        block.remove();
        if (list && list.children.length === 0) list.remove();
      } else {
        newEl.innerHTML = block.innerHTML;
        block.replaceWith(newEl);
      }
      lastEl = newEl;
    }

    if (lastEl) {
      const newRange = document.createRange();
      newRange.selectNodeContents(lastEl);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  function toggleList(listTag, bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const blocks = getSelectedBlocks(range, bodyEl);
    if (!blocks.length) return;

    const allInTargetList = blocks.every(b => {
      if (b.tagName.toLowerCase() !== 'li') return false;
      const list = b.closest('ul, ol');
      return list && list.tagName.toLowerCase() === listTag;
    });

    let lastEl;

    if (allInTargetList) {
      for (const block of blocks) {
        const p = document.createElement('p');
        p.innerHTML = block.innerHTML.trim() || '<br>';
        const list = block.closest('ul, ol');
        block.before(p);
        block.remove();
        if (list && list.children.length === 0) list.remove();
        lastEl = p;
      }
    } else {
      const newList = document.createElement(listTag);
      for (const block of blocks) {
        const li = document.createElement('li');
        li.innerHTML = block.innerHTML;
        newList.appendChild(li);
        lastEl = li;
      }
      const firstBlock = blocks[0];
      if (firstBlock.tagName.toLowerCase() === 'li') {
        firstBlock.closest('ul, ol').before(newList);
      } else {
        firstBlock.before(newList);
      }
      for (const block of blocks) {
        if (block.tagName.toLowerCase() === 'li') {
          const list = block.closest('ul, ol');
          block.remove();
          if (list && list.children.length === 0) list.remove();
        } else {
          block.remove();
        }
      }
    }

    if (lastEl) {
      const newRange = document.createRange();
      newRange.selectNodeContents(lastEl);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  function insertChecklist(bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const blocks = getSelectedBlocks(range, bodyEl);
    if (!blocks.length) return;

    const allCheckbox = blocks.every(b =>
      b.tagName.toLowerCase() === 'li' && b.querySelector('input[type="checkbox"]')
    );

    if (allCheckbox) {
      let lastEl;
      for (const block of blocks) {
        const p = document.createElement('p');
        const clone = block.cloneNode(true);
        clone.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.remove());
        p.textContent = clone.textContent.replace(/^\s*/, '');
        const list = block.closest('ul, ol');
        block.before(p);
        block.remove();
        if (list && list.children.length === 0) list.remove();
        lastEl = p;
      }
      if (lastEl) {
        const newRange = document.createRange();
        newRange.selectNodeContents(lastEl);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      return;
    }

    const newList = document.createElement('ul');
    let lastText;
    for (const block of blocks) {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const raw = block.tagName.toLowerCase() === 'li'
        ? block.textContent.replace(/^\s*/, '')
        : block.textContent.trim();
      const text = document.createTextNode(' ' + raw);
      li.appendChild(cb);
      li.appendChild(text);
      newList.appendChild(li);
      lastText = text;
    }

    const firstBlock = blocks[0];
    if (firstBlock.tagName.toLowerCase() === 'li') {
      firstBlock.closest('ul, ol').before(newList);
    } else {
      firstBlock.before(newList);
    }
    for (const block of blocks) {
      if (block.tagName.toLowerCase() === 'li') {
        const list = block.closest('ul, ol');
        block.remove();
        if (list && list.children.length === 0) list.remove();
      } else {
        block.remove();
      }
    }

    if (lastText) {
      const newRange = document.createRange();
      newRange.setStart(lastText, lastText.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  function insertCodeBlock(bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const inPre = closestTag(range.commonAncestorContainer, 'pre');
    if (inPre) {
      const p = document.createElement('p');
      p.textContent = inPre.textContent;
      inPre.replaceWith(p);
      const newRange = document.createRange();
      newRange.selectNodeContents(p);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }

    const block = closestBlock(range.commonAncestorContainer, bodyEl);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = block ? block.textContent : '';
    pre.appendChild(code);
    if (block) {
      block.replaceWith(pre);
    } else {
      range.insertNode(pre);
    }
    const newRange = document.createRange();
    newRange.selectNodeContents(code);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function insertLink(sel, triggerEl) {
    const range = sel.getRangeAt(0).cloneRange();
    showLinkDialog(range, null, triggerEl);
  }

  function showLinkDialog(savedRange, existingAnchor, triggerEl) {
    const dialog = document.getElementById('link-dialog');
    const urlInput = document.getElementById('link-dialog-url');
    const textInput = document.getElementById('link-dialog-text');
    const saveBtn = document.getElementById('link-dialog-save');
    const removeBtn = document.getElementById('link-dialog-remove');
    const cancelBtn = document.getElementById('link-dialog-cancel');

    urlInput.value = existingAnchor ? (existingAnchor.getAttribute('href') || '') : '';
    textInput.value = existingAnchor ? existingAnchor.textContent : '';
    removeBtn.classList.toggle('hidden', !existingAnchor);

    let posRect = null;
    if (existingAnchor) {
      posRect = existingAnchor.getBoundingClientRect();
    } else if (savedRange) {
      const rects = savedRange.getClientRects();
      posRect = rects.length ? rects[rects.length - 1] : null;
    }
    if ((!posRect || posRect.height === 0) && triggerEl) {
      posRect = triggerEl.getBoundingClientRect();
    }

    if (posRect && posRect.height > 0) {
      let top = posRect.bottom + 6;
      let left = posRect.left;
      if (top + 140 > window.innerHeight) top = posRect.top - 146;
      if (left + 300 > window.innerWidth) left = window.innerWidth - 308;
      dialog.style.top = `${Math.max(6, top)}px`;
      dialog.style.left = `${Math.max(6, left)}px`;
      dialog.style.transform = '';
    } else {
      dialog.style.top = '30%';
      dialog.style.left = '50%';
      dialog.style.transform = 'translateX(-50%)';
    }

    dialog.classList.remove('hidden');
    urlInput.focus();
    urlInput.select();

    const close = () => {
      dialog.classList.add('hidden');
      saveBtn.onclick = null;
      removeBtn.onclick = null;
      cancelBtn.onclick = null;
      dialog.onkeydown = null;
    };

    const save = () => {
      const url = urlInput.value.trim();
      if (!url) { urlInput.focus(); return; }
      const text = textInput.value.trim();

      if (existingAnchor) {
        existingAnchor.href = url;
        if (text) existingAnchor.textContent = text;
      } else if (savedRange) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        if (text) {
          a.textContent = text;
          savedRange.deleteContents();
          savedRange.insertNode(a);
        } else if (!savedRange.collapsed) {
          try { savedRange.surroundContents(a); } catch {
            const frag = savedRange.extractContents();
            a.appendChild(frag);
            savedRange.insertNode(a);
          }
        } else {
          a.textContent = url;
          savedRange.insertNode(a);
        }
      }
      close();
    };

    saveBtn.onclick = save;
    removeBtn.onclick = () => { if (existingAnchor) unwrapNode(existingAnchor); close(); };
    cancelBtn.onclick = close;

    dialog.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
  }

  function insertHR(bodyEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const block = closestBlock(range.commonAncestorContainer, bodyEl);
    const hr = document.createElement('hr');

    if (block) {
      block.after(hr);
    } else {
      range.collapse(false);
      range.insertNode(hr);
    }

    let target = hr.nextElementSibling;
    if (!target) {
      target = document.createElement('p');
      target.innerHTML = '<br>';
      hr.after(target);
    }

    const newRange = document.createRange();
    newRange.setStart(target, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  async function uploadImageFile(file, bodyEl) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/attachments', {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    if (!res.ok) return;
    const { url } = await res.json();
    bodyEl.focus();
    insertImageAtCursor(url, file.name || 'image');
  }

  function triggerImageUpload(bodyEl) {
    const input = document.getElementById('image-upload-input');
    const savedRange = saveRange();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      input.value = '';
      restoreRange(savedRange);
      await uploadImageFile(file, bodyEl);
    };
    input.click();
  }

  function insertImageAtCursor(src, alt) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function saveRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0).cloneRange();
  }

  function restoreRange(range) {
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function handleLinkAutocomplete(e, bodyEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    if (e.key === 'Escape') {
      hideLinkAutocomplete();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = document.getElementById('link-autocomplete-list');
      if (document.getElementById('link-autocomplete').classList.contains('hidden')) return;
      e.preventDefault();
      navigateAutocomplete(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (e.key === 'Enter') {
      const highlighted = document.querySelector('#link-autocomplete-list .highlighted');
      if (highlighted) {
        e.preventDefault();
        highlighted.click();
        return;
      }
    }

    setTimeout(() => {
      const node = sel.focusNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) { hideLinkAutocomplete(); return; }

      const text = node.textContent.slice(0, sel.focusOffset);
      const idx = text.lastIndexOf('[[');
      if (idx === -1) { hideLinkAutocomplete(); return; }

      const query = text.slice(idx + 2);
      if (query.includes(']]')) { hideLinkAutocomplete(); return; }

      _linkSearchStart = { node, offset: idx };
      showLinkAutocomplete(query, range);
    }, 0);
  }

  function showLinkAutocomplete(query, range) {
    const notes = window._notes || [];
    const q = query.toLowerCase();
    const filtered = notes
      .filter(n => (n.title || '').toLowerCase().includes(q) || n.id.startsWith(q))
      .slice(0, 8);

    const ac = document.getElementById('link-autocomplete');
    const list = document.getElementById('link-autocomplete-list');

    if (filtered.length === 0) { hideLinkAutocomplete(); return; }

    list.innerHTML = filtered.map(n =>
      `<li><button data-id="${n.id}" data-title="${n.title || '(untitled)'}">${n.title || '(untitled)'}</button></li>`
    ).join('');

    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => insertNoteLink(btn.dataset.id, btn.dataset.title));
    });

    const rect = range.getBoundingClientRect();
    ac.style.left = `${rect.left}px`;
    ac.style.top = `${rect.bottom + 4}px`;
    ac.classList.remove('hidden');
  }

  function hideLinkAutocomplete() {
    document.getElementById('link-autocomplete').classList.add('hidden');
    _linkSearchStart = null;
  }

  function navigateAutocomplete(dir) {
    const buttons = [...document.querySelectorAll('#link-autocomplete-list button')];
    if (!buttons.length) return;
    const current = buttons.findIndex(b => b.classList.contains('highlighted'));
    buttons.forEach(b => b.classList.remove('highlighted'));
    const next = Math.max(0, Math.min(buttons.length - 1, current + dir));
    buttons[next].classList.add('highlighted');
  }

  function insertNoteLink(id, title) {
    hideLinkAutocomplete();
    if (!_linkSearchStart) return;

    const { node, offset } = _linkSearchStart;
    const fullText = node.textContent;
    const before = fullText.slice(0, offset);
    const after = fullText.slice(node.textContent.lastIndexOf('[[', offset + 2) + 2 + (fullText.slice(offset + 2).search(/\]\]|$/) === -1 ? fullText.length : 0));

    const anchor = document.createElement('a');
    anchor.href = `#${id}`;
    anchor.className = 'note-link';
    anchor.textContent = title;

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, node.textContent.length);
    range.deleteContents();

    node.textContent = before;
    node.parentNode.insertBefore(anchor, node.nextSibling);

    const space = document.createTextNode(' ');
    anchor.parentNode.insertBefore(space, anchor.nextSibling);

    range.setStart(space, 1);
    sel.removeAllRanges();
    sel.addRange(range);
    _linkSearchStart = null;
  }

  function handleTabKey(e) {
    if (e.key !== 'Tab') return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const node = sel.focusNode;
      const cell = (node?.nodeType === Node.TEXT_NODE ? node.parentNode : node)?.closest('td, th');
      if (cell) {
        e.preventDefault();
        const table = cell.closest('table');
        const cells = [...table.querySelectorAll('td, th')];
        const idx = cells.indexOf(cell);
        if (idx < cells.length - 1) {
          const next = cells[idx + 1];
          const newRange = document.createRange();
          newRange.selectNodeContents(next);
          newRange.collapse(false);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } else {
          const tbody = table.querySelector('tbody');
          const tr = document.createElement('tr');
          const colCount = table.querySelector('tr').children.length;
          for (let i = 0; i < colCount; i++) {
            const td = document.createElement('td');
            td.innerHTML = '<br>';
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
          const firstCell = tr.querySelector('td');
          const newRange = document.createRange();
          newRange.selectNodeContents(firstCell);
          newRange.collapse(false);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        return;
      }
    }
    e.preventDefault();
    insertTextAtCursor(e.shiftKey ? '' : '  ');
  }

  function updateTableToolbar() {
    const toolbar = document.getElementById('table-toolbar');
    if (!toolbar) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { toolbar.classList.add('hidden'); return; }
    const node = sel.focusNode;
    const cell = (node?.nodeType === Node.TEXT_NODE ? node.parentNode : node)?.closest('td, th');
    if (!cell) { toolbar.classList.add('hidden'); return; }
    const editorBody = cell.closest('#editor-body, #edit-editor-body');
    if (!editorBody) { toolbar.classList.add('hidden'); return; }
    const table = cell.closest('table');
    const rect = table.getBoundingClientRect();
    toolbar.classList.remove('hidden');
    const toolbarH = toolbar.offsetHeight || 32;
    toolbar.style.top = `${Math.max(4, rect.top - toolbarH - 6)}px`;
    toolbar.style.left = `${rect.left}px`;
  }

  function focusCell(cell) {
    if (!cell) return;
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(cell);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  document.addEventListener('selectionchange', updateTableToolbar);

  function tableToolbarAction(action) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.focusNode;
    const cell = (node?.nodeType === Node.TEXT_NODE ? node.parentNode : node)?.closest('td, th');
    if (!cell) return;
    const table = cell.closest('table');
    const thead = table.querySelector('thead');
    const currentRow = cell.closest('tr');
    const allRows = [...table.querySelectorAll('tr')];
    const rowIdx = allRows.indexOf(currentRow);
    const cellIdx = [...currentRow.children].indexOf(cell);

    if (action === 'addRow') {
      const colCount = table.querySelector('tr').children.length;
      const tr = document.createElement('tr');
      for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      currentRow.after(tr);
      focusCell(tr.cells[cellIdx] || tr.cells[0]);
    } else if (action === 'deleteRow') {
      if (allRows.length <= 1) return;
      const nextRow = allRows[rowIdx + 1] || allRows[rowIdx - 1];
      currentRow.remove();
      if (nextRow) focusCell(nextRow.cells[Math.min(cellIdx, nextRow.cells.length - 1)]);
    } else if (action === 'addCol') {
      table.querySelectorAll('tr').forEach((tr, i) => {
        const cells = [...tr.children];
        const insertAfter = tr === currentRow ? cell : (cells[cellIdx] || cells[cells.length - 1]);
        const newCell = document.createElement(i === 0 && thead ? 'th' : 'td');
        newCell.innerHTML = i === 0 && thead ? 'Header' : '<br>';
        insertAfter.after(newCell);
      });
      const newCell = currentRow.cells[cellIdx + 1];
      if (newCell) focusCell(newCell);
    } else if (action === 'deleteCol') {
      const colCount = currentRow.children.length;
      if (colCount <= 1) return;
      table.querySelectorAll('tr').forEach(tr => {
        const c = tr.children[cellIdx];
        if (c) c.remove();
      });
      const nextCell = currentRow.cells[Math.min(cellIdx, currentRow.cells.length - 1)];
      if (nextCell) focusCell(nextCell);
    } else if (action === 'mergeRight') {
      const right = cell.nextElementSibling;
      if (!right) return;
      const span = parseInt(cell.getAttribute('colspan') || 1);
      cell.setAttribute('colspan', span + 1);
      if (right.textContent.trim()) cell.innerHTML += ' ' + right.innerHTML;
      right.remove();
      focusCell(cell);
    } else if (action === 'mergeDown') {
      const nextRow = allRows[rowIdx + 1];
      if (!nextRow) return;
      const below = nextRow.cells[cellIdx];
      if (!below) return;
      const span = parseInt(cell.getAttribute('rowspan') || 1);
      cell.setAttribute('rowspan', span + 1);
      if (below.textContent.trim()) cell.innerHTML += ' ' + below.innerHTML;
      below.remove();
      focusCell(cell);
    } else if (action === 'splitCell') {
      const colspan = parseInt(cell.getAttribute('colspan') || 1);
      const rowspan = parseInt(cell.getAttribute('rowspan') || 1);
      if (colspan > 1) {
        cell.removeAttribute('colspan');
        for (let i = 1; i < colspan; i++) {
          const newCell = document.createElement(cell.tagName.toLowerCase());
          newCell.innerHTML = '<br>';
          cell.after(newCell);
        }
      } else if (rowspan > 1) {
        cell.removeAttribute('rowspan');
        for (let i = 1; i < rowspan; i++) {
          const targetRow = allRows[rowIdx + i];
          if (targetRow) {
            const newCell = document.createElement(cell.tagName.toLowerCase());
            newCell.innerHTML = '<br>';
            const ref = targetRow.cells[cellIdx];
            if (ref) ref.before(newCell); else targetRow.appendChild(newCell);
          }
        }
      }
      focusCell(cell);
    }
    setTimeout(updateTableToolbar, 0);
  }

  function initTableToolbar() {
    const toolbar = document.getElementById('table-toolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('[data-tbl]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        tableToolbarAction(btn.dataset.tbl);
      });
    });
  }

  function insertTextAtCursor(text) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function updateToolbarState(toolbarEl, bodyEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.focusNode;

    const cmdMap = {
      bold: ['strong', 'b'],
      italic: ['em', 'i'],
      underline: ['u'],
      strikethrough: ['s'],
      h1: ['h1'], h2: ['h2'], h3: ['h3'],
      blockquote: ['blockquote'],
      ul: ['ul'], ol: ['ol'],
      code: ['code'],
      codeblock: ['pre'],
    };

    const inPre = !!closestTag(node, 'pre');
    toolbarEl.querySelectorAll('[data-cmd]').forEach(btn => {
      const tags = cmdMap[btn.dataset.cmd];
      if (!tags) { btn.classList.remove('active'); return; }
      if (btn.dataset.cmd === 'code' && inPre) { btn.classList.remove('active'); return; }
      const active = tags.some(tag => !!closestTag(node, tag));
      btn.classList.toggle('active', active);
    });
  }

  function updateTagsPreview(bodyEl, previewEl) {
    if (!previewEl) return;
    const tags = extractTagsFromHTML(bodyEl.innerHTML);
    previewEl.innerHTML = renderTagChips(tags);
  }

  function closestTag(node, tag) {
    let n = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (n) {
      if (n.tagName && n.tagName.toLowerCase() === tag) return n;
      n = n.parentNode;
    }
    return null;
  }

  function closestBlock(node, container) {
    const blocks = new Set(['p','h1','h2','h3','li','blockquote','pre','div']);
    let n = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (n && n !== container) {
      if (blocks.has(n.tagName?.toLowerCase())) return n;
      n = n.parentNode;
    }
    return null;
  }

  function unwrapNode(node) {
    const parent = node.parentNode;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  function getContent(bodyEl) {
    return bodyEl.innerHTML;
  }

  function setContent(bodyEl, html) {
    bodyEl.innerHTML = html;
  }

  function clearContent(bodyEl) {
    bodyEl.innerHTML = '';
  }

  function saveDraft(key, bodyEl, titleEl) {
    localStorage.setItem(key, JSON.stringify({
      content: bodyEl.innerHTML,
      title: titleEl?.value || '',
    }));
  }

  function loadDraft(key, bodyEl, titleEl) {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.content) bodyEl.innerHTML = d.content;
      if (d.title && titleEl) titleEl.value = d.title;
    } catch {}
  }

  function clearDraft(key) {
    localStorage.removeItem(key);
  }

  function initImport(bodyEl, tagsPreviewEl) {
    const input = document.getElementById('md-import-input');
    document.getElementById('editor-import-btn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      input.value = '';
      const reader = new FileReader();
      reader.onload = e => {
        bodyEl.innerHTML = parseMarkdown(e.target.result);
        updateTagsPreview(bodyEl, tagsPreviewEl);
      };
      reader.readAsText(file);
    });
  }

  return {
    initToolbar,
    initImport,
    getContent,
    setContent,
    clearContent,
    updateTagsPreview,
    saveDraft,
    loadDraft,
    clearDraft,
    hideLinkAutocomplete,
  };
})();

export default Editor;
