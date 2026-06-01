import { extractTagsFromHTML, renderTagChips, apiFetch, parseMarkdown } from './utils.js';

const Editor = (() => {
  let _notes = [];
  let _linkSearchStart = null;
  let _activeEditorBody = null;
  let _activeTagsPreview = null;

  function initToolbar(toolbarEl, bodyEl, tagsPreviewEl) {
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
      case 'codeblock': insertCodeBlock(bodyEl, sel); break;
      case 'link': insertLink(sel, triggerEl); break;
      case 'hr': insertHR(bodyEl); break;
      case 'image': triggerImageUpload(bodyEl); break;
    }
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

  function toggleBlock(tag, bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const block = closestBlock(range.commonAncestorContainer, bodyEl);
    if (!block) return;

    const newEl = document.createElement(block.tagName.toLowerCase() === tag ? 'p' : tag);
    newEl.innerHTML = block.innerHTML;
    block.replaceWith(newEl);

    const newRange = document.createRange();
    newRange.selectNodeContents(newEl);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function toggleList(listTag, bodyEl, sel) {
    const range = sel.getRangeAt(0);
    const block = closestBlock(range.commonAncestorContainer, bodyEl);
    if (!block) return;

    const parentList = block.closest('ul, ol');
    let restoreTarget;

    if (parentList) {
      if (parentList.tagName.toLowerCase() === listTag) {
        // Toggle off — unwrap back to paragraph
        const p = document.createElement('p');
        p.innerHTML = block.innerHTML;
        parentList.replaceWith(p);
        restoreTarget = p;
      } else {
        // Switch list type in place (ul ↔ ol) without nesting
        const newList = document.createElement(listTag);
        newList.innerHTML = parentList.innerHTML;
        parentList.replaceWith(newList);
        restoreTarget = newList.querySelector('li') || newList;
      }
    } else {
      const list = document.createElement(listTag);
      const li = document.createElement('li');
      li.innerHTML = block.innerHTML;
      list.appendChild(li);
      block.replaceWith(list);
      restoreTarget = li;
    }

    const newRange = document.createRange();
    newRange.selectNodeContents(restoreTarget);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
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
    e.preventDefault();
    insertTextAtCursor(e.shiftKey ? '' : '  ');
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
    if (n === container) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      container.appendChild(p);
      return p;
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
