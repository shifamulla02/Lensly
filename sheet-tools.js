/**
 * Lensly Sheet Tools v9 — rebuilt to match content.css classes exactly
 * 1. Cell Tracker  — pink row+col highlight using existing CSS classes
 * 2. Formula Suggest — inline panel below formula bar
 * 3. Charts & Analytics — slide-in dashboard (lensly-inpage-dashboard)
 * 4. Jump Top / Bottom
 */
window.LenslySheetTools = (function () {

  let _toolbarInjected = false;
  let _cachedData = null;
  let _dashboardEl = null;

  // Tracker
  let _trackerEnabled = false;
  let _trackerListener = null;
  let _rowOv = null;
  let _colOv = null;

  // Formula suggest
  let _suggestEl = null;

  // ── Platform ───────────────────────────────────────────────────────────────
  function getSheetPlatform() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const search = location.search.toLowerCase();

    if (
      host.includes('mail.google.com') || 
      host.includes('outlook.live.com') || 
      host.includes('outlook.office.com') || 
      host.includes('outlook.office365.com') || 
      host.includes('mail.yahoo.com') || 
      host.includes('proton.me') ||
      path.includes('/document/') || // Google Docs
      path.includes('/presentation/') || // Google Slides
      path.includes('/forms/') || // Google Forms
      host.includes('word.office.com') || // Word Online
      host.includes('word.officeapps.live.com') || // Word Online
      path.includes('/:w:/') || // SharePoint Word
      path.includes('/:p:/') || // SharePoint PowerPoint
      search.includes('.docx') || // Word document query
      search.includes('.pptx') // PowerPoint query
    ) {
      return null;
    }

    if (host.includes('docs.google.com')) {
       if (path.includes('/spreadsheets/') && window === window.top) return 'gsheets';
       return null;
    }

    const isStrongExcel = 
      host.includes('excel.officeapps.live.com') || 
      host.includes('excel.cloud.microsoft') || 
      host.includes('usc-excel') || 
      path.includes('/:x:/') ||
      search.includes('app=excel') ||
      path.includes('xlviewerinternal.aspx');

    if (isStrongExcel) {
      return 'excel-online';
    }

    const isGenericMS = 
      host.includes('live.com') || 
      host.includes('sharepoint.com') || 
      host.includes('office.com') || 
      host.includes('office.net') || 
      host.includes('1drv.ms') ||
      host.includes('microsoft365.com') || 
      host.includes('cloud.microsoft') ||
      host.includes('microsoft.com') ||
      path.includes('excel');

    if (isGenericMS) {
      const title = document.title.toLowerCase();
      
      // Sure-fire Excel markers
      if (
        title.includes('.xls') || 
        title.includes('excel') ||
        document.querySelector('.ewa-stui-grid, canvas[data-id="EwaGrid"], .msexcel, [id*="formulaBar" i], [class*="formulaBar" i], [id*="sheet-tab" i], [data-automation-id*="Excel" i]')
      ) {
        return 'excel-online';
      }

      // Fallback: If it has generic Office markers (#WACViewPanel, #Ribbon)
      if (document.querySelector('#WACViewPanel, #Ribbon')) {
         const isWordOrPPT = 
            title.includes('.doc') || 
            title.includes('.ppt') || 
            title.includes('word') || 
            title.includes('powerpoint') ||
            document.querySelector('[data-automation-id*="Word" i], [data-automation-id*="PowerPoint" i], [class*="WordContext" i], [id*="WordContext" i]');
         
         if (!isWordOrPPT) {
            // It's Office Online, not Word, not PPT. If it has a grid or canvas, assume Excel.
            if (document.querySelector('div[role="grid"], table[role="grid"], canvas')) {
               return 'excel-online';
            }
         }
      }
    }

    return null;
  }

  // ════════════════════════════════════════════════════════════
  // DATA READING
  // ════════════════════════════════════════════════════════════
  function getData(forceRefresh) {
    if (_cachedData && !forceRefresh) return _cachedData;
    const platform = getSheetPlatform();
    let data = null;
    if (platform === 'gsheets') data = readGSheets();
    else if (platform === 'excel-online') data = readExcelOnline();
    if (!data) data = readAnyTable();
    _cachedData = data;
    return data;
  }

  function readGSheets() {
    const waffle = document.querySelector('.waffle');
    if (waffle) return parseTable(waffle);
    const grid = document.querySelector('table.grid-table');
    if (grid) return parseTable(grid);
    return null;
  }

  function readExcelOnline() {
    const gridEl = document.querySelector('[role="grid"]');
    if (!gridEl) return null;
    const rowEls = Array.from(gridEl.querySelectorAll('[role="row"]'));
    if (rowEls.length < 2) return null;
    const allRows = rowEls
      .map(r => Array.from(r.querySelectorAll('[role="gridcell"],[role="columnheader"]'))
        .map(c => (c.innerText || '').trim()))
      .filter(r => r.some(c => c.length > 0));
    if (allRows.length < 2) return null;
    return { headers: allRows[0], rows: allRows.slice(1) };
  }

  function parseTable(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return null;

    // Find first row that has at least 2 non-empty cells
    let firstDataRow = 0;
    for (let i = 0; i < rows.length; i++) {
      const texts = Array.from(rows[i].querySelectorAll('td,th')).map(c => (c.innerText || '').trim());
      if (texts.filter(t => t.length > 0).length >= 2) {
        firstDataRow = i;
        break;
      }
    }

    const allRows = [];
    for (let i = firstDataRow; i < rows.length && allRows.length < 5000; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td,th')).map(c => (c.innerText || '').trim().replace(/\n/g, ' '));
      // If first column is just a row number, shift it out
      if (cells.length > 1 && /^\d+$/.test(cells[0])) {
        cells.shift();
      }
      if (cells.some(c => c.length > 0)) {
        allRows.push(cells);
      }
    }

    if (allRows.length < 2) return null;
    // Ensure all rows have same length
    const maxLen = Math.max(...allRows.map(r => r.length));
    allRows.forEach(r => {
      while (r.length < maxLen) r.push('');
    });

    return { headers: allRows[0], rows: allRows.slice(1) };
  }

  function readAnyTable() {
    const tables = Array.from(document.querySelectorAll('table'))
      .filter(t => t.querySelectorAll('tr').length > 1)
      .sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length);
    return tables.length ? parseTable(tables[0]) : null;
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE 1: CELL TRACKER
  // Uses existing CSS classes from content.css:
  //   .lensly-tracker-row-highlight  (position:absolute, pink bg, pink border)
  //   .lensly-tracker-col-highlight  (position:absolute, pink bg, pink border)
  // We append them to the sheet's scroll container so absolute positioning works.
  // ════════════════════════════════════════════════════════════
  let _trackerInterval = null;

  function clearTrackerOverlays() {
    if (_rowOv) { try { _rowOv.remove(); } catch (_) { } _rowOv = null; }
    if (_colOv) { try { _colOv.remove(); } catch (_) { } _colOv = null; }
  }

  function toggleTracker(enabled) {
    _trackerEnabled = enabled;
    if (_trackerListener) {
      document.removeEventListener('click', _trackerListener, true);
      _trackerListener = null;
    }
    if (_trackerInterval) {
      clearInterval(_trackerInterval);
      _trackerInterval = null;
    }
    clearTrackerOverlays();
    if (!enabled) return;

    let lastTop = -1, lastLeft = -1;
    let _baseScreenX = -1;
    let _baseScreenY = -1;
    let _scrollDeltaX = 0;
    let _scrollDeltaY = 0;

    if (!window._lenslyScrollTracker) {
      window._lenslyScrollTracker = true;
      window._lastScrollPositions = new WeakMap();
      window._activeScrollContainers = [];
      
      document.addEventListener('scroll', function(e) {
         const target = (e.target === document || e.target === document.documentElement) ? window : e.target;
         const st = target === window ? (window.scrollY || document.documentElement.scrollTop) : target.scrollTop;
         const sl = target === window ? (window.scrollX || document.documentElement.scrollLeft) : target.scrollLeft;
         
         const prev = window._lastScrollPositions.get(target);
         if (prev) {
            const dy = st - prev.top;
            const dx = sl - prev.left;
            if (window._activeScrollContainers.includes(target) || window._activeScrollContainers.includes(window)) {
               _scrollDeltaY += dy;
               _scrollDeltaX += dx;
            }
         }
         window._lastScrollPositions.set(target, { top: st, left: sl });
      }, true);
    }

    function renderFixedOverlays(top, height, left, width) {
      if (!_rowOv) {
        _rowOv = document.createElement('div');
        _rowOv.className = 'lensly-overlay-highlight lensly-tracker-row-highlight';
        _rowOv.style.position = 'fixed';
        _rowOv.style.left = '0px';
        _rowOv.style.width = '100vw';
        _rowOv.style.pointerEvents = 'none';
        _rowOv.style.zIndex = '2147483647';
        _rowOv.style.backgroundColor = 'rgba(236, 72, 153, 0.2)';
        _rowOv.style.borderTop = '1.5px solid rgba(236, 72, 153, 0.8)';
        _rowOv.style.borderBottom = '1.5px solid rgba(236, 72, 153, 0.8)';
        document.body.appendChild(_rowOv);
      }
      if (!_colOv) {
        _colOv = document.createElement('div');
        _colOv.className = 'lensly-overlay-highlight lensly-tracker-col-highlight';
        _colOv.style.position = 'fixed';
        _colOv.style.top = '0px';
        _colOv.style.height = '100vh';
        _colOv.style.pointerEvents = 'none';
        _colOv.style.zIndex = '2147483647';
        _colOv.style.backgroundColor = 'rgba(236, 72, 153, 0.2)';
        _colOv.style.borderLeft = '1.5px solid rgba(236, 72, 153, 0.8)';
        _colOv.style.borderRight = '1.5px solid rgba(236, 72, 153, 0.8)';
        document.body.appendChild(_colOv);
      }
      _rowOv.style.top = top + 'px';
      _rowOv.style.height = height + 'px';
      _colOv.style.left = left + 'px';
      _colOv.style.width = width + 'px';
    }

    let _cachedExcelCell = null;

    function findExcelActiveCell() {
       if (_cachedExcelCell && document.body.contains(_cachedExcelCell)) {
          const style = window.getComputedStyle(_cachedExcelCell);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
             return _cachedExcelCell;
          }
       }
       _cachedExcelCell = null;

       const active = document.activeElement;
       if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
          const style = window.getComputedStyle(active);
          if (style.position === 'absolute' && !active.id.toLowerCase().includes('formula') && active.getBoundingClientRect().top > 50) {
             const rect = active.getBoundingClientRect();
             if (rect.width > 15 && rect.height > 15) {
                _cachedExcelCell = active;
                return active;
             }
          }
       }

       const grid = document.querySelector('[role="grid"], .ewa-stui-grid, #WACViewPanel') || document.body;
       const els = grid.querySelectorAll('div, rect, path');
       for (let i = 0; i < els.length; i++) {
          const el = els[i];
          const rect = el.getBoundingClientRect();
          
          if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < window.innerHeight) {
             const style = window.getComputedStyle(el);
             if (style.position === 'absolute' || el.tagName.toLowerCase() === 'rect') {
                
                if (style.cursor === 'crosshair' && rect.width <= 20 && rect.height <= 20) {
                   _cachedExcelCell = el;
                   return el;
                }
                
                if (rect.width > 10 && rect.width < 1500 && rect.height > 10 && rect.height < 1500) {
                   const bCol = style.borderColor || style.borderTopColor || style.stroke || style.backgroundColor || '';
                   const isGreen = bCol.includes('33, 115, 70') || bCol.includes('16, 124, 65') || 
                                   bCol.includes('33,115,70') || bCol.includes('16,124,65') || 
                                   bCol.includes('#217346') || bCol.includes('#107c41');
                   if (isGreen) {
                      _cachedExcelCell = el;
                      return el;
                   }
                }
             }
          }
       }
       return null;
    }

    _trackerInterval = setInterval(() => {
      // 1. Try Google Sheets active cell cover
      const cover = document.querySelector('.autofill-cover, .cell-selection');
      if (cover) {
        const rect = cover.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.top !== lastTop || rect.left !== lastLeft)) {
          lastTop = rect.top; lastLeft = rect.left;
          renderFixedOverlays(rect.top, rect.height, rect.left, rect.width);
        }
        if (_rowOv) _rowOv.style.display = 'block';
        if (_colOv) _colOv.style.display = 'block';
        return;
      }

      // 2. Excel Online tracking using hybrid DOM/Scroll approach
      const excelCell = findExcelActiveCell();
      if (excelCell) {
         const rect = excelCell.getBoundingClientRect();
         _baseScreenX = rect.right;
         _baseScreenY = rect.bottom;
         _scrollDeltaX = 0;
         _scrollDeltaY = 0;
      }

      if (_baseScreenX !== -1 && _baseScreenY !== -1) {
         const screenY = _baseScreenY - _scrollDeltaY;
         const screenX = _baseScreenX - _scrollDeltaX;
         
         // Keep the 6px perfect size requested by the user
         const thickness = 6;
         const newTop = screenY - (thickness / 2);
         const newLeft = screenX - (thickness / 2);

         if (newTop !== lastTop || newLeft !== lastLeft) {
           lastTop = newTop; lastLeft = newLeft;
           renderFixedOverlays(newTop, thickness, newLeft, thickness);
         }
         
         // Hide independently: if you scroll right, horizontal row should stay visible!
         if (screenY < -50 || screenY > window.innerHeight + 50) {
            if (_rowOv) _rowOv.style.display = 'none';
         } else {
            if (_rowOv) _rowOv.style.display = 'block';
         }

         if (screenX < -50 || screenX > window.innerWidth + 50) {
            if (_colOv) _colOv.style.display = 'none';
         } else {
            if (_colOv) _colOv.style.display = 'block';
         }
      }
    }, 50);

    // Capture click on Excel grid to lock coordinates
    _trackerListener = function (e) {
      if (document.querySelector('.autofill-cover, .cell-selection')) return;

      const isGrid = e.target.closest && e.target.closest('[role="grid"], .ewa-stui-grid, #WACViewPanel');
      if (e.target.tagName === 'CANVAS' || isGrid) {
        // Find which cell was clicked to snap to its right and bottom border
        const cells = document.querySelectorAll('[role="gridcell"], td, th');
        let foundCell = null;
        let minArea = Infinity;

        for (let i = 0; i < cells.length; i++) {
          const rect = cells[i].getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 &&
              e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const area = rect.width * rect.height;
            if (area < minArea) {
              minArea = area;
              foundCell = cells[i];
            }
          }
        }

        if (foundCell) {
           const rowEl = foundCell.closest('[role="row"]') || foundCell;
           _baseScreenY = rowEl.getBoundingClientRect().bottom;

           const colIndex = foundCell.getAttribute('aria-colindex');
           let header = null;
           if (colIndex) {
              header = document.querySelector(`[role="columnheader"][aria-colindex="${colIndex}"]`);
           }
           _baseScreenX = header ? header.getBoundingClientRect().right : foundCell.getBoundingClientRect().right;
        } else {
           _baseScreenX = e.clientX;
           _baseScreenY = e.clientY;
        }

        _scrollDeltaX = 0;
        _scrollDeltaY = 0;
        
        // Register all parent containers to track their scroll movements
        window._activeScrollContainers = [];
        let curr = e.target;
        while (curr && curr !== document.body) {
           window._activeScrollContainers.push(curr);
           
           // Initialize current scroll position for this container
           const st = curr.scrollTop || 0;
           const sl = curr.scrollLeft || 0;
           window._lastScrollPositions.set(curr, { top: st, left: sl });
           
           curr = curr.parentNode;
        }
        window._activeScrollContainers.push(window);
        window._lastScrollPositions.set(window, { top: window.scrollY, left: window.scrollX });
      }
    };
    document.addEventListener('mousedown', _trackerListener, true);
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE 2: FORMULA SUGGESTIONS
  // GSheets formula bar is a contenteditable div.
  // We listen on keyup (capture) on the entire document.
  // ════════════════════════════════════════════════════════════
  const FORMULAS = [
    { n: 'SUM', s: 'SUM(range)', d: 'Add all numbers in a range', e: '=SUM(B2:B100)', k: ['sum', 'add', 'total'] },
    { n: 'AVERAGE', s: 'AVERAGE(range)', d: 'Mean / average of values', e: '=AVERAGE(B2:B100)', k: ['avg', 'average', 'mean'] },
    { n: 'COUNT', s: 'COUNT(range)', d: 'Count cells that contain numbers', e: '=COUNT(A2:A100)', k: ['count', 'how many'] },
    { n: 'COUNTA', s: 'COUNTA(range)', d: 'Count non-empty cells', e: '=COUNTA(A2:A100)', k: ['counta', 'non empty', 'filled'] },
    { n: 'COUNTIF', s: 'COUNTIF(range, criteria)', d: 'Count cells matching a condition', e: '=COUNTIF(A2:A100,"Sales")', k: ['countif', 'count if'] },
    { n: 'COUNTIFS', s: 'COUNTIFS(rng1,crit1,rng2,crit2)', d: 'Count with multiple conditions', e: '=COUNTIFS(A:A,"Sales",B:B,">100")', k: ['countifs', 'multiple count'] },
    { n: 'SUMIF', s: 'SUMIF(range, criteria, sum_rng)', d: 'Sum cells matching a condition', e: '=SUMIF(A2:A100,"Sales",B2:B100)', k: ['sumif', 'sum if', 'conditional sum'] },
    { n: 'SUMIFS', s: 'SUMIFS(sum,rng1,crit1,rng2,c2)', d: 'Sum with multiple conditions', e: '=SUMIFS(C:C,A:A,"Sales",B:B,">50")', k: ['sumifs', 'multi sum'] },
    { n: 'MIN', s: 'MIN(range)', d: 'Lowest value in range', e: '=MIN(B2:B100)', k: ['min', 'minimum', 'lowest', 'smallest'] },
    { n: 'MAX', s: 'MAX(range)', d: 'Highest value in range', e: '=MAX(B2:B100)', k: ['max', 'maximum', 'highest', 'largest'] },
    { n: 'MEDIAN', s: 'MEDIAN(range)', d: 'Middle value', e: '=MEDIAN(B2:B100)', k: ['median', 'middle'] },
    { n: 'STDEV', s: 'STDEV(range)', d: 'Standard deviation of a sample', e: '=STDEV(B2:B100)', k: ['stdev', 'std', 'deviation'] },
    { n: 'ROUND', s: 'ROUND(number, digits)', d: 'Round to N decimal places', e: '=ROUND(A2,2)', k: ['round', 'decimal'] },
    { n: 'ABS', s: 'ABS(number)', d: 'Absolute (non-negative) value', e: '=ABS(A2)', k: ['abs', 'absolute', 'positive'] },
    { n: 'SQRT', s: 'SQRT(number)', d: 'Square root', e: '=SQRT(A2)', k: ['sqrt', 'square root'] },
    { n: 'POWER', s: 'POWER(base, exp)', d: 'Raise to a power', e: '=POWER(A2,2)', k: ['power', 'exponent', 'squared'] },
    { n: 'MOD', s: 'MOD(number, divisor)', d: 'Remainder after division', e: '=MOD(A2,2)', k: ['mod', 'remainder', 'modulo'] },
    { n: 'PRODUCT', s: 'PRODUCT(range)', d: 'Multiply all values', e: '=PRODUCT(B2:B10)', k: ['product', 'multiply'] },
    { n: 'RANK', s: 'RANK(val, range, 0)', d: 'Rank of value (0=desc)', e: '=RANK(B2,B$2:B$100,0)', k: ['rank', 'ranking'] },
    { n: 'VLOOKUP', s: 'VLOOKUP(val,table,col,FALSE)', d: 'Vertical lookup', e: '=VLOOKUP(A2,D2:F100,2,FALSE)', k: ['vlookup', 'lookup', 'find'] },
    { n: 'HLOOKUP', s: 'HLOOKUP(val,table,row,FALSE)', d: 'Horizontal lookup', e: '=HLOOKUP(A1,D1:J5,2,FALSE)', k: ['hlookup', 'horizontal lookup'] },
    { n: 'XLOOKUP', s: 'XLOOKUP(val,lkup_rng,ret_rng)', d: 'Modern flexible lookup', e: '=XLOOKUP(A2,D2:D100,E2:E100)', k: ['xlookup', 'modern lookup'] },
    { n: 'INDEX', s: 'INDEX(range, row, col)', d: 'Value at a row/col position', e: '=INDEX(B2:C100,3,1)', k: ['index', 'position', 'nth'] },
    { n: 'MATCH', s: 'MATCH(val, range, 0)', d: 'Position of value in range', e: '=MATCH("Sales",A2:A100,0)', k: ['match', 'find position', 'where'] },
    { n: 'IF', s: 'IF(condition, true, false)', d: 'Return value based on condition', e: '=IF(A2>100,"High","Low")', k: ['if', 'condition', 'when'] },
    { n: 'IFS', s: 'IFS(cond1,val1, cond2,val2)', d: 'Multiple IF conditions', e: '=IFS(A2>100,"High",A2>50,"Med",TRUE,"Low")', k: ['ifs', 'multiple if', 'else if'] },
    { n: 'AND', s: 'AND(cond1, cond2)', d: 'True if ALL conditions met', e: '=AND(A2>0,B2="Active")', k: ['and', 'all conditions'] },
    { n: 'OR', s: 'OR(cond1, cond2)', d: 'True if ANY condition met', e: '=OR(A2="Sales",A2="Marketing")', k: ['or', 'any condition'] },
    { n: 'IFERROR', s: 'IFERROR(value, fallback)', d: 'Show fallback if formula errors', e: '=IFERROR(A2/B2,0)', k: ['iferror', 'error', 'divide', 'fallback'] },
    { n: 'ISBLANK', s: 'ISBLANK(cell)', d: 'True if cell is empty', e: '=ISBLANK(A2)', k: ['isblank', 'empty', 'blank'] },
    { n: 'SWITCH', s: 'SWITCH(expr,val1,res1,...,def)', d: 'Match expression against values', e: '=SWITCH(A2,"A","Exc","B","Good","Avg")', k: ['switch', 'case', 'map'] },
    { n: 'CONCATENATE', s: 'CONCATENATE(text1, text2)', d: 'Join text from cells', e: '=CONCATENATE(A2," ",B2)', k: ['concat', 'join', 'combine', 'merge'] },
    { n: 'TEXTJOIN', s: 'TEXTJOIN(delim, skip, range)', d: 'Join range with delimiter', e: '=TEXTJOIN(", ",TRUE,A2:A10)', k: ['textjoin', 'join comma'] },
    { n: 'LEFT', s: 'LEFT(text, n)', d: 'First N characters', e: '=LEFT(A2,3)', k: ['left', 'first chars', 'prefix'] },
    { n: 'RIGHT', s: 'RIGHT(text, n)', d: 'Last N characters', e: '=RIGHT(A2,4)', k: ['right', 'last chars', 'suffix'] },
    { n: 'MID', s: 'MID(text, start, n)', d: 'Characters from middle of string', e: '=MID(A2,3,5)', k: ['mid', 'middle', 'substring'] },
    { n: 'LEN', s: 'LEN(text)', d: 'Count characters in a string', e: '=LEN(A2)', k: ['len', 'length', 'characters'] },
    { n: 'TRIM', s: 'TRIM(text)', d: 'Remove extra spaces', e: '=TRIM(A2)', k: ['trim', 'spaces', 'whitespace'] },
    { n: 'UPPER', s: 'UPPER(text)', d: 'Convert to UPPERCASE', e: '=UPPER(A2)', k: ['upper', 'uppercase', 'caps'] },
    { n: 'LOWER', s: 'LOWER(text)', d: 'Convert to lowercase', e: '=LOWER(A2)', k: ['lower', 'lowercase'] },
    { n: 'PROPER', s: 'PROPER(text)', d: 'Capitalise Each Word', e: '=PROPER(A2)', k: ['proper', 'title case', 'capitalise'] },
    { n: 'SUBSTITUTE', s: 'SUBSTITUTE(text, old, new)', d: 'Replace text in a string', e: '=SUBSTITUTE(A2,"-","/")', k: ['substitute', 'replace', 'swap'] },
    { n: 'TEXT', s: 'TEXT(value, format)', d: 'Format number as text', e: '=TEXT(A2,"DD/MM/YYYY")', k: ['text format', 'format', 'display as'] },
    { n: 'VALUE', s: 'VALUE(text)', d: 'Convert text to number', e: '=VALUE(A2)', k: ['value', 'to number', 'convert'] },
    { n: 'TODAY', s: 'TODAY()', d: "Today's date", e: '=TODAY()', k: ['today', 'current date'] },
    { n: 'NOW', s: 'NOW()', d: 'Current date and time', e: '=NOW()', k: ['now', 'current time', 'timestamp'] },
    { n: 'DATE', s: 'DATE(year, month, day)', d: 'Build a date from parts', e: '=DATE(2024,6,15)', k: ['date', 'create date', 'build date'] },
    { n: 'YEAR', s: 'YEAR(date)', d: 'Extract year from date', e: '=YEAR(A2)', k: ['year', 'extract year'] },
    { n: 'MONTH', s: 'MONTH(date)', d: 'Extract month from date', e: '=MONTH(A2)', k: ['month', 'extract month'] },
    { n: 'DAY', s: 'DAY(date)', d: 'Extract day from date', e: '=DAY(A2)', k: ['day', 'extract day'] },
    { n: 'DATEDIF', s: 'DATEDIF(start, end, "D")', d: 'Days/months/years between dates', e: '=DATEDIF(A2,TODAY(),"D")', k: ['datedif', 'days between', 'date diff', 'age'] },
    { n: 'NETWORKDAYS', s: 'NETWORKDAYS(start, end)', d: 'Working days between dates', e: '=NETWORKDAYS(A2,B2)', k: ['networkdays', 'working days', 'business days'] },
    { n: 'EDATE', s: 'EDATE(date, months)', d: 'Add months to a date', e: '=EDATE(A2,3)', k: ['edate', 'add months'] },
    { n: 'FILTER', s: 'FILTER(range, condition)', d: 'Filter by condition (365/GSheets)', e: '=FILTER(A2:C100,B2:B100="Active")', k: ['filter', 'where', 'show only'] },
    { n: 'SORT', s: 'SORT(range, col, ascending)', d: 'Sort a range dynamically', e: '=SORT(A2:C100,2,FALSE)', k: ['sort', 'order by'] },
    { n: 'UNIQUE', s: 'UNIQUE(range)', d: 'Return unique values from range', e: '=UNIQUE(A2:A100)', k: ['unique', 'distinct', 'deduplicate'] },
    { n: 'ARRAYFORMULA', s: 'ARRAYFORMULA(formula)', d: 'Apply formula to entire range', e: '=ARRAYFORMULA(A2:A100*B2:B100)', k: ['arrayformula', 'array', 'entire column'] },
    { n: 'QUERY', s: 'QUERY(data, "SELECT A WHERE...")', d: 'SQL-like query on data (GSheets)', e: '=QUERY(A1:C100,"SELECT A,B WHERE C>50")', k: ['query', 'sql', 'select'] },
    { n: 'IMPORTRANGE', s: 'IMPORTRANGE(url, range)', d: 'Import from another spreadsheet', e: '=IMPORTRANGE("url","Sheet1!A1:D100")', k: ['importrange', 'import', 'external'] },
    { n: 'PMT', s: 'PMT(rate, nper, pv)', d: 'Loan/mortgage payment per period', e: '=PMT(0.05/12,60,-10000)', k: ['pmt', 'loan', 'mortgage', 'emi'] },
    { n: 'NPV', s: 'NPV(rate, values)', d: 'Net present value', e: '=NPV(0.1,B2:B6)', k: ['npv', 'net present value'] },
    { n: 'SPLIT', s: 'SPLIT(text, delimiter)', d: 'Split text into columns (GSheets)', e: '=SPLIT(A2,",")', k: ['split', 'separate', 'delimiter'] },
  ];

  function scoreFormulas(typed) {
    const t = typed.toLowerCase().replace(/^=/, '').trim();
    if (!t) return [];
    return FORMULAS.map(function (f) {
      var score = 0;
      var fn = f.n.toLowerCase();
      if (fn === t) score = 300;
      else if (fn.startsWith(t)) score = 200;
      else if (fn.includes(t)) score = 80;
      f.k.forEach(function (kw) {
        if (t === kw) score += 60;
        else if (kw.startsWith(t)) score += 40;
        else if (t.includes(kw) || kw.includes(t)) score += 20;
      });
      if (f.d.toLowerCase().includes(t) && t.length > 2) score += 10;
      return Object.assign({}, f, { score: score });
    }).filter(function (f) { return f.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 6);
  }

  let _formulaTimeout = null;

  async function getGroqFormulaSuggestions(query) {
    const k = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));
    if (!k) return scoreFormulas(query); // fallback

    let contextStr = '';
    let data = getData(false);
    if (data && data.headers) {
      contextStr = `Headers: ${data.headers.join(', ')}\n`;
      if (data.rows && data.rows.length) {
        contextStr += `First Row: ${data.rows[0].join(', ')}\n`;
      }
    }

    const prompt =
      `The user is typing a spreadsheet formula: "${query}".\n` +
      (contextStr ? `Context of current sheet:\n${contextStr}\n` : '') +
      `Provide 3 highly relevant spreadsheet formula suggestions (GSheets/Excel compatible) for what they might be trying to calculate.\n` +
      `Return ONLY a JSON object containing a "suggestions" array of 3 objects with keys: "n" (Formula name/intent), "s" (syntax), "d" (brief description), "e" (example starting with =).`;

    try {
      const response = await window.LenslySummarizer.groqChat(
        [{ role: 'user', content: prompt }],
        '',
        k,
        {
          jsonMode: true,
          systemInstruction: 'You are an expert spreadsheet assistant. Output ONLY a valid JSON object.',
          temperature: 0.2,
          maxTokens: 500
        }
      );

      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.substring(7);
      else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.substring(3);
      if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.substring(0, cleanResponse.length - 3);
      cleanResponse = cleanResponse.trim();

      const parsed = JSON.parse(cleanResponse);
      return parsed.suggestions || scoreFormulas(query);
    } catch (err) {
      console.warn('Groq formula fail:', err);
      return scoreFormulas(query);
    }
  }

  function initFormulaSuggest() {
    if (_suggestEl) { _suggestEl.remove(); _suggestEl = null; }

    _suggestEl = document.createElement('div');
    _suggestEl.id = 'lensly-formula-suggest';
    _suggestEl.style.cssText = [
      'position:fixed',
      'display:none',
      'z-index:2147483600',
      'background:#fff',
      'border:1px solid #d0d9e2',
      'border-radius:10px',
      'box-shadow:0 8px 28px rgba(39,76,119,0.22)',
      "font-family:-apple-system,'Segoe UI',sans-serif",
      'min-width:320px',
      'max-width:480px',
      'overflow:hidden',
    ].join(';');
    _suggestEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'background:#f2f5f8;padding:7px 12px;border-bottom:1px solid #e7ecef;">' +
      '<span style="font-size:10.5px;font-weight:700;color:#274c77;letter-spacing:.05em;">FORMULA SUGGESTIONS</span>' +
      '<button id="lfs-x" style="background:none;border:none;color:#7a96ae;font-size:17px;cursor:pointer;line-height:1;">&times;</button>' +
      '</div>' +
      '<div id="lfs-body" style="max-height:300px;overflow-y:auto;"></div>';
    document.body.appendChild(_suggestEl);
    _suggestEl.querySelector('#lfs-x').addEventListener('click', function () {
      _suggestEl.style.display = 'none';
    });

    // Listen on keyup in capture phase — catches GSheets contenteditable formula bar
    document.addEventListener('keyup', function (e) {
      // Ignore pure modifier / navigation keys
      var ignore = ['Escape', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
      if (ignore.indexOf(e.key) !== -1) {
        if (e.key === 'Escape' && _suggestEl) _suggestEl.style.display = 'none';
        return;
      }

      var target = e.target;
      if (!target) return;

      var editable = target.closest ? target.closest('[contenteditable="true"], [contenteditable=""], #t-formula-bar-input') : null;
      if (!editable && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) editable = target;
      if (!editable) return;

      var val = (editable.value !== undefined ? editable.value : (editable.innerText || editable.textContent || ''));
      val = val.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

      if (!val.startsWith('=')) {
        _suggestEl.style.display = 'none';
        return;
      }

      // Fast local fallback immediately
      if (val.length > 1) {
        var localSugg = scoreFormulas(val);
        if (localSugg.length) renderSuggestions(localSugg, editable, val);
      }

      if (_formulaTimeout) clearTimeout(_formulaTimeout);
      _formulaTimeout = setTimeout(async function () {
        if (!document.body.contains(editable)) return;

        // Show AI loading state
        renderSuggestions([{ n: '✨ AI Suggestion', s: 'Thinking...', d: 'Asking Groq...', e: val }], editable, val);

        var aiSuggestions = await getGroqFormulaSuggestions(val);
        if (aiSuggestions && aiSuggestions.length) {
          renderSuggestions(aiSuggestions, editable, val);
        } else {
          _suggestEl.style.display = 'none';
        }
      }, 700);
    }, true);

    // Also listen on 'input' for normal inputs
    document.addEventListener('input', function (e) {
      var target = e.target;
      if (!target) return;
      var editable = target.closest ? target.closest('[contenteditable="true"], [contenteditable=""], #t-formula-bar-input') : null;
      if (!editable && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) editable = target;
      if (!editable || editable.isContentEditable) return; // contenteditable handled by keyup

      var val = (editable.value !== undefined ? editable.value : (editable.innerText || editable.textContent || ''));
      val = val.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

      if (!val.startsWith('=')) { _suggestEl.style.display = 'none'; return; }

      if (val.length > 1) {
        var localSugg = scoreFormulas(val);
        if (localSugg.length) renderSuggestions(localSugg, editable, val);
      }

      if (_formulaTimeout) clearTimeout(_formulaTimeout);
      _formulaTimeout = setTimeout(async function () {
        if (!document.body.contains(editable)) return;
        renderSuggestions([{ n: '✨ AI Suggestion', s: 'Thinking...', d: 'Asking Groq...', e: val }], editable, val);
        var aiSuggestions = await getGroqFormulaSuggestions(val);
        if (aiSuggestions && aiSuggestions.length) {
          renderSuggestions(aiSuggestions, editable, val);
        } else {
          _suggestEl.style.display = 'none';
        }
      }, 700);
    }, true);

    // Hide on outside click
    document.addEventListener('mousedown', function (e) {
      if (_suggestEl && !_suggestEl.contains(e.target)) {
        _suggestEl.style.display = 'none';
      }
    }, true);
  }

  function renderSuggestions(suggestions, target, currentVal) {
    var body = _suggestEl.querySelector('#lfs-body');
    body.innerHTML = '';

    suggestions.forEach(function (f, idx) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:9px 13px;cursor:pointer;' +
        (idx < suggestions.length - 1 ? 'border-bottom:1px solid #f2f5f8;' : '');

      row.innerHTML =
        '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px;">' +
        '<span style="font-size:13px;font-weight:700;color:#274c77;font-family:monospace;">' + f.n + '</span>' +
        '<span style="font-size:10.5px;color:#94a3b8;font-family:monospace;">' + f.s + '</span>' +
        '</div>' +
        '<div style="font-size:11.5px;color:#475569;margin-bottom:3px;">' + f.d + '</div>' +
        '<div style="font-size:10.5px;color:#94a3b8;font-family:monospace;">' + f.e + '</div>';

      row.addEventListener('mouseover', function () { row.style.background = '#f0f6ff'; });
      row.addEventListener('mouseout', function () { row.style.background = ''; });

      row.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        // Insert full example into the formula input
        if (target.isContentEditable) {
          target.textContent = f.e;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          target.value = f.e;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
        target.focus();
        // Move caret to end for contenteditable
        try {
          var range = document.createRange();
          var sel = window.getSelection();
          range.selectNodeContents(target);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) { }
        _suggestEl.style.display = 'none';
      });

      body.appendChild(row);
    });

    // Position below the active input element
    var rect = target.getBoundingClientRect();
    var top = Math.min(rect.bottom + 4, window.innerHeight - 340);
    var left = Math.max(4, Math.min(rect.left, window.innerWidth - 500));
    _suggestEl.style.top = top + 'px';
    _suggestEl.style.left = left + 'px';
    _suggestEl.style.display = 'block';
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE 3: CHARTS DASHBOARD
  // Uses existing .lensly-inpage-dashboard CSS classes exactly
  // ════════════════════════════════════════════════════════════
  function initDashboard() {
    if (document.getElementById('lensly-sheet-dashboard')) return;
    _dashboardEl = document.createElement('div');
    _dashboardEl.id = 'lensly-sheet-dashboard';
    _dashboardEl.className = 'lensly-inpage-dashboard';
    _dashboardEl.innerHTML =
      '<div class="lid-header" style="border-bottom:none; padding-bottom:0; background:#f8fafc;">' +
      '<div class="lid-header-title" style="margin-bottom:12px;">Lensly Sheets</div>' +
      '<button class="lid-close" type="button" style="top:12px;">&times;</button>' +
      '</div>' +
      '<div class="lid-tabs" style="display:flex; background:#f8fafc; border-bottom:1px solid #e7ecef; padding:0 15px;">' +
      '<button class="lid-tab-btn active" data-tab="sheet-analytics" style="flex:1; padding:10px; border:none; background:none; cursor:pointer; font-weight:600; font-size:12.5px; color:#274c77; border-bottom:2px solid #274c77;">Analytics</button>' +
      '<button class="lid-tab-btn" data-tab="sheet-formulas" style="flex:1; padding:10px; border:none; background:none; cursor:pointer; font-weight:600; font-size:12.5px; color:#64748b; border-bottom:2px solid transparent;">Formula Library</button>' +
      '</div>' +
      '<div class="lid-body" id="lid-panel-analytics" style="height:calc(100% - 94px); overflow-y:auto;"></div>' +
      '<div class="lid-body" id="lid-panel-formulas" style="display:none; height:calc(100% - 94px); overflow-y:auto; padding:0; background:#f8fafc;"></div>';
    document.body.appendChild(_dashboardEl);

    _dashboardEl.querySelector('.lid-close').addEventListener('click', function () {
      _dashboardEl.classList.remove('open');
    });

    _dashboardEl.querySelectorAll('.lid-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _dashboardEl.querySelectorAll('.lid-tab-btn').forEach(b => {
          b.classList.remove('active');
          b.style.color = '#64748b';
          b.style.borderBottomColor = 'transparent';
        });
        btn.classList.add('active');
        btn.style.color = '#274c77';
        btn.style.borderBottomColor = '#274c77';
        const tabId = btn.dataset.tab;
        _dashboardEl.querySelector('#lid-panel-analytics').style.display = tabId === 'sheet-analytics' ? 'block' : 'none';
        _dashboardEl.querySelector('#lid-panel-formulas').style.display = tabId === 'sheet-formulas' ? 'block' : 'none';
        
        if (tabId === 'sheet-formulas') {
          showFormulaLibrary();
        }
      });
    });
  }

  function openDashboard(activeTab = 'sheet-analytics') {
    initDashboard();
    _dashboardEl.classList.add('open');
    const tabBtn = _dashboardEl.querySelector(`.lid-tab-btn[data-tab="${activeTab}"]`);
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
  }

  async function generateGroqSummary(data, container) {
    const k = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));
    if (!k) {
      container.style.display = 'none';
      return;
    }

    container.innerHTML = '<div style="padding:15px;text-align:center;color:#6096ba;font-size:13px;font-weight:600;"><span style="display:inline-block;animation:pulse 1.5s infinite;">✨ AI is generating an executive summary...</span></div>';

    // Limit data to prevent huge token usage
    const headers = data.headers;
    const rows = data.rows.slice(0, 50); // first 50 rows for context
    let csv = headers.join(',') + '\n';
    rows.forEach(r => csv += r.join(',') + '\n');

    const prompt =
      `You are an expert data analyst. Read the following spreadsheet data sample and write a concise, 2-3 sentence executive summary highlighting key trends, insights, or anomalies.\n\n` +
      `Data:\n${csv}\n\n` +
      `Requirements:\n` +
      `Output ONLY plain text. Do NOT output any HTML, markdown, or bullet points. Keep it professional and brief.`;

    try {
      const response = await window.LenslySummarizer.groqChat(
        [{ role: 'user', content: prompt }],
        '',
        k,
        {
          temperature: 0.3,
          maxTokens: 500
        }
      );

      let text = response.trim();
      container.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">✨ AI Insights</div><div>' + text.replace(/\n/g, '<br>') + '</div>';
    } catch (err) {
      console.warn('Groq summary fail:', err);
      container.style.display = 'none';
    }
  }

  async function generateAnalytics() {
    var data = getData(true);
    openDashboard();
    var container = document.getElementById('lid-panel-analytics');
    if (!container) return;

    if (!data || !data.rows || data.rows.length < 2) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.length > 5) {
          var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
          if (lines.length >= 2) {
            var delim = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
            var parsed = lines.map(function (l) {
              return l.split(delim).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
            });
            if (parsed.length >= 2) {
              data = { headers: parsed[0], rows: parsed.slice(1) };
            }
          }
        }
      } catch (err) {
        console.warn('Clipboard read failed or denied', err);
      }
    }

    if (!data || !data.rows || data.rows.length < 2) {
      container.innerHTML =
        '<div class="lid-empty">' +
        '<div style="font-size:22px;margin-bottom:8px;">:(</div>' +
        '<div style="font-weight:700;margin-bottom:6px;color:#274c77;">No Data Detected</div>' +
        '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Lensly could not automatically read data from this Google Sheet Canvas. <br><br><b>Please highlight your data, press Ctrl+C (or Cmd+C) to copy it, and then click Charts again.</b></div>' +
        '</div>';
      return;
    }

    container.innerHTML = 
      '<div id="lensly-ai-summary" style="padding:15px;background:#f0f6ff;border-radius:8px;margin-bottom:15px;font-size:13px;color:#274c77;border:1px solid #cce0ff;"></div>' +
      '<div id="lensly-local-charts"></div>';

    var summaryContainer = document.getElementById('lensly-ai-summary');
    var chartsContainer = document.getElementById('lensly-local-charts');

    renderCharts(data, chartsContainer);
    generateGroqSummary(data, summaryContainer);
  }

  function renderCharts(data, container) {
    var headers = data.headers, rows = data.rows;

    var numericColCount = 0;
    headers.forEach(function (_, ci) {
      var vals = rows.map(function (r) { return (r[ci] || '').trim(); }).filter(Boolean);
      var nums = vals.map(function (v) { return parseFloat(v.replace(/[^\d.-]/g, '')); }).filter(function (n) { return !isNaN(n); });
      if (nums.length >= 3 && nums.length > vals.length * 0.5) numericColCount++;
    });

    container.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' +
      '<div style="background:#f2f5f8;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Rows</div>' +
      '<div style="font-size:20px;font-weight:700;color:#274c77;">' + rows.length.toLocaleString() + '</div>' +
      '</div>' +
      '<div style="background:#f2f5f8;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Columns</div>' +
      '<div style="font-size:20px;font-weight:700;color:#274c77;">' + headers.length + '</div>' +
      '</div>' +
      '<div style="background:#f2f5f8;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Numeric</div>' +
      '<div style="font-size:20px;font-weight:700;color:#274c77;">' + numericColCount + '</div>' +
      '</div>' +
      '<div style="background:#f2f5f8;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Text</div>' +
      '<div style="font-size:20px;font-weight:700;color:#274c77;">' + (headers.length - numericColCount) + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="lid-section-title">Column Charts</div>' +
      '<div id="lensly-charts-list" style="display:flex;flex-direction:column;gap:12px;margin-top:8px;"></div>';

    var list = document.getElementById('lensly-charts-list');
    var rendered = 0;

    headers.forEach(function (header, ci) {
      if (!header || !header.trim()) return;
      var values = rows.map(function (r) { return (r[ci] || '').trim(); }).filter(Boolean);
      if (values.length < 2) return;
      var nums = values.map(function (v) { return parseFloat(v.replace(/[^\d.-]/g, '')); }).filter(function (n) { return !isNaN(n); });
      var isNumeric = nums.length >= 3 && nums.length > values.length * 0.5;

      var card = document.createElement('div');
      card.className = 'lid-item';
      card.style.cursor = 'default';

      if (isNumeric) {
        nums.sort(function (a, b) { return a - b; });
        var sum = nums.reduce(function (a, b) { return a + b; }, 0);
        var avg = sum / nums.length;
        var min = nums[0], max = nums[nums.length - 1];
        var med = nums[Math.floor(nums.length / 2)];
        card.innerHTML =
          '<div class="lid-item-title">' + header + '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:10px;font-size:11px;text-align:center;">' +
          '<div><div style="color:#64748b;">Min</div><div style="font-weight:700;">' + min.toLocaleString() + '</div></div>' +
          '<div><div style="color:#64748b;">Avg</div><div style="font-weight:700;color:#274c77;">' + avg.toFixed(2) + '</div></div>' +
          '<div><div style="color:#64748b;">Max</div><div style="font-weight:700;">' + max.toLocaleString() + '</div></div>' +
          '<div><div style="color:#64748b;">Sum</div><div style="font-weight:700;">' + sum.toLocaleString() + '</div></div>' +
          '<div><div style="color:#64748b;">Median</div><div style="font-weight:700;">' + med.toLocaleString() + '</div></div>' +
          '<div><div style="color:#64748b;">Count</div><div style="font-weight:700;">' + nums.length + '</div></div>' +
          '</div>' +
          buildBar(nums.slice(0, 30)) +
          (nums.length > 30 ? '<div style="font-size:9.5px;color:#94a3b8;margin-top:4px;text-align:center;">Note: Chart shows first 30 values. Statistics use all ' + nums.length.toLocaleString() + ' values.</div>' : '');
      } else {
        card.innerHTML =
          '<div class="lid-item-title">' + header + '</div>' +
          buildDonut(values);
      }

      list.appendChild(card);
      rendered++;
    });

    if (!rendered) {
      list.innerHTML = '<div class="lid-empty">No chartable columns found. Make sure columns have numeric or categorical data.</div>';
    }
  }

  function buildBar(nums) {
    var W = 285, H = 120, pL = 42, pR = 8, pT = 8, pB = 22;
    var cW = W - pL - pR, cH = H - pT - pB;
    var minV = Math.min.apply(null, [0].concat(nums));
    var maxV = Math.max.apply(null, [1].concat(nums));
    var range = maxV - minV || 1;
    var bw = (cW / nums.length) * 0.68, gap = (cW / nums.length) * 0.32;
    var grid = '', bars = '', labels = '';
    [0, 1, 2, 3].forEach(function (i) {
      var y = pT + cH - (i / 3) * cH;
      var v = minV + (i / 3) * range;
      grid += '<line x1="' + pL + '" y1="' + y + '" x2="' + (W - pR) + '" y2="' + y + '" stroke="#e7ecef" stroke-width="1"/>';
      grid += '<text x="' + (pL - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8.5" fill="#94a3b8">' + Math.round(v).toLocaleString() + '</text>';
    });
    nums.forEach(function (val, i) {
      var x = pL + i * (bw + gap) + gap / 2;
      var bh = Math.max(((val - minV) / range) * cH, 2);
      var y = pT + cH - bh;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" fill="#6096ba" rx="2"><title>' + val.toLocaleString() + '</title></rect>';
      if (nums.length <= 10) labels += '<text x="' + (x + bw / 2) + '" y="' + (H - pB + 13) + '" text-anchor="middle" font-size="7.5" fill="#94a3b8">' + (i + 1) + '</text>';
    });
    return '<svg width="' + W + '" height="' + H + '" style="display:block;overflow:visible;">' +
      grid +
      '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="#d0d9e2"/>' +
      '<line x1="' + pL + '" y1="' + pT + '" x2="' + pL + '" y2="' + (H - pB) + '" stroke="#d0d9e2"/>' +
      bars + labels + '</svg>';
  }

  function buildDonut(values) {
    var freq = {};
    values.forEach(function (v) { freq[v] = (freq[v] || 0) + 1; });
    var sorted = Object.entries(freq).sort(function (a, b) { return b[1] - a[1]; });
    var total = values.length;
    if (sorted.length > 5) {
      var top4 = sorted.slice(0, 4);
      var rest = sorted.slice(4).reduce(function (s, x) { return s + x[1]; }, 0);
      sorted = top4.concat([['Other', rest]]);
    }
    var COLORS = ['#274c77', '#6096ba', '#a3cef1', '#f5c26b', '#86efac', '#f9a8d4'];
    var cx = 60, cy = 60, r = 38;
    var angle = -Math.PI / 2, slices = '', legend = '';
    sorted.forEach(function (item, i) {
      var label = item[0], count = item[1];
      var pct = count / total;
      var sweep = pct * 2 * Math.PI;
      var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      var x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep);
      var large = sweep > Math.PI ? 1 : 0;
      var c = COLORS[i % COLORS.length];
      slices += '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
        ' Z" fill="' + c + '" opacity="0.9"><title>' + label + ': ' + count + ' (' + Math.round(pct * 100) + '%)</title></path>';
      angle += sweep;
      var short = label.length > 16 ? label.slice(0, 15) + '\u2026' : label;
      legend += '<div style="display:flex;align-items:center;gap:5px;font-size:10.5px;margin-bottom:4px;">' +
        '<span style="width:9px;height:9px;background:' + c + ';border-radius:2px;flex-shrink:0;"></span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;">' + short + '</span>' +
        '<span style="color:#64748b;white-space:nowrap;">' + count + ' (' + Math.round(pct * 100) + '%)</span>' +
        '</div>';
    });
    return '<div style="display:flex;align-items:center;gap:10px;">' +
      '<svg width="120" height="120" style="flex-shrink:0;">' + slices +
      '<circle cx="' + cx + '" cy="' + cy + '" r="22" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#274c77">' + total + '</text>' +
      '</svg>' +
      '<div style="flex:1;min-width:0;">' + legend + '</div>' +
      '</div>';
  }

  function showFormulaLibrary() {
    openDashboard('sheet-formulas');
    var container = document.getElementById('lid-panel-formulas');
    if (!container) return;
    
    if (container.innerHTML.trim() !== '') return;

    var html = '<div style="padding:15px; background:#f8fafc; min-height:100%;">';
    FORMULAS.forEach(f => {
      html += '<div style="margin-bottom:12px; border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#ffffff; box-shadow:0 1px 2px rgba(0,0,0,0.02);">';
      html += '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">';
      html += '<div><div style="font-weight:700; color:#0f172a; font-size:13.5px; margin-bottom:3px;">' + f.n + '</div><div style="color:#64748b; font-size:12px; line-height:1.4;">' + f.d + '</div></div>';
      html += '<button class="lfl-copy" data-formula=\'' + f.e.replace(/\'/g, "&apos;") + '\' style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; flex-shrink:0; transition:all 0.2s;">Copy</button>';
      html += '</div>';
      html += '<code style="display:block; background:#f1f5f9; color:#0369a1; padding:8px 12px; border-radius:6px; font-size:12px; font-family:\'Fira Code\', monospace; border:1px solid #e2e8f0; overflow-x:auto;">' + f.e + '</code>';
      html += '</div>';
    });
    html += '</div>';
    
    container.innerHTML = html;
    
    container.querySelectorAll('.lfl-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        var formula = btn.dataset.formula;
        var successCb = () => {
          var original = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.background = '#dcfce7';
          btn.style.color = '#166534';
          btn.style.borderColor = '#bbf7d0';
          setTimeout(() => {
            btn.textContent = original;
            btn.style.background = '#f1f5f9';
            btn.style.color = '#0f172a';
            btn.style.borderColor = '#cbd5e1';
          }, 2000);
        };
        var fallbackCb = () => {
          try {
            var ta = document.createElement('textarea');
            ta.value = formula;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            successCb();
          } catch(e) { console.error('Copy failed', e); }
        };
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(formula).then(successCb).catch(fallbackCb);
        } else {
          fallbackCb();
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // TOOLBAR — uses existing CSS: #lensly-sheet-toolbar .lst-btn .lst-label .lst-close
  // from content.css. NO inline styles on the toolbar itself.
  // ════════════════════════════════════════════════════════════
  function injectToolbar() {
    if (_toolbarInjected || document.getElementById('lensly-sheet-toolbar')) return;
    if (!getSheetPlatform()) return;

    var toolbar = document.createElement('div');
    toolbar.id = 'lensly-sheet-toolbar';
    // Use .lst-label, .lst-btn, .lst-close exactly as defined in content.css
    toolbar.innerHTML =
      '<span class="lst-label">Lensly</span>' +
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;' +
      'color:#fff;font-size:11.5px;font-weight:600;white-space:nowrap;">' +
      '<input type="checkbox" id="lst-tracker-toggle" ' +
      'style="cursor:pointer;accent-color:#a3cef1;margin:0;"/>' +
      'Cell Tracker' +
      '</label>' +
      '<button class="lst-btn" data-action="sheetAnalytics">Charts</button>' +
      '<button class="lst-btn" data-action="formulaLibrary">Formulas</button>' +
      '<button class="lst-close" data-action="close">&times;</button>';

    document.body.appendChild(toolbar);
    _toolbarInjected = true;

    // Restore saved tracker state
    try {
      chrome.storage.sync.get('lenslyTracker', function (saved) {
        var on = !!(saved && saved.lenslyTracker);
        var cb = toolbar.querySelector('#lst-tracker-toggle');
        if (cb) cb.checked = on;
        if (on) toggleTracker(true);
      });
    } catch (_) { }

    toolbar.querySelector('#lst-tracker-toggle').addEventListener('change', function (e) {
      toggleTracker(e.target.checked);
      try { chrome.storage.sync.set({ lenslyTracker: e.target.checked }); } catch (_) { }
    });

    toolbar.addEventListener('click', function (e) {
      var action = e.target.dataset && e.target.dataset.action;
      if (!action) return;
      if (action === 'close') {
        toolbar.remove();
        _toolbarInjected = false;
        clearTrackerOverlays();
        toggleTracker(false);
        if (_suggestEl) _suggestEl.style.display = 'none';
        return;
      }
      if (action === 'sheetAnalytics') {
        try { generateAnalytics(); } catch (err) { alert('Lensly: ' + err.message); }
      }
      if (action === 'formulaLibrary') showFormulaLibrary();
    });

    // Init formula suggestions
    initFormulaSuggest();
  }

  function autoInit() {
    let attempts = 0;
    const check = () => {
      const platform = getSheetPlatform();
      if (platform) {
        // Platform is confirmed. Now we can listen for tracker changes in this frame.
        try {
          chrome.storage.sync.get('lenslyTracker', function (saved) {
            if (saved && saved.lenslyTracker) toggleTracker(true);
          });
          chrome.storage.onChanged.addListener(function (changes) {
            if (changes.lenslyTracker) {
               var on = changes.lenslyTracker.newValue;
               var cb = document.querySelector('#lst-tracker-toggle');
               if (cb) cb.checked = on;
               toggleTracker(on);
            }
          });
        } catch(e) {}

        injectToolbar();
      } else if (attempts < 15) {
        attempts++;
        setTimeout(check, 2000);
      }
    };
    setTimeout(check, 1500);
  }

  return {
    generateAnalytics: generateAnalytics,
    getData: getData,
    injectToolbar: injectToolbar,
    autoInit: autoInit,
    getSheetPlatform: getSheetPlatform,
    toggleTracker: toggleTracker,
    openDashboard: openDashboard,
  };
})();

window.LenslySheetTools.autoInit();